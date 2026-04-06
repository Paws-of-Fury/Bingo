/**
 * Supabase client + query helpers.
 */

import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

let _client = null;

export function getClient() {
    if (!_client) {
        _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }
    return _client;
}

/** Fetch all active tasks for days that have been unlocked. */
export async function fetchTasks(maxDay) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_tasks')
        .select('*')
        .eq('active', true)
        .lte('day_number', maxDay)
        .order('day_number');
    if (error) { console.error('fetchTasks', error); return []; }
    return data;
}

/** Fetch all tasks for a given day number. */
export async function fetchTasksByDay(dayNum) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_tasks')
        .select('*')
        .eq('day_number', dayNum)
        .eq('active', true)
        .order('id');
    if (error) { console.error('fetchTasksByDay', error); return []; }
    return data || [];
}

/** Fetch a single task by ID. */
export async function fetchTaskById(id) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_tasks')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) { console.error('fetchTaskById', error); return null; }
    return data;
}

/**
 * Fetch members + their approved submissions for a team.
 * Accepts either a numeric team_id or a team name string.
 * Returns array of { rsn, approved_count, personal_points }
 */
export async function fetchTeamDetails(teamIdOrName) {
    const sb = getClient();

    // If we got a name (or undefined id), resolve to id first
    let teamId = teamIdOrName;
    if (!teamId || typeof teamId === 'string') {
        const { data: t } = await sb
            .from('bingo_teams')
            .select('id')
            .eq('name', teamIdOrName)
            .maybeSingle();
        if (!t) return [];
        teamId = t.id;
    }

    // Members
    const { data: members, error: mErr } = await sb
        .from('bingo_team_members')
        .select('rsn, discord_id')
        .eq('team_id', teamId);
    if (mErr || !members) return [];

    // Approved submissions with task info for point calculations
    const { data: subs, error: sErr } = await sb
        .from('bingo_submissions')
        .select('submitted_by_discord_id, submitted_by_rsn, bingo_tasks(points, required_pieces)')
        .eq('team_id', teamId)
        .eq('status', 'approved');
    if (sErr) return members.map(m => ({ rsn: m.rsn, approved_count: 0, personal_points: 0 }));

    // Aggregate per member
    const byDiscord = {};
    for (const s of (subs || [])) {
        const key = s.submitted_by_discord_id || s.submitted_by_rsn;
        if (!byDiscord[key]) byDiscord[key] = { count: 0, points: 0, rsn: s.submitted_by_rsn };
        byDiscord[key].count += 1;
        const pts = s.bingo_tasks?.points || 0;
        const req = s.bingo_tasks?.required_pieces || 1;
        const multiplier = s.points_multiplier || 1;
        byDiscord[key].points += (pts / req) * multiplier;
    }

    return members.map(m => {
        const key = m.discord_id;
        const agg = byDiscord[key] || { count: 0, points: 0 };
        return { rsn: m.rsn, discord_id: m.discord_id, approved_count: agg.count, personal_points: Math.round(agg.points * 10) / 10 };
    }).sort((a, b) => b.personal_points - a.personal_points);
}

/** Fetch leaderboard via RPC. */
export async function fetchLeaderboard() {
    const sb = getClient();
    const { data, error } = await sb.rpc('bingo_leaderboard');
    if (error) { console.error('fetchLeaderboard', error); return []; }
    return data;
}

/** Fetch timeslot info for all teams. Returns map of team name → { timeslot_start, timeslot_hours } */
export async function fetchTeamTimeslots() {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_teams')
        .select('name, timeslot_start, timeslot_hours');
    if (error) { console.error('fetchTeamTimeslots', error); return {}; }
    const map = {};
    for (const t of (data || [])) map[t.name] = t;
    return map;
}

/** Fetch all approved submissions for a specific team member. */
export async function fetchMemberSubmissions(teamId, discordId, rsn) {
    const sb = getClient();
    let query = sb
        .from('bingo_submissions')
        .select('piece_label, attachments, created_at, bingo_tasks(title, day_number, points)')
        .eq('team_id', teamId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

    if (discordId) {
        query = query.eq('submitted_by_discord_id', discordId);
    } else {
        query = query.eq('submitted_by_rsn', rsn);
    }

    const { data, error } = await query;
    if (error) { console.error('fetchMemberSubmissions', error); return []; }
    return data || [];
}

/** Fetch a team by passphrase (for login). */
export async function fetchTeamByPassphrase(passphrase) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_teams')
        .select('id, name, timeslot_start, timeslot_hours, colour')
        .eq('passphrase', passphrase)
        .maybeSingle();
    if (error) { console.error('fetchTeamByPassphrase', error); return null; }
    return data;
}

/** Check if a discord_id is a member of a team. */
export async function checkMembership(teamId, discordId) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_team_members')
        .select('id, rsn')
        .eq('team_id', teamId)
        .eq('discord_id', discordId)
        .maybeSingle();
    if (error) { console.error('checkMembership', error); return null; }
    return data;
}

/**
 * Fetch boss battle data: team ID 4 vs everyone else combined.
 * Returns { boss: { name, colour, points }, challenger: { points, teams: [{name, colour, points}] } }
 */
export async function fetchBossBattle() {
    const sb = getClient();

    const [lbResult, teamsResult] = await Promise.all([
        sb.rpc('bingo_leaderboard'),
        sb.from('bingo_teams').select('id, name, colour'),
    ]);

    if (lbResult.error) { console.error('fetchBossBattle lb', lbResult.error); return null; }
    if (teamsResult.error) { console.error('fetchBossBattle teams', teamsResult.error); return null; }

    const rows = lbResult.data || [];
    const teams = teamsResult.data || [];
    if (!rows.length) return null;

    const bossTeam = teams.find(t => t.id === 4);
    if (!bossTeam) return null;

    // Build colour lookup from bingo_teams (leaderboard RPC may not always have colour)
    const colourMap = {};
    for (const t of teams) colourMap[t.name] = t.colour;

    const bossRow = rows.find(r => r.team_name === bossTeam.name);
    const bossPoints = parseFloat(bossRow?.total_points || 0);

    const others = rows.filter(r => r.team_name !== bossTeam.name);
    const challengerPoints = others.reduce((sum, r) => sum + parseFloat(r.total_points || 0), 0);

    return {
        boss: { name: bossTeam.name, colour: bossTeam.colour || '#e94560', points: bossPoints },
        challenger: {
            points: challengerPoints,
            teams: others.map(r => ({
                name: r.team_name,
                colour: colourMap[r.team_name] || r.team_colour || '#5865f2',
                points: parseFloat(r.total_points || 0),
            })),
        },
    };
}

/**
 * Check if the Day 14 triple points unlock task has been completed by any team.
 * Returns true if triple points are now active.
 */
export async function checkTriplePointsUnlocked() {
    const sb = getClient();
    const { TRIPLE_POINTS_TASK_DAY } = await import('./config.js');
    // Find the Day 14, 0-point unlock task
    const { data: tasks } = await sb
        .from('bingo_tasks')
        .select('id')
        .eq('day_number', TRIPLE_POINTS_TASK_DAY)
        .eq('points', 0)
        .eq('active', true);
    if (!tasks?.length) return false;
    const taskIds = tasks.map(t => t.id);
    // Check if any team has an approved submission for it
    const { count } = await sb
        .from('bingo_submissions')
        .select('id', { count: 'exact', head: true })
        .in('task_id', taskIds)
        .eq('status', 'approved');
    return (count || 0) > 0;
}

/** Fetch all submissions for a team. */
export async function fetchTeamSubmissions(teamId) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_submissions')
        .select('task_id, status, pieces, piece_label, points_multiplier')
        .eq('team_id', teamId);
    if (error) { console.error('fetchTeamSubmissions', error); return []; }
    return data;
}

/**
 * Aggregate submissions into per-task progress.
 * Returns: { task_id → { approved_pieces, has_pending, approved_labels, pending_labels } }
 */
export function aggregateSubmissions(subs) {
    const progress = {};
    for (const s of subs) {
        const tp = progress[s.task_id] ||= {
            approved_pieces: 0, has_pending: false,
            approved_labels: [], pending_labels: [],
        };
        if (s.status === 'approved') {
            tp.approved_pieces += (s.pieces || 1);
            if (s.piece_label) tp.approved_labels.push(s.piece_label);
        }
        if (s.status === 'pending') {
            tp.has_pending = true;
            if (s.piece_label) tp.pending_labels.push(s.piece_label);
        }
    }
    return progress;
}
