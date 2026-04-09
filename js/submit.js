/**
 * Submit proof page (submit.html?task=ID&day=N).
 */

import { updateAuthUI, getSession } from './auth.js';
import { fetchTaskById, fetchTeamSubmissions, aggregateSubmissions } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

let selectedFiles = [];

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();

    const session = getSession();
    const noAuth = document.getElementById('no-auth');
    const form = document.getElementById('submit-form');

    if (!session) {
        noAuth.style.display = '';
        form.style.display = 'none';
        return;
    }

    noAuth.style.display = 'none';
    form.style.display = '';

    // Parse params
    const params = new URLSearchParams(window.location.search);
    const taskId = parseInt(params.get('task'), 10);
    const dayNum = parseInt(params.get('day'), 10);

    let reqPieces = 1;
    if (taskId) {
        const task = await fetchTaskById(taskId);
        if (task) {
            reqPieces = task.required_pieces || 1;
            document.getElementById('submit-heading').textContent = `Submit: Day ${dayNum || task.day_number} — ${task.title}`;
            let infoText = `${task.points} points (${task.points >= 6 ? 'Gold' : task.points >= 3 ? 'Silver' : 'Bronze'})`;
            if (reqPieces > 1) infoText += ` — ${reqPieces} pieces required`;
            document.getElementById('submit-task-info').textContent = infoText;

            // Always show "what did you get?" label field
            const piecesRow = document.getElementById('pieces-row');
            const piecesLabel = document.getElementById('pieces-label');

            if (reqPieces > 1 && session?.team_id) {
                const subs = await fetchTeamSubmissions(session.team_id);
                const progress = aggregateSubmissions(subs);
                const tp = progress[taskId] || { approved_pieces: 0, approved_labels: [], pending_labels: [] };

                // Status summary of what's already submitted
                let statusHtml = `<strong>Progress: ${tp.approved_pieces}/${reqPieces} approved</strong>`;
                if (tp.approved_labels.length || tp.pending_labels.length) {
                    const items = [
                        ...tp.approved_labels.map(l => `<li>✅ ${l}</li>`),
                        ...tp.pending_labels.map(l => `<li>⏳ ${l} <em>(pending review)</em></li>`),
                    ].join('');
                    statusHtml += `<ul style="margin:4px 0 8px 16px">${items}</ul>`;
                }
                piecesLabel.innerHTML = statusHtml + 'What item are you submitting? <span style="color:#e74c3c">*</span>';
            } else {
                piecesLabel.textContent = 'What item are you submitting? (optional)';
            }

            // Replace number input with a text field
            const oldInput = document.getElementById('pieces-input');
            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.id = 'pieces-input';
            textInput.className = 'form-input';
            textInput.placeholder = 'e.g. Royal Sight';
            textInput.maxLength = 100;
            if (reqPieces > 1) textInput.required = true;
            textInput.style.maxWidth = '300px';
            oldInput.replaceWith(textInput);

            piecesRow.style.display = '';
        }
    }

    // Timeslot check
    if (session.timeslot_start) {
        if (!isWithinTimeslot(session)) {
            const errEl = document.getElementById('timeslot-error');
            const hours = session.timeslot_hours || 4;
            const [h, m] = session.timeslot_start.split(':').map(Number);
            const endH = (h + hours) % 24;
            const endStr = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            errEl.textContent =
                `It is not ${session.team_name}'s time slot! Your window is ${session.timeslot_start} to ${endStr} UTC.`;
            errEl.style.display = '';
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('submit-btn').style.display = 'none';
            return;
        }
    }

    // Upload area
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewArea = document.getElementById('preview-area');
    const submitBtn = document.getElementById('submit-btn');

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        addFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        addFiles(fileInput.files);
        fileInput.value = '';
    });

    function addFiles(fileList) {
        for (const f of fileList) {
            if (selectedFiles.length >= 4) break;
            if (!f.type.startsWith('image/')) continue;
            selectedFiles.push(f);
        }
        renderPreviews();
    }

    function renderPreviews() {
        previewArea.innerHTML = '';
        selectedFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            const img = document.createElement('img');
            img.src = url;
            img.className = 'preview-thumb';
            img.title = f.name;
            img.addEventListener('click', () => {
                selectedFiles.splice(i, 1);
                renderPreviews();
            });
            previewArea.appendChild(img);
        });
        submitBtn.disabled = selectedFiles.length === 0;
    }

    // Submit
    submitBtn.addEventListener('click', async () => {
        if (!selectedFiles.length) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        const statusEl = document.getElementById('submit-status');

        try {
            // Convert files to base64 for the Edge Function
            const attachments = await Promise.all(selectedFiles.map(async f => {
                const buf = await f.arrayBuffer();
                const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
                return { filename: f.name, content_type: f.type, data: b64 };
            }));

            const taskId = parseInt(params.get('task'), 10) || null;

            const pieceLabel = document.getElementById('pieces-input')?.value?.trim() || null;

            if (reqPieces > 1 && !pieceLabel) {
                statusEl.textContent = 'Please enter the item you are submitting before continuing.';
                statusEl.style.color = '#e74c3c';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit';
                document.getElementById('pieces-input')?.focus();
                return;
            }

            const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-proof`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
                body: JSON.stringify({
                    team_id: session.team_id,
                    task_id: taskId,
                    discord_id: session.discord_id,
                    rsn: session.rsn,
                    attachments,
                    pieces: 1,
                    piece_label: pieceLabel,
                }),
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            statusEl.textContent = 'Submitted successfully! Waiting for admin approval.';
            statusEl.style.color = '#2ecc71';
            submitBtn.textContent = 'Submitted';
        } catch (err) {
            console.error('submit error', err);
            statusEl.textContent = err.message || 'Submission failed.';
            statusEl.style.color = '#e74c3c';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        }
    });
});

function isWithinTimeslot(session) {
    if (!session.timeslot_start) return true;

    const now = new Date();
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    const [startH, startM] = session.timeslot_start.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const hours = session.timeslot_hours || 4;
    const endMinutes = startMinutes + hours * 60;

    if (endMinutes > 1440) {
        // Overnight
        return nowMinutes >= startMinutes || nowMinutes <= (endMinutes - 1440);
    }
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}
