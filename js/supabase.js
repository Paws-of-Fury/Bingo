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

/** Fetch leaderboard via RPC. */
export async function fetchLeaderboard() {
    const sb = getClient();
    const { data, error } = await sb.rpc('bingo_leaderboard');
    if (error) { console.error('fetchLeaderboard', error); return []; }
    return data;
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
        .select('task_id, status, pieces')
        .eq('team_id', teamId);
    if (error) { console.error('fetchTeamSubmissions', error); return []; }
    return data;
}

/**
 * Aggregate submissions into per-task progress.
 * Returns: { task_id → { approved_pieces: number, has_pending: boolean } }
 */
export function aggregateSubmissions(subs) {
    const progress = {};
    for (const s of subs) {
        const tp = progress[s.task_id] ||= { approved_pieces: 0, has_pending: false };
        if (s.status === 'approved') tp.approved_pieces += (s.pieces || 1);
        if (s.status === 'pending') tp.has_pending = true;
    }
    return progress;
}
