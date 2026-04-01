/**
 * Leaderboard rendering module.
 */

import { currentDay, TOTAL_DAYS, DOUBLE_POINTS_DAY } from './config.js';
import { fetchLeaderboard, fetchTeamDetails, fetchTeamTimeslots, fetchMemberSubmissions } from './supabase.js';
import { getSession } from './auth.js';

const MEDALS = ['', '\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49']; // 1st, 2nd, 3rd

export async function renderLeaderboard(containerId = 'leaderboard') {
    const el = document.getElementById(containerId);
    if (!el) return;

    const session = getSession();

    const [rows, timeslots] = await Promise.all([fetchLeaderboard(), fetchTeamTimeslots()]);
    if (!rows.length) {
        el.innerHTML = '<p class="text-muted text-center">No teams yet.</p>';
        return;
    }

    const maxPts = Math.max(...rows.map(r => r.total_points), 1);
    el.innerHTML = '';

    rows.forEach((r, i) => {
        const rank   = i + 1;
        const medal  = MEDALS[rank] || `${rank}.`;
        const pct    = (r.total_points / maxPts) * 100;
        const colour = r.team_colour || '#e94560';

        const ts = timeslots[r.team_name];
        let timeslotStr = '';
        if (ts?.timeslot_start) {
            const [h, m] = ts.timeslot_start.split(':').map(Number);
            const hours = ts.timeslot_hours || 4;
            const endH = (h + hours) % 24;
            const endStr = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            timeslotStr = `${ts.timeslot_start}–${endStr}`;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'lb-wrapper';
        wrapper.style.setProperty('--i', i);

        wrapper.innerHTML = `
            <div class="lb-row lb-row-clickable">
                <div class="lb-rank">${medal}</div>
                <div class="lb-info">
                    <div class="lb-name-row">
                        <div class="lb-name">${escapeHTML(r.team_name)}</div>
                        ${timeslotStr ? `<div class="lb-timeslot">${timeslotStr}</div>` : ''}
                    </div>
                    <div class="lb-bar-wrap">
                        <div class="lb-bar" style="width:${pct}%; background:${colour};"></div>
                    </div>
                </div>
                <div class="lb-points">${r.total_points}</div>
                <div class="lb-chevron">▾</div>
            </div>
            <div class="lb-members" style="display:none;">
                <div class="lb-members-inner">
                    <p class="text-muted" style="font-size:0.85rem;">Loading members…</p>
                </div>
            </div>
        `;

        el.appendChild(wrapper);

        const row       = wrapper.querySelector('.lb-row');
        const panel     = wrapper.querySelector('.lb-members');
        const inner     = wrapper.querySelector('.lb-members-inner');
        const chevron   = wrapper.querySelector('.lb-chevron');
        let loaded      = false;

        row.addEventListener('click', async () => {
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : '';
            chevron.textContent = open ? '▾' : '▴';
            wrapper.classList.toggle('lb-expanded', !open);

            if (!open && !loaded) {
                loaded = true;
                const members = await fetchTeamDetails(r.team_id || r.team_name);
                if (!members.length) {
                    inner.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No members found.</p>';
                    return;
                }

                const isOwnTeam = session && (
                    session.team_name === r.team_name ||
                    (r.team_id && String(session.team_id) === String(r.team_id))
                );

                inner.innerHTML = '';
                for (const m of members) {
                    const row = document.createElement('div');
                    row.className = 'lb-member-row';

                    const nameEl = document.createElement('span');
                    nameEl.className = 'lb-member-name';
                    nameEl.textContent = m.rsn;
                    if (isOwnTeam && m.approved_count > 0) {
                        nameEl.classList.add('lb-member-clickable');
                        nameEl.addEventListener('click', () => openMemberModal(m, r.team_id || r.team_name, session));
                    }

                    const statsEl = document.createElement('span');
                    statsEl.className = 'lb-member-stats';
                    statsEl.innerHTML = `
                        <span class="lb-member-subs">${m.approved_count} submission${m.approved_count !== 1 ? 's' : ''}</span>
                        <span class="lb-member-pts">${m.personal_points} pts</span>
                    `;

                    row.appendChild(nameEl);
                    row.appendChild(statsEl);
                    inner.appendChild(row);
                }
            }
        });
    });
}

export function renderDayInfo() {
    const el = document.getElementById('day-info');
    if (!el) return;
    const day = currentDay();
    if (day < 1) {
        el.textContent = 'Event has not started yet.';
    } else if (day <= TOTAL_DAYS) {
        el.textContent = `Day ${day} of ${TOTAL_DAYS}`;
    } else {
        el.textContent = 'Event complete!';
    }

    if (day === DOUBLE_POINTS_DAY) {
        const banner = document.getElementById('double-points-banner');
        if (banner) banner.style.display = '';
    }
}

async function openMemberModal(member, teamIdOrName, session) {
    const modal = document.getElementById('member-modal');
    const title = document.getElementById('member-modal-title');
    const body  = document.getElementById('member-modal-body');
    if (!modal) return;

    title.textContent = `${member.rsn}'s submissions`;
    body.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Loading…</p>';
    modal.style.display = 'flex';

    // Resolve team_id if we only have a name
    let teamId = teamIdOrName;
    if (!teamId || typeof teamId === 'string') {
        teamId = session.team_id;
    }

    const subs = await fetchMemberSubmissions(teamId, member.discord_id, member.rsn);
    if (!subs.length) {
        body.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No approved submissions found.</p>';
        return;
    }

    body.innerHTML = subs.map(s => {
        const task = s.bingo_tasks;
        const items = s.piece_label ? s.piece_label.split(',').map(p => p.trim()).filter(Boolean) : [];
        const date = new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const images = (Array.isArray(s.attachments) ? s.attachments : [])
            .map(a => typeof a === 'string' ? a : a?.url || '')
            .filter(Boolean);
        return `
            <div style="padding:0.6rem 0;border-bottom:1px solid var(--border-subtle);">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem;">
                    <span style="font-weight:600;font-size:0.9rem;">${task ? `Day ${task.day_number}: ${escapeHTML(task.title)}` : 'Unknown task'}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${date}</span>
                </div>
                ${items.length ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">${items.map(i => `<span class="obtained-item obtained-approved">✅ ${escapeHTML(i)}</span>`).join('')}</div>` : ''}
                ${images.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${images.map(u => `<a href="${escapeHTML(u)}" target="_blank" rel="noopener"><img src="${escapeHTML(u)}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid var(--border-subtle);"></a>`).join('')}</div>` : ''}
            </div>
        `;
    }).join('');
}

// Modal close handlers (set up once)
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('member-modal');
    if (!modal) return;
    document.getElementById('member-modal-close')?.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
