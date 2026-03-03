/**
 * Leaderboard rendering module.
 */

import { currentDay, TOTAL_DAYS } from './config.js';
import { fetchLeaderboard } from './supabase.js';

const MEDALS = ['', '\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49']; // 1st, 2nd, 3rd

export async function renderLeaderboard(containerId = 'leaderboard') {
    const el = document.getElementById(containerId);
    if (!el) return;

    const rows = await fetchLeaderboard();
    if (!rows.length) {
        el.innerHTML = '<p class="text-muted text-center">No teams yet.</p>';
        return;
    }

    const maxPts = Math.max(...rows.map(r => r.total_points), 1);

    el.innerHTML = rows.map((r, i) => {
        const rank = i + 1;
        const medal = MEDALS[rank] || `${rank}.`;
        const pct = (r.total_points / maxPts) * 100;
        const colour = r.team_colour || '#e94560';

        return `
            <div class="lb-row" style="--i:${i}">
                <div class="lb-rank">${medal}</div>
                <div class="lb-info">
                    <div class="lb-name">${escapeHTML(r.team_name)}</div>
                    <div class="lb-bar-wrap">
                        <div class="lb-bar" style="width:${pct}%; background:${colour};"></div>
                    </div>
                </div>
                <div class="lb-points">${r.total_points}</div>
            </div>
        `;
    }).join('');

    // Trigger bar animation after DOM update
    requestAnimationFrame(() => {
        el.querySelectorAll('.lb-bar').forEach(bar => {
            bar.style.width = bar.style.width; // force reflow
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
