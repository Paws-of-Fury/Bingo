/**
 * Leaderboard rendering module.
 */

import { currentDay, TOTAL_DAYS } from './config.js';
import { fetchLeaderboard, fetchTeamDetails, fetchTeamTimeslots } from './supabase.js';

const MEDALS = ['', '\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49']; // 1st, 2nd, 3rd

export async function renderLeaderboard(containerId = 'leaderboard') {
    const el = document.getElementById(containerId);
    if (!el) return;

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
                inner.innerHTML = members.map(m => `
                    <div class="lb-member-row">
                        <span class="lb-member-name">${escapeHTML(m.rsn)}</span>
                        <span class="lb-member-stats">
                            <span class="lb-member-subs">${m.approved_count} submission${m.approved_count !== 1 ? 's' : ''}</span>
                            <span class="lb-member-pts">${m.personal_points} pts</span>
                        </span>
                    </div>
                `).join('');
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
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
