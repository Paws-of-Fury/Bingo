/**
 * Login / session management.
 *
 * Flow:
 *   1. User enters team passphrase → verified against bingo_teams
 *   2. "Connect with Discord" → Discord OAuth2 (scope=identify)
 *   3. Callback receives code → exchange via Supabase Edge Function
 *   4. Session stored in localStorage
 */

import { DISCORD_CLIENT_ID, DISCORD_REDIRECT } from './config.js';
import { fetchTeamByPassphrase, checkMembership } from './supabase.js';

const SESSION_KEY = 'bingo_session';

/** Current session (or null). */
export function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function setSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    updateAuthUI();
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    updateAuthUI();
}

/** Update the auth button text everywhere. */
export function updateAuthUI() {
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    const s = getSession();
    if (s) {
        btn.textContent = s.username || 'Logged in';
        btn.classList.add('logged-in');
    } else {
        btn.textContent = 'Login';
        btn.classList.remove('logged-in');
    }
}

/** Toggle login: if logged in → logout, else prompt passphrase. */
export function toggleLogin() {
    if (getSession()) {
        if (confirm('Log out?')) {
            clearSession();
            location.reload();
        }
        return;
    }
    showPassphrasePrompt();
}

// Expose globally for onclick
window.bingoAuth = { toggleLogin, getSession };

/** Prompt for passphrase and then redirect to Discord OAuth. */
async function showPassphrasePrompt() {
    const passphrase = prompt('Enter your team passphrase:');
    if (!passphrase) return;

    const team = await fetchTeamByPassphrase(passphrase.trim());
    if (!team) {
        alert('Invalid passphrase. Please try again.');
        return;
    }

    // Store team info temporarily so the callback can complete login
    sessionStorage.setItem('bingo_pending_team', JSON.stringify(team));

    // Redirect to Discord OAuth
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT,
        response_type: 'code',
        scope: 'identify',
    });
    window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
}

/**
 * Called from callback.html after Discord redirects back.
 * Exchanges the code for user info via Edge Function, verifies membership.
 */
export async function handleOAuthCallback() {
    const code = new URLSearchParams(window.location.search).get('code');
    const statusEl = document.getElementById('status');
    const msgEl = document.getElementById('message');

    if (!code) {
        if (statusEl) statusEl.textContent = 'Error';
        if (msgEl) msgEl.textContent = 'No authorisation code received.';
        return;
    }

    const team = JSON.parse(sessionStorage.getItem('bingo_pending_team') || 'null');
    if (!team) {
        if (statusEl) statusEl.textContent = 'Error';
        if (msgEl) msgEl.textContent = 'Session expired. Please start login again.';
        return;
    }

    try {
        // Exchange code via Edge Function
        const { SUPABASE_URL } = await import('./config.js');
        const res = await fetch(`${SUPABASE_URL}/functions/v1/discord-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: DISCORD_REDIRECT }),
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        // Verify membership
        const member = await checkMembership(team.id, data.discord_id);
        if (!member) {
            if (statusEl) statusEl.textContent = 'Not on this team';
            if (msgEl) msgEl.textContent = 'Your Discord account is not a member of this bingo team.';
            sessionStorage.removeItem('bingo_pending_team');
            return;
        }

        // Build session
        setSession({
            discord_id: data.discord_id,
            username: data.username,
            avatar: data.avatar,
            team_id: team.id,
            team_name: team.name,
            rsn: member.rsn,
            timeslot_start: team.timeslot_start,
            timeslot_hours: team.timeslot_hours,
        });

        sessionStorage.removeItem('bingo_pending_team');
        if (statusEl) statusEl.textContent = 'Success!';
        if (msgEl) msgEl.textContent = `Welcome, ${data.username}! Redirecting…`;
        setTimeout(() => { window.location.href = 'index.html'; }, 1200);

    } catch (err) {
        console.error('OAuth callback error', err);
        if (statusEl) statusEl.textContent = 'Login failed';
        if (msgEl) msgEl.textContent = err.message || 'Something went wrong.';
    }
}
