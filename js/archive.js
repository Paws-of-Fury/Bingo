/**
 * Archive page — displays historic bingo results from Supabase.
 * Reads live from DB (can swap to static JSON once tables are removed).
 */

import { SUPABASE_URL, SUPABASE_ANON, TOTAL_DAYS } from './config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const POOL_SPLITS = [0.60, 0.25, 0.15];
const MEDALS = ['🥇', '🥈', '🥉'];
const PLACE_NAMES = ['First Place', 'Second Place', 'Third Place'];

/** Amounts in DB are stored in millions (e.g. 3095 = 3,095M gp). */
function fmtGp(n) {
    return n.toLocaleString() + 'M';
}

function tierBadge(pts) {
    if (pts >= 6) return '<span class="task-arc-badge badge-gold">Gold</span>';
    if (pts >= 3) return '<span class="task-arc-badge badge-silver">Silver</span>';
    return '<span class="task-arc-badge badge-bronze">Bronze</span>';
}

// ── Tab navigation ──────────────────────────────────────────

document.querySelectorAll('.archive-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.archive-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.archive-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const section = document.getElementById(`tab-${btn.dataset.tab}`);
        section?.classList.add('active');
        // Lazy load
        if (btn.dataset.tab === 'leaderboard' && !section.dataset.loaded) {
            section.dataset.loaded = '1';
            loadLeaderboard();
        }
        if (btn.dataset.tab === 'tasks' && !section.dataset.loaded) {
            section.dataset.loaded = '1';
            loadTasks();
        }
    });
});

// ── Results ─────────────────────────────────────────────────

async function loadResults() {
    const el = document.getElementById('results-content');

    const [lbRes, poolRes, memRes, subRes] = await Promise.all([
        sb.rpc('bingo_leaderboard'),
        sb.from('bingo_payments').select('amount'),
        sb.from('bingo_team_members').select('team_id, discord_id, rsn'),
        sb.from('bingo_submissions').select(
            'submitted_by_rsn, submitted_by_discord_id, team_id, pieces, points_multiplier,' +
            ' bingo_tasks(points, required_pieces), bingo_teams(name)'
        ).eq('status', 'approved'),
    ]);

    const teams    = lbRes.data || [];
    const totalPool = (poolRes.data || []).reduce((s, r) => s + parseInt(r.amount), 0);

    const membersByTeam = {};
    for (const m of (memRes.data || [])) {
        (membersByTeam[m.team_id] = membersByTeam[m.team_id] || []).push(m);
    }

    // Individual stats
    const agg = {};
    for (const s of (subRes.data || [])) {
        const key = s.submitted_by_discord_id || s.submitted_by_rsn;
        if (!key) continue;
        if (!agg[key]) agg[key] = {
            rsn: s.submitted_by_rsn || 'Unknown',
            discord_id: s.submitted_by_discord_id,
            team: (s.bingo_teams || {}).name || '?',
            points: 0, pieces: 0,
        };
        const t = s.bingo_tasks || {};
        const pts = t.points || 0, req = t.required_pieces || 1;
        agg[key].points += (pts / req) * (s.pieces || 1) * (s.points_multiplier || 1);
        agg[key].pieces += s.pieces || 1;
    }
    const byPoints = Object.values(agg).sort((a, b) => b.points - a.points);
    const byPieces = Object.values(agg).sort((a, b) => b.pieces - a.pieces);

    // ── Podium ──────────────────────────────────────────────
    const top3 = teams.slice(0, 3);
    const rest  = teams.slice(3);

    const podiumCards = top3.map((t, i) => {
        const prize = Math.round(totalPool * POOL_SPLITS[i]);
        const members = membersByTeam[t.team_id] || [];

        const exactShare = members.length ? prize / members.length : 0;
        const memberRows = members.map(m => {
            const name = m.rsn || 'Unknown';
            const shareStr = Number.isInteger(exactShare)
                ? exactShare.toLocaleString()
                : exactShare.toFixed(1).replace(/\.0$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return `<li>${name} — ${shareStr}M gp</li>`;
        }).join('');

        return `
        <div class="podium-card place-${i + 1}">
            <div class="podium-medal">${MEDALS[i]}</div>
            <div class="podium-team">${t.team_name}</div>
            <div class="podium-pts">${Math.round(t.total_points)} points</div>
            <div class="podium-prize">${fmtGp(prize)} gp</div>
            <ul class="podium-members">${memberRows || '<li>—</li>'}</ul>
        </div>`;
    }).join('');

    const alsoRan = rest.length
        ? `<p class="also-competed">Also competed: ${rest.map(t => `<strong>${t.team_name}</strong>`).join(', ')}</p>`
        : '';

    // ── MVP cards ───────────────────────────────────────────
    function mvpRows(arr, valueFn) {
        return arr.slice(0, 3).map((p, i) => {
            const prize = i === 0 ? `<span class="mvp-prize">200M gp</span>` : '';
            return `<div class="mvp-row">
                <span class="mvp-medal">${MEDALS[i]}</span>
                <span class="mvp-name">${p.rsn}</span>
                <span class="mvp-stat">${valueFn(p)}</span>
                ${prize}
            </div>`;
        }).join('');
    }

    const mvpHtml = `
    <h2 style="font-size:1.1rem;font-weight:800;color:var(--accent-gold);margin-bottom:1rem;">🎖️ Individual Awards</h2>
    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">MVP prizes (200M gp each) are separate from the team prize pool.</p>
    <div class="mvp-grid">
        <div class="mvp-card">
            <div class="mvp-card-title">⭐ Most Individual Points</div>
            ${mvpRows(byPoints, p => `${p.points.toFixed(1)} pts`)}
        </div>
        <div class="mvp-card">
            <div class="mvp-card-title">📦 Most Submissions</div>
            ${mvpRows(byPieces, p => `${p.pieces} items`)}
        </div>
    </div>`;

    el.innerHTML = `
        <h2 style="font-size:1.1rem;font-weight:800;color:var(--accent-gold);margin-bottom:0.5rem;">Team Prize Pool: ${fmtGp(totalPool)} gp</h2>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1.5rem;">1st: 60% · 2nd: 25% · 3rd: 15%</p>
        <div class="podium">${podiumCards}</div>
        ${alsoRan}
        <hr style="border:none;border-top:1px solid var(--border-subtle);margin:2rem 0;">
        ${mvpHtml}
    `;
}

// ── Modal ────────────────────────────────────────────────────

function openModal(title, bodyHtml) {
    document.getElementById('arc-modal-title').textContent = title;
    document.getElementById('arc-modal-body').innerHTML = bodyHtml;
    document.getElementById('arc-modal').style.display = 'flex';
}
function closeModal() {
    document.getElementById('arc-modal').style.display = 'none';
}
document.addEventListener('click', e => {
    if (e.target.id === 'arc-modal') closeModal();
});

// ── Individual stats cache (built once on first leaderboard load) ──
let _indivCache = null; // { byKey: {rsn,discord_id,team_id,points,pieces}, byTeam: {team_id:[...]} }

async function buildIndivCache() {
    if (_indivCache) return _indivCache;
    const { data: subs } = await sb.from('bingo_submissions').select(
        'submitted_by_rsn, submitted_by_discord_id, team_id, pieces, points_multiplier,' +
        ' bingo_tasks(points, required_pieces)'
    ).eq('status', 'approved');

    const byKey = {};
    for (const s of (subs || [])) {
        const key = s.submitted_by_discord_id || s.submitted_by_rsn;
        if (!key) continue;
        if (!byKey[key]) byKey[key] = {
            rsn: s.submitted_by_rsn || 'Unknown',
            discord_id: s.submitted_by_discord_id,
            team_id: s.team_id,
            points: 0, pieces: 0,
        };
        const t = s.bingo_tasks || {};
        byKey[key].points += ((t.points || 0) / (t.required_pieces || 1)) * (s.pieces || 1) * (s.points_multiplier || 1);
        byKey[key].pieces += s.pieces || 1;
    }

    const byTeam = {};
    for (const p of Object.values(byKey)) {
        (byTeam[p.team_id] = byTeam[p.team_id] || []).push(p);
    }
    for (const arr of Object.values(byTeam)) arr.sort((a, b) => b.points - a.points);

    _indivCache = { byKey, byTeam };
    return _indivCache;
}

async function openTeamModal(teamId, teamName) {
    openModal(`${teamName} — Members`, '<p style="color:var(--text-muted)">Loading…</p>');
    const cache = await buildIndivCache();
    const members = cache.byTeam[teamId] || [];

    if (!members.length) {
        document.getElementById('arc-modal-body').innerHTML = '<p style="color:var(--text-muted)">No submissions found.</p>';
        return;
    }

    const rows = members.map(m => `
        <tr>
            <td>
                <span class="arc-player-link" data-rsn="${m.rsn}" data-discord="${m.discord_id || ''}" style="color:var(--accent-gold);cursor:pointer;text-decoration:underline;">${m.rsn}</span>
            </td>
            <td>${m.points.toFixed(1)}</td>
            <td>${m.pieces}</td>
        </tr>`).join('');

    document.getElementById('arc-modal-body').innerHTML = `
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem;">Click a player's name to see their drops.</p>
        <table class="archive-table">
            <thead><tr><th>Player</th><th>Points</th><th>Items</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    document.querySelectorAll('.arc-player-link').forEach(el => {
        el.addEventListener('click', () => openPlayerModal(el.dataset.rsn, el.dataset.discord || null));
    });
}

async function openPlayerModal(rsn, discordId) {
    openModal(`${rsn}'s drops`, '<p style="color:var(--text-muted)">Loading…</p>');

    let query = sb.from('bingo_submissions')
        .select('piece_label, attachments, bingo_tasks(title, day_number, points), submitted_at')
        .eq('status', 'approved')
        .order('submitted_at');

    if (discordId) {
        query = query.eq('submitted_by_discord_id', discordId);
    } else {
        query = query.eq('submitted_by_rsn', rsn);
    }

    const { data: subs } = await query;
    if (!subs?.length) {
        document.getElementById('arc-modal-body').innerHTML = '<p style="color:var(--text-muted)">No approved submissions found.</p>';
        return;
    }

    const cards = subs.map(s => {
        const task = s.bingo_tasks || {};
        const label = s.piece_label ? `<div style="font-size:0.82rem;color:var(--accent-gold);margin-bottom:6px;">🔹 ${s.piece_label}</div>` : '';
        const imgs = (s.attachments || []).map(url =>
            `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" style="width:100%;border-radius:6px;margin-top:4px;display:block;" loading="lazy"></a>`
        ).join('');
        return `
        <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
            <div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);margin-bottom:2px;">Day ${task.day_number}: ${task.title}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">${task.points} pts</div>
            ${label}${imgs}
        </div>`;
    }).join('');

    document.getElementById('arc-modal-body').innerHTML = cards;
}

// ── Team leaderboard ─────────────────────────────────────────

async function loadLeaderboard() {
    const el = document.getElementById('leaderboard-content');

    const { data: teams } = await sb.rpc('bingo_leaderboard');
    if (!teams?.length) { el.innerHTML = '<p class="loading-msg">No data.</p>'; return; }

    // Pre-fetch indiv cache in background so clicks feel instant
    buildIndivCache();

    const rows = teams.map((t, i) => `
        <tr>
            <td class="rank-num">#${i + 1}</td>
            <td>
                <span class="arc-team-link" data-team-id="${t.team_id}" data-team-name="${t.team_name}"
                    style="color:var(--accent-gold);cursor:pointer;text-decoration:underline;font-weight:700;">
                    ${t.team_name}
                </span>
            </td>
            <td>${Math.round(t.total_points)}</td>
            <td>${t.tasks_completed ?? '—'}</td>
        </tr>`).join('');

    el.innerHTML = `
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">Click a team to see members and their points.</p>
        <table class="archive-table">
            <thead><tr><th>#</th><th>Team</th><th>Points</th><th>Tasks</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    el.querySelectorAll('.arc-team-link').forEach(link => {
        link.addEventListener('click', () => openTeamModal(parseInt(link.dataset.teamId), link.dataset.teamName));
    });
}

// ── All tasks ────────────────────────────────────────────────

async function loadTasks() {
    const el = document.getElementById('tasks-content');

    const { data: tasks } = await sb
        .from('bingo_tasks')
        .select('*')
        .eq('active', true)
        .order('day_number')
        .order('points', { ascending: false });

    if (!tasks?.length) { el.innerHTML = '<p class="loading-msg">No tasks found.</p>'; return; }

    const byDay = {};
    for (const t of tasks) (byDay[t.day_number] = byDay[t.day_number] || []).push(t);

    const html = Object.entries(byDay).map(([day, dayTasks]) => {
        const cards = dayTasks.map(t => `
            <div class="task-arc-card">
                <div class="task-arc-title">${t.title}</div>
                <div class="task-arc-meta">
                    ${tierBadge(t.points)}
                    ${t.points} pts
                    ${t.required_pieces > 1 ? `· ${t.required_pieces} pieces` : ''}
                </div>
                ${t.description ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${t.description}</div>` : ''}
            </div>`).join('');
        return `
        <div class="tasks-day-group">
            <div class="tasks-day-label">Day ${day}</div>
            <div class="tasks-cards">${cards}</div>
        </div>`;
    }).join('');

    el.innerHTML = html;
}

// Boot
loadResults();
