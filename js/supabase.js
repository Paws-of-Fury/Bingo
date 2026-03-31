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
        byDiscord[key].points += pts / req;
    }

    return members.map(m => {
        const key = m.discord_id;
        const agg = byDiscord[key] || { count: 0, points: 0 };
        return { rsn: m.rsn, approved_count: agg.count, personal_points: Math.round(agg.points * 10) / 10 };
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

/** Fetch all submissions for a team. */
export async function fetchTeamSubmissions(teamId) {
    const sb = getClient();
    const { data, error } = await sb
        .from('bingo_submissions')
        .select('task_id, status, pieces, piece_label')
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
