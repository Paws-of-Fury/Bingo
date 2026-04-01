/**
 * Admin page — task management.
 * Fetches service_role key from bingo_config after passphrase validation.
 */

import { SUPABASE_URL, SUPABASE_ANON, TOTAL_DAYS, DOUBLE_POINTS_DAY, currentDay } from './config.js';
import { updateAuthUI } from './auth.js';

const ADMIN_KEY = 'bingo_admin';
let adminClient = null;

function getAdminPass() {
    try { return localStorage.getItem(ADMIN_KEY); } catch { return null; }
}

function setAdminPass(pass) {
    localStorage.setItem(ADMIN_KEY, pass);
}

function clearAdmin() {
    localStorage.removeItem(ADMIN_KEY);
    adminClient = null;
}

/** Get a basic anon client for validation calls. */
function anonClient() {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
}

/** Validate passphrase via RPC. */
async function validateAdmin(pass) {
    const sb = anonClient();
    const { data, error } = await sb.rpc('validate_admin', { pass });
    if (error) { console.error('validate_admin', error); return false; }
    return data === true;
}

/** Fetch service_role key from bingo_config via SECURITY DEFINER RPC. */
async function fetchServiceKey(pass) {
    const sb = anonClient();
    const { data, error } = await sb.rpc('get_service_key', { pass });
    if (error) { console.error('get_service_key', error); return null; }
    return data;
}

/** Create an admin Supabase client using the service_role key. */
function getAdminClient(serviceKey) {
    if (adminClient) return adminClient;
    adminClient = window.supabase.createClient(SUPABASE_URL, serviceKey);
    return adminClient;
}

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();

    const loginSection = document.getElementById('admin-login');
    const panel = document.getElementById('admin-panel');
    const passInput = document.getElementById('admin-pass-input');
    const loginBtn = document.getElementById('admin-login-btn');
    const loginError = document.getElementById('admin-login-error');
    const logoutBtn = document.getElementById('admin-logout-btn');

    // Check if already logged in as admin
    const savedPass = getAdminPass();
    if (savedPass) {
        const valid = await validateAdmin(savedPass);
        if (valid) {
            await showPanel(savedPass);
        } else {
            clearAdmin();
        }
    }

    // Login
    loginBtn.addEventListener('click', async () => {
        const pass = passInput.value.trim();
        if (!pass) return;
        loginBtn.disabled = true;
        loginBtn.textContent = 'Checking…';
        loginError.style.display = 'none';

        const valid = await validateAdmin(pass);
        if (valid) {
            setAdminPass(pass);
            await showPanel(pass);
        } else {
            loginError.textContent = 'Invalid admin passphrase.';
            loginError.style.display = '';
        }
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login as Admin';
    });

    // Enter key on input
    passInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
        clearAdmin();
        panel.style.display = 'none';
        loginSection.style.display = '';
        passInput.value = '';
    });

    async function showPanel(pass) {
        loginSection.style.display = 'none';
        panel.style.display = '';

        // Fetch service key from DB
        const serviceKey = await fetchServiceKey(pass);
        if (!serviceKey) {
            loginError.textContent = 'Failed to fetch service key.';
            loginError.style.display = '';
            panel.style.display = 'none';
            loginSection.style.display = '';
            return;
        }
        initAdmin(serviceKey);
    }
});

/** Initialise the admin panel. */
async function initAdmin(serviceKey) {
    const sb = getAdminClient(serviceKey);

    const saveBtn = document.getElementById('task-save-btn');
    const cancelBtn = document.getElementById('task-cancel-btn');
    const editIdField = document.getElementById('edit-task-id');
    const statusEl = document.getElementById('task-save-status');

    // Load tasks + submissions
    await loadTasks(sb);
    await populateSubmissionFilters(sb);
    await loadSubmissions(sb, 'pending');

    // Status filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await loadSubmissions(sb, btn.dataset.filter);
        });
    });

    // Team / task dropdowns
    document.getElementById('filter-team').addEventListener('change', async () => {
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
        await loadSubmissions(sb, activeFilter);
    });
    document.getElementById('filter-task').addEventListener('change', async () => {
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
        await loadSubmissions(sb, activeFilter);
    });

    // ── Add Submission form ──────────────────────────────────────────
    initAddSubmissionForm(sb);

    // Save task
    saveBtn.addEventListener('click', async () => {
        const dayNum = parseInt(document.getElementById('task-day').value, 10);
        const title = document.getElementById('task-title').value.trim();
        const desc = document.getElementById('task-desc').value.trim() || null;
        const img = document.getElementById('task-image').value.trim() || null;
        const pts = parseInt(document.getElementById('task-points').value, 10) || 1;
        const reqPieces = parseInt(document.getElementById('task-pieces').value, 10) || 1;
        const editId = editIdField.value;

        if (!dayNum || dayNum < 1 || (dayNum > TOTAL_DAYS && dayNum !== 100)) {
            statusEl.textContent = `Day must be between 1 and ${TOTAL_DAYS} (or 100 for testing).`;
            statusEl.style.color = '#e74c3c';
            return;
        }
        if (!title) {
            statusEl.textContent = 'Title is required.';
            statusEl.style.color = '#e74c3c';
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
            if (editId) {
                const { error } = await sb
                    .from('bingo_tasks')
                    .update({ day_number: dayNum, title, description: desc, image_url: img, points: pts, required_pieces: reqPieces })
                    .eq('id', parseInt(editId, 10));
                if (error) throw error;
                statusEl.textContent = 'Task updated!';
            } else {
                const { error } = await sb
                    .from('bingo_tasks')
                    .insert({ day_number: dayNum, title, description: desc, image_url: img, points: pts, required_pieces: reqPieces, active: true });
                if (error) throw error;
                statusEl.textContent = 'Task added!';
            }
            statusEl.style.color = '#2ecc71';
            clearForm();
            await loadTasks(sb);
        } catch (err) {
            console.error('save task', err);
            statusEl.textContent = err.message || 'Failed to save task.';
            statusEl.style.color = '#e74c3c';
        }
        saveBtn.disabled = false;
        saveBtn.textContent = editId ? 'Update Task' : 'Add Task';
    });

    // Cancel edit
    cancelBtn.addEventListener('click', () => {
        clearForm();
    });
}

function clearForm() {
    document.getElementById('edit-task-id').value = '';
    document.getElementById('task-day').value = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-image').value = '';
    document.getElementById('task-points').value = '1';
    document.getElementById('task-pieces').value = '1';
    document.getElementById('task-save-btn').textContent = 'Add Task';
    document.getElementById('task-cancel-btn').style.display = 'none';
    document.getElementById('task-save-status').textContent = '';
}

function populateForm(task) {
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('task-day').value = task.day_number;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description || '';
    document.getElementById('task-image').value = task.image_url || '';
    document.getElementById('task-points').value = task.points;
    document.getElementById('task-pieces').value = task.required_pieces || 1;
    document.getElementById('task-save-btn').textContent = 'Update Task';
    document.getElementById('task-cancel-btn').style.display = '';
    document.getElementById('task-save-status').textContent = '';
    document.getElementById('task-day').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadAddSubmMembers(sb, teamSel, submSel) {
    submSel.innerHTML = '<option value="">Loading…</option>';
    if (!teamSel.value) {
        submSel.innerHTML = '<option value="">Select a team first</option>';
        return;
    }
    const { data: members } = await sb
        .from('bingo_team_members')
        .select('rsn, discord_id')
        .eq('team_id', teamSel.value)
        .order('rsn');
    submSel.innerHTML = (members || []).map(m =>
        `<option value="${escapeHTML(m.discord_id || '')}|${escapeHTML(m.rsn)}">${escapeHTML(m.rsn)}</option>`
    ).join('') || '<option value="">No members found</option>';
}

/** Wire up the manual add-submission form. */
function initAddSubmissionForm(sb) {
    const toggleBtn = document.getElementById('add-sub-toggle-btn');
    const form      = document.getElementById('add-sub-form');
    const teamSel   = document.getElementById('add-sub-team');
    const taskSel   = document.getElementById('add-sub-task');
    const submSel   = document.getElementById('add-sub-submitter');
    const itemsList = document.getElementById('add-sub-items-list');
    const msgEl     = document.getElementById('add-sub-status-msg');

    // Populate team + task dropdowns from the filter selects (already populated)
    const copyOptions = (src, dest) => {
        dest.innerHTML = '';
        for (const opt of src.options) {
            if (!opt.value) continue;
            dest.appendChild(opt.cloneNode(true));
        }
    };

    toggleBtn.addEventListener('click', async () => {
        const open = form.style.display !== 'none';
        form.style.display = open ? 'none' : '';
        if (!open) {
            copyOptions(document.getElementById('filter-team'), teamSel);
            copyOptions(document.getElementById('filter-task'), taskSel);
            renderAddItems([]);
            renderAddUrls([]);
            msgEl.textContent = '';
            // Auto-load members for whichever team is selected by default
            if (teamSel.value) {
                await loadAddSubmMembers(sb, teamSel, submSel);
            } else {
                submSel.innerHTML = '<option value="">Select a team first</option>';
            }
        }
    });

    document.getElementById('add-sub-cancel-btn').addEventListener('click', () => {
        form.style.display = 'none';
    });

    // When team changes, load its members into the submitter dropdown
    teamSel.addEventListener('change', () => loadAddSubmMembers(sb, teamSel, submSel));

    function renderAddItems(items) {
        itemsList.innerHTML = '';
        (items.length ? items : []).forEach(val => addItemRow(val));
    }

    function addItemRow(val = '') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
        wrap.innerHTML = `
            <input type="text" class="form-input add-sub-item-input" style="padding:5px 8px;font-size:13px;flex:1;" placeholder="e.g. Royal Sight" value="${escapeHTML(val)}">
            <button class="btn btn-outline" style="padding:4px 8px;font-size:12px;border-color:#e74c3c;color:#e74c3c;" title="Remove">✕</button>
        `;
        wrap.querySelector('button').addEventListener('click', () => wrap.remove());
        itemsList.appendChild(wrap);
    }

    document.getElementById('add-sub-add-item-btn').addEventListener('click', () => addItemRow());

    const urlsList = document.getElementById('add-sub-urls-list');
    function renderAddUrls(urls) {
        urlsList.innerHTML = '';
        (urls.length ? urls : []).forEach(val => addUrlRow(val));
    }

    function addUrlRow(val = '') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
        wrap.innerHTML = `
            <input type="text" class="form-input add-sub-url-input" style="padding:5px 8px;font-size:13px;flex:1;" placeholder="https://..." value="${escapeHTML(val)}">
            <button class="btn btn-outline" style="padding:4px 8px;font-size:12px;border-color:#e74c3c;color:#e74c3c;" title="Remove">✕</button>
        `;
        wrap.querySelector('button').addEventListener('click', () => wrap.remove());
        urlsList.appendChild(wrap);
    }

    document.getElementById('add-sub-add-url-btn').addEventListener('click', () => addUrlRow());

    document.getElementById('add-sub-save-btn').addEventListener('click', async () => {
        const teamId = teamSel.value;
        const taskId = taskSel.value;
        const status = document.getElementById('add-sub-status').value;
        const submVal = submSel.value;

        msgEl.textContent = '';
        if (!teamId || !taskId) {
            msgEl.textContent = 'Please select a team and task.';
            msgEl.style.color = '#e74c3c';
            return;
        }

        const [discordId, rsn] = submVal ? submVal.split('|') : ['', ''];
        const labels = [...itemsList.querySelectorAll('.add-sub-item-input')]
            .map(i => i.value.trim()).filter(Boolean);
        const pieceLabel = labels.length ? labels.join(', ') : null;

        const imageUrls = [...document.querySelectorAll('.add-sub-url-input')]
            .map(i => i.value.trim()).filter(Boolean);

        const saveBtn = document.getElementById('add-sub-save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        const { error } = await sb.from('bingo_submissions').insert({
            team_id: teamId,
            task_id: taskId,
            status,
            submitted_by_rsn: rsn || null,
            submitted_by_discord_id: discordId || null,
            piece_label: pieceLabel,
            pieces: labels.length || 1,
            source: 'website',
            attachments: imageUrls,
        });

        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Submission';

        if (error) {
            msgEl.textContent = 'Failed: ' + error.message;
            msgEl.style.color = '#e74c3c';
        } else {
            msgEl.textContent = 'Submission added!';
            msgEl.style.color = '#2ecc71';
            renderAddItems([]);
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
            await loadSubmissions(sb, activeFilter);
        }
    });
}

/** Load and render all tasks grouped by day. */
async function loadTasks(sb) {
    const container = document.getElementById('tasks-list');
    container.innerHTML = '<p class="text-muted">Loading…</p>';

    const { data: tasks, error } = await sb
        .from('bingo_tasks')
        .select('*')
        .eq('active', true)
        .order('day_number')
        .order('id');

    if (error) {
        container.innerHTML = '<p style="color:#e74c3c;">Failed to load tasks.</p>';
        console.error('loadTasks', error);
        return;
    }

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="text-muted">No tasks yet. Add one above.</p>';
        return;
    }

    // Group by day
    const byDay = {};
    for (const t of tasks) {
        if (!byDay[t.day_number]) byDay[t.day_number] = [];
        byDay[t.day_number].push(t);
    }

    container.innerHTML = '';

    const allDays = new Set();
    for (let d = 1; d <= TOTAL_DAYS; d++) allDays.add(d);
    for (const d of Object.keys(byDay)) allDays.add(parseInt(d, 10));
    const sortedDays = [...allDays].sort((a, b) => a - b);

    for (const d of sortedDays) {
        const dayTasks = byDay[d];
        if (!dayTasks) continue;

        const label = d > TOTAL_DAYS ? `Day ${d} (TEST)` : `Day ${d}`;
        const section = document.createElement('div');
        section.className = 'admin-day-section';
        section.innerHTML = `<h4 class="admin-day-heading">${label} (${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''})</h4>`;

        for (const t of dayTasks) {
            const tier = t.points >= 6 ? 'Gold' : t.points >= 3 ? 'Silver' : 'Bronze';
            const reqPcs = t.required_pieces || 1;
            const pcsLabel = reqPcs > 1 ? ` × ${reqPcs} pieces` : '';
            const row = document.createElement('div');
            row.className = 'admin-task-row';
            row.innerHTML = `
                <div class="admin-task-info">
                    <span class="admin-task-title">${escapeHTML(t.title)}</span>
                    <span class="admin-task-pts">${t.points} pts (${tier})${pcsLabel}</span>
                </div>
                <div class="admin-task-actions">
                    <button class="btn btn-outline admin-edit-btn" data-id="${t.id}">Edit</button>
                    <button class="btn btn-outline admin-delete-btn" data-id="${t.id}" style="border-color:#e74c3c;color:#e74c3c;">Delete</button>
                </div>
            `;
            section.appendChild(row);

            row.querySelector('.admin-edit-btn').addEventListener('click', () => {
                populateForm(t);
            });

            row.querySelector('.admin-delete-btn').addEventListener('click', async () => {
                if (!confirm(`Delete "${t.title}"?`)) return;
                const { error } = await sb.from('bingo_tasks').delete().eq('id', t.id);
                if (error) {
                    alert('Delete failed: ' + error.message);
                } else {
                    await loadTasks(sb);
                    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
                    await loadSubmissions(sb, activeFilter);
                }
            });
        }

        container.appendChild(section);
    }
}

/** Populate team and task filter dropdowns. */
async function populateSubmissionFilters(sb) {
    const [{ data: teams }, { data: tasks }] = await Promise.all([
        sb.from('bingo_teams').select('id, name').order('name'),
        sb.from('bingo_tasks').select('id, title, day_number').eq('active', true).order('day_number').order('id'),
    ]);

    const teamSel = document.getElementById('filter-team');
    for (const t of (teams || [])) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        teamSel.appendChild(opt);
    }

    const taskSel = document.getElementById('filter-task');
    for (const t of (tasks || [])) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `Day ${t.day_number}: ${t.title}`;
        taskSel.appendChild(opt);
    }
}

/** Load and render submissions filtered by status, team, and task. */
async function loadSubmissions(sb, filter) {
    const container = document.getElementById('submissions-list');
    container.innerHTML = '<p class="text-muted">Loading…</p>';

    const teamId = document.getElementById('filter-team')?.value || '';
    const taskId = document.getElementById('filter-task')?.value || '';

    let query = sb
        .from('bingo_submissions')
        .select('*, bingo_teams(name, colour), bingo_tasks(title, day_number, points)')
        .order('created_at', { ascending: false });

    if (filter && filter !== 'all') {
        query = query.eq('status', filter);
    }
    if (teamId) query = query.eq('team_id', teamId);
    if (taskId) query = query.eq('task_id', taskId);

    const { data: subs, error } = await query;

    if (error) {
        container.innerHTML = '<p style="color:#e74c3c;">Failed to load submissions.</p>';
        console.error('loadSubmissions', error);
        return;
    }

    if (!subs || subs.length === 0) {
        container.innerHTML = `<p class="text-muted">No ${filter === 'all' ? '' : filter + ' '}submissions.</p>`;
        return;
    }

    container.innerHTML = '';

    for (const s of subs) {
        const teamName = s.bingo_teams?.name || 'Unknown Team';
        const teamColour = s.bingo_teams?.colour || '#e94560';
        const taskTitle = s.bingo_tasks?.title || 'Unknown Task';
        const dayNum = s.bingo_tasks?.day_number || '?';
        const pts = s.bingo_tasks?.points || 0;
        const submitter = s.submitted_by_rsn || s.submitted_by_discord_id || 'Unknown';
        const date = new Date(s.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const source = s.source === 'website' ? 'Web' : 'Discord';

        const attachments = Array.isArray(s.attachments) ? s.attachments : [];

        const row = document.createElement('div');
        row.className = `sub-row sub-${s.status}`;

        let statusBadge = '';
        if (s.status === 'approved') {
            statusBadge = '<span class="sub-badge sub-badge-approved">Approved</span>';
        } else if (s.status === 'denied') {
            statusBadge = '<span class="sub-badge sub-badge-denied">Denied</span>';
        } else {
            statusBadge = '<span class="sub-badge sub-badge-pending">Pending</span>';
        }

        let imagesHTML = '';
        if (attachments.length > 0) {
            imagesHTML = '<div class="sub-images">';
            for (const att of attachments) {
                const url = typeof att === 'string' ? att : att.url || att.proxy_url || '';
                if (url) {
                    imagesHTML += `<a href="${escapeHTML(url)}" target="_blank" rel="noopener"><img class="sub-thumb" src="${escapeHTML(url)}" alt="proof"></a>`;
                }
            }
            imagesHTML += '</div>';
        }

        const pieceItems = s.piece_label ? s.piece_label.split(',').map(p => p.trim()).filter(Boolean) : [];
        const pieceLabel = pieceItems.length
            ? pieceItems.map(p => `<span class="sub-piece-label">🔹 ${escapeHTML(p)}</span>`).join('')
            : '';

        let actionsHTML = '';
        if (s.status === 'pending') {
            actionsHTML = `
                <div class="sub-actions">
                    <button class="btn btn-outline sub-approve-btn" data-id="${s.id}" style="border-color:#2ecc71;color:#2ecc71;">Approve</button>
                    <button class="btn btn-outline sub-deny-btn" data-id="${s.id}" style="border-color:#e74c3c;color:#e74c3c;">Deny</button>
                    <button class="btn btn-outline sub-edit-btn" data-id="${s.id}">Edit</button>
                </div>`;
        } else {
            actionsHTML = `
                <div class="sub-actions">
                    <button class="btn btn-outline sub-edit-btn" data-id="${s.id}">Edit</button>
                </div>`;
        }

        row.innerHTML = `
            <div class="sub-header">
                <div class="sub-info">
                    <span class="sub-team" style="color:${escapeHTML(teamColour)}">${escapeHTML(teamName)}</span>
                    <span class="sub-task">Day ${dayNum}: ${escapeHTML(taskTitle)} (${pts} pts${s.pieces > 1 ? `, ${s.pieces} pcs` : ''})</span>
                    ${pieceLabel}
                </div>
                ${statusBadge}
            </div>
            <div class="sub-meta">
                <span>By: ${escapeHTML(submitter)}</span>
                <span>${source} • ${date}</span>
            </div>
            ${imagesHTML}
            ${actionsHTML}
            <div class="sub-edit-form" style="display:none;margin-top:0.75rem;padding:0.75rem;background:#1a1a2e;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem;">
                    <div>
                        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">Status</label>
                        <select class="sub-edit-status form-input" style="padding:6px 8px;font-size:13px;">
                            <option value="pending" ${s.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="approved" ${s.status === 'approved' ? 'selected' : ''}>Approved</option>
                            <option value="denied" ${s.status === 'denied' ? 'selected' : ''}>Denied</option>
                        </select>
                    </div>
                    <div style="flex:1;min-width:160px;">
                        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">Submitted by</label>
                        <select class="sub-edit-submitter form-input" style="padding:6px 8px;font-size:13px;width:100%;">
                            <option value="">Loading members…</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">Items submitted</label>
                    <div class="sub-items-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;"></div>
                    <button class="btn btn-outline sub-add-item-btn" style="font-size:12px;padding:4px 10px;">+ Add item</button>
                </div>
                <div style="display:flex;gap:0.5rem;margin-top:0.6rem;">
                    <button class="btn btn-gold sub-save-btn" style="padding:6px 14px;font-size:13px;">Save</button>
                    <button class="btn btn-outline sub-cancel-btn" style="padding:6px 14px;font-size:13px;">Cancel</button>
                </div>
                <p class="sub-edit-status-msg" style="margin-top:0.4rem;font-size:12px;"></p>
            </div>
        `;

        container.appendChild(row);

        const approveBtn = row.querySelector('.sub-approve-btn');
        if (approveBtn) {
            approveBtn.addEventListener('click', async () => {
                if (!confirm(`Approve submission from ${teamName}?`)) return;
                approveBtn.disabled = true;
                approveBtn.textContent = '…';
                const { error } = await sb
                    .from('bingo_submissions')
                    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
                    .eq('id', s.id);
                if (error) {
                    alert('Failed to approve: ' + error.message);
                    approveBtn.disabled = false;
                    approveBtn.textContent = 'Approve';
                } else {
                    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
                    await loadSubmissions(sb, activeFilter);
                }
            });
        }

        const denyBtn = row.querySelector('.sub-deny-btn');
        if (denyBtn) {
            denyBtn.addEventListener('click', async () => {
                if (!confirm(`Deny submission from ${teamName}?`)) return;
                denyBtn.disabled = true;
                denyBtn.textContent = '…';
                const { error } = await sb
                    .from('bingo_submissions')
                    .update({ status: 'denied', reviewed_at: new Date().toISOString() })
                    .eq('id', s.id);
                if (error) {
                    alert('Failed to deny: ' + error.message);
                    denyBtn.disabled = false;
                    denyBtn.textContent = 'Deny';
                } else {
                    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
                    await loadSubmissions(sb, activeFilter);
                }
            });
        }

        // Edit button — toggle inline form and populate items
        const editBtn = row.querySelector('.sub-edit-btn');
        const editForm = row.querySelector('.sub-edit-form');
        const itemsList = row.querySelector('.sub-items-list');

        function renderItemInputs(items) {
            itemsList.innerHTML = '';
            (items.length ? items : ['']).forEach((val, i) => {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
                wrap.innerHTML = `
                    <input type="text" class="form-input sub-item-input" style="padding:5px 8px;font-size:13px;flex:1;" placeholder="e.g. Royal Sight" value="${escapeHTML(val)}">
                    <button class="btn btn-outline sub-remove-item" style="padding:4px 8px;font-size:12px;border-color:#e74c3c;color:#e74c3c;" title="Remove">✕</button>
                `;
                wrap.querySelector('.sub-remove-item').addEventListener('click', () => {
                    wrap.remove();
                    if (itemsList.children.length === 0) renderItemInputs([]);
                });
                itemsList.appendChild(wrap);
            });
        }

        let teamMembers = null;
        editBtn.addEventListener('click', async () => {
            const open = editForm.style.display !== 'none';
            editForm.style.display = open ? 'none' : '';
            if (!open) {
                renderItemInputs(pieceItems);
                // Lazy-load team members once
                const submitterSelect = row.querySelector('.sub-edit-submitter');
                if (!teamMembers) {
                    const { data: members } = await sb
                        .from('bingo_team_members')
                        .select('rsn, discord_id')
                        .eq('team_id', s.team_id)
                        .order('rsn');
                    teamMembers = members || [];
                }
                submitterSelect.innerHTML = teamMembers.map(m => {
                    const selected = m.discord_id === s.submitted_by_discord_id ||
                                     (!s.submitted_by_discord_id && m.rsn === s.submitted_by_rsn);
                    return `<option value="${escapeHTML(m.discord_id || '')}|${escapeHTML(m.rsn)}" ${selected ? 'selected' : ''}>${escapeHTML(m.rsn)}</option>`;
                }).join('') || '<option value="">No members found</option>';
            }
        });

        row.querySelector('.sub-add-item-btn').addEventListener('click', () => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
            wrap.innerHTML = `
                <input type="text" class="form-input sub-item-input" style="padding:5px 8px;font-size:13px;flex:1;" placeholder="e.g. Royal Bolt">
                <button class="btn btn-outline sub-remove-item" style="padding:4px 8px;font-size:12px;border-color:#e74c3c;color:#e74c3c;" title="Remove">✕</button>
            `;
            wrap.querySelector('.sub-remove-item').addEventListener('click', () => {
                wrap.remove();
                if (itemsList.children.length === 0) renderItemInputs([]);
            });
            itemsList.appendChild(wrap);
        });

        row.querySelector('.sub-cancel-btn').addEventListener('click', () => {
            editForm.style.display = 'none';
        });

        row.querySelector('.sub-save-btn').addEventListener('click', async () => {
            const newStatus = row.querySelector('.sub-edit-status').value;
            const inputs = [...row.querySelectorAll('.sub-item-input')];
            const labels = inputs.map(i => i.value.trim()).filter(Boolean);
            const newLabel = labels.length ? labels.join(', ') : null;
            const msgEl = row.querySelector('.sub-edit-status-msg');
            const saveBtn = row.querySelector('.sub-save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            msgEl.textContent = '';

            const submitterVal = row.querySelector('.sub-edit-submitter').value;
            const [newDiscordId, newRsn] = submitterVal.split('|');
            const updatePayload = {
                status: newStatus,
                piece_label: newLabel,
                reviewed_at: new Date().toISOString(),
                submitted_by_rsn: newRsn || null,
                submitted_by_discord_id: newDiscordId || null,
            };

            const { error } = await sb
                .from('bingo_submissions')
                .update(updatePayload)
                .eq('id', s.id);

            if (error) {
                msgEl.textContent = 'Failed: ' + error.message;
                msgEl.style.color = '#e74c3c';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            } else {
                // Double points day: if approving and task now complete, set multiplier = 2
                if (newStatus === 'approved' && currentDay() === DOUBLE_POINTS_DAY) {
                    const reqPieces = s.bingo_tasks?.required_pieces || 1;
                    const { count } = await sb
                        .from('bingo_submissions')
                        .select('id', { count: 'exact', head: true })
                        .eq('team_id', s.team_id)
                        .eq('task_id', s.task_id)
                        .eq('status', 'approved');
                    if ((count || 0) >= reqPieces) {
                        await sb.from('bingo_submissions')
                            .update({ points_multiplier: 2.0 })
                            .eq('team_id', s.team_id)
                            .eq('task_id', s.task_id);
                    }
                }
                const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'pending';
                await loadSubmissions(sb, activeFilter);
            }
        });
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
