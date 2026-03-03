/**
 * Admin page — task management.
 * Uses admin passphrase validated via Supabase RLS + SECURITY DEFINER function.
 */

import { SUPABASE_URL, SUPABASE_ANON, TOTAL_DAYS } from './config.js';
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

/** Create a Supabase client with the admin passphrase header. */
function getAdminClient(pass) {
    if (adminClient) return adminClient;
    adminClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        global: {
            headers: { 'x-admin-pass': pass },
        },
    });
    return adminClient;
}

/** Validate passphrase via RPC. */
async function validateAdmin(pass) {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await sb.rpc('validate_admin', { pass });
    if (error) { console.error('validate_admin', error); return false; }
    return data === true;
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
            showPanel(savedPass);
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
            showPanel(pass);
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

    function showPanel(pass) {
        loginSection.style.display = 'none';
        panel.style.display = '';
        initAdmin(pass);
    }
});

/** Initialise the admin panel. */
async function initAdmin(pass) {
    const sb = getAdminClient(pass);

    const saveBtn = document.getElementById('task-save-btn');
    const cancelBtn = document.getElementById('task-cancel-btn');
    const editIdField = document.getElementById('edit-task-id');
    const statusEl = document.getElementById('task-save-status');

    // Load tasks + submissions
    await loadTasks(sb);
    await loadSubmissions(sb, 'pending');

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await loadSubmissions(sb, btn.dataset.filter);
        });
    });

    // Save task
    saveBtn.addEventListener('click', async () => {
        const dayNum = parseInt(document.getElementById('task-day').value, 10);
        const title = document.getElementById('task-title').value.trim();
        const desc = document.getElementById('task-desc').value.trim() || null;
        const img = document.getElementById('task-image').value.trim() || null;
        const pts = parseInt(document.getElementById('task-points').value, 10) || 1;
        const editId = editIdField.value;

        if (!dayNum || dayNum < 1 || dayNum > TOTAL_DAYS) {
            statusEl.textContent = `Day must be between 1 and ${TOTAL_DAYS}.`;
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
                // Update existing task
                const { error } = await sb
                    .from('bingo_tasks')
                    .update({ day_number: dayNum, title, description: desc, image_url: img, points: pts })
                    .eq('id', parseInt(editId, 10));
                if (error) throw error;
                statusEl.textContent = 'Task updated!';
            } else {
                // Insert new task
                const { error } = await sb
                    .from('bingo_tasks')
                    .insert({ day_number: dayNum, title, description: desc, image_url: img, points: pts, active: true });
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
    document.getElementById('task-save-btn').textContent = 'Update Task';
    document.getElementById('task-cancel-btn').style.display = '';
    document.getElementById('task-save-status').textContent = '';
    // Scroll to form
    document.getElementById('task-day').scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    for (let d = 1; d <= TOTAL_DAYS; d++) {
        const dayTasks = byDay[d];
        if (!dayTasks) continue;

        const section = document.createElement('div');
        section.className = 'admin-day-section';
        section.innerHTML = `<h4 class="admin-day-heading">Day ${d} (${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''})</h4>`;

        for (const t of dayTasks) {
            const tier = t.points >= 6 ? 'Gold' : t.points >= 3 ? 'Silver' : 'Bronze';
            const row = document.createElement('div');
            row.className = 'admin-task-row';
            row.innerHTML = `
                <div class="admin-task-info">
                    <span class="admin-task-title">${escapeHTML(t.title)}</span>
                    <span class="admin-task-pts">${t.points} pts (${tier})</span>
                </div>
                <div class="admin-task-actions">
                    <button class="btn btn-outline admin-edit-btn" data-id="${t.id}">Edit</button>
                    <button class="btn btn-outline admin-delete-btn" data-id="${t.id}" style="border-color:#e74c3c;color:#e74c3c;">Delete</button>
                </div>
            `;
            section.appendChild(row);

            // Edit
            row.querySelector('.admin-edit-btn').addEventListener('click', () => {
                populateForm(t);
            });

            // Delete
            row.querySelector('.admin-delete-btn').addEventListener('click', async () => {
                if (!confirm(`Delete "${t.title}"?`)) return;
                const { error } = await sb.from('bingo_tasks').delete().eq('id', t.id);
                if (error) {
                    alert('Delete failed: ' + error.message);
                } else {
                    await loadTasks(sb);
                }
            });
        }

        container.appendChild(section);
    }
}

/** Load and render submissions filtered by status. */
async function loadSubmissions(sb, filter) {
    const container = document.getElementById('submissions-list');
    container.innerHTML = '<p class="text-muted">Loading…</p>';

    let query = sb
        .from('bingo_submissions')
        .select('*, bingo_teams(name, colour), bingo_tasks(title, day_number, points)')
        .order('created_at', { ascending: false });

    if (filter && filter !== 'all') {
        query = query.eq('status', filter);
    }

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

        // Parse attachments
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

        let actionsHTML = '';
        if (s.status === 'pending') {
            actionsHTML = `
                <div class="sub-actions">
                    <button class="btn btn-outline sub-approve-btn" data-id="${s.id}" style="border-color:#2ecc71;color:#2ecc71;">Approve</button>
                    <button class="btn btn-outline sub-deny-btn" data-id="${s.id}" style="border-color:#e74c3c;color:#e74c3c;">Deny</button>
                </div>`;
        }

        row.innerHTML = `
            <div class="sub-header">
                <div class="sub-info">
                    <span class="sub-team" style="color:${escapeHTML(teamColour)}">${escapeHTML(teamName)}</span>
                    <span class="sub-task">Day ${dayNum}: ${escapeHTML(taskTitle)} (${pts} pts)</span>
                </div>
                ${statusBadge}
            </div>
            <div class="sub-meta">
                <span>By: ${escapeHTML(submitter)}</span>
                <span>${source} • ${date}</span>
            </div>
            ${imagesHTML}
            ${actionsHTML}
        `;

        container.appendChild(row);

        // Approve handler
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

        // Deny handler
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
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
