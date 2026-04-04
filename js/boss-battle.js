/**
 * Boss Battle leaderboard page.
 * Team 4 (the boss) vs all other teams combined as "Don't G'tbed".
 */

import { fetchBossBattle } from './supabase.js';
import { updateAuthUI } from './auth.js';
import { currentDay, TOTAL_DAYS } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();

    const day = currentDay();
    const dayInfoEl = document.getElementById('day-info');
    if (dayInfoEl) {
        if (day < 1) dayInfoEl.textContent = 'Event has not started yet.';
        else if (day <= TOTAL_DAYS) dayInfoEl.textContent = `Day ${day} of ${TOTAL_DAYS}`;
        else dayInfoEl.textContent = 'Event complete!';
    }

    const data = await fetchBossBattle();
    const container = document.getElementById('boss-battle-container');

    if (!data) {
        container.innerHTML = '<p class="text-muted text-center">No data available.</p>';
        return;
    }

    const { boss, challenger } = data;
    const total = boss.points + challenger.points || 1;
    const bossPct = Math.round((boss.points / total) * 100);
    const challPct = 100 - bossPct;

    // Format points
    const fmt = pts => pts === Math.floor(pts) ? String(Math.floor(pts)) : String(Math.round(pts * 10) / 10);

    // Determine who's winning
    const bossWinning = boss.points >= challenger.points;

    container.innerHTML = `
        <div class="bb-arena">

            <!-- VS Header -->
            <div class="bb-vs-header">
                <div class="bb-team-label bb-boss-label">
                    <div class="bb-crown">👑</div>
                    <div class="bb-team-name" style="color:${boss.colour}">${escapeHTML(boss.name)}</div>
                    <div class="bb-team-sub">The Boss</div>
                </div>
                <div class="bb-vs-badge">VS</div>
                <div class="bb-team-label bb-chall-label">
                    <div class="bb-crown">⚔️</div>
                    <div class="bb-team-name" style="color:#a78bfa">Don't G'tbed</div>
                    <div class="bb-team-sub">Everyone Else</div>
                </div>
            </div>

            <!-- Points display -->
            <div class="bb-scores">
                <div class="bb-score bb-score-boss ${bossWinning ? 'bb-score-leading' : ''}">
                    ${fmt(boss.points)}<span class="bb-pts-label">pts</span>
                </div>
                <div class="bb-score-divider">—</div>
                <div class="bb-score bb-score-chall ${!bossWinning ? 'bb-score-leading' : ''}">
                    ${fmt(challenger.points)}<span class="bb-pts-label">pts</span>
                </div>
            </div>

            <!-- Combined progress bar -->
            <div class="bb-bar-container">
                <div class="bb-bar-boss" style="width:${bossPct}%;background:${boss.colour};">
                    ${bossPct > 12 ? `<span class="bb-bar-pct">${bossPct}%</span>` : ''}
                </div>
                <div class="bb-bar-chall" style="width:${challPct}%;background:#7c3aed;">
                    ${challPct > 12 ? `<span class="bb-bar-pct">${challPct}%</span>` : ''}
                </div>
            </div>
            <div class="bb-bar-labels">
                <span style="color:${boss.colour}">${escapeHTML(boss.name)}</span>
                <span style="color:#a78bfa">Don't G'tbed</span>
            </div>

            <!-- Status message -->
            <div class="bb-status">
                ${bossWinning
                    ? `😈 <strong style="color:${boss.colour}">${escapeHTML(boss.name)}</strong> is stomping the competition — ${fmt(boss.points - challenger.points)} pts ahead!`
                    : `🔥 The rest of the server is <strong style="color:#a78bfa">${fmt(challenger.points - boss.points)} pts</strong> ahead — can they hold on?`
                }
            </div>

            <!-- Individual team breakdown -->
            <div class="bb-breakdown">
                <div class="bb-breakdown-title">⚔️ Don't G'tbed Breakdown</div>
                ${challenger.teams
                    .sort((a, b) => b.points - a.points)
                    .map((t, i) => {
                        const pct = boss.points > 0 ? Math.round((t.points / boss.points) * 100) : 0;
                        const barW = Math.min(100, Math.round((t.points / (boss.points || 1)) * 100));
                        return `
                        <div class="bb-team-row">
                            <div class="bb-team-row-name" style="color:${t.colour || '#a78bfa'}">${escapeHTML(t.name)}</div>
                            <div class="bb-team-row-bar-wrap">
                                <div class="bb-team-row-bar" style="width:${barW}%;background:${t.colour || '#7c3aed'};"></div>
                            </div>
                            <div class="bb-team-row-pts">${fmt(t.points)} pts</div>
                        </div>`;
                    }).join('')}
            </div>
        </div>
    `;
});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
