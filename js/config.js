/**
 * Bingo website configuration.
 * Uses the same Supabase project as the bot (Paws of Fury Ranks).
 * Replace SUPABASE_ANON with the anon/public key (not the service_role key).
 */

export const SUPABASE_URL  = 'https://qwxouydsbhhpwnafjayr.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3eG91eWRzYmhocHduYWZqYXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzY5ODUsImV4cCI6MjA4ODA1Mjk4NX0.NfrnoVe4hJlAqrndu_3Xkzd5zfSx3QKJusjWH094srw';  // paste the anon key from Supabase → Settings → API

export const DISCORD_CLIENT_ID = '1475460184141725746';
export const DISCORD_REDIRECT  = window.location.origin + '/clan-bingo/callback.html';

export const BINGO_START = new Date('2026-03-27T00:00:00+00:00');
export const BINGO_END   = new Date('2026-04-10T23:59:59+00:00');
export const TOTAL_DAYS  = 15;

/** Return the current bingo day (1-15), 0 if before start, 16 if after end. */
export function currentDay() {
    // Get current UK date parts directly (avoids locale parsing bugs)
    const now = new Date();
    const ukParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now); // "2026-03-27" format (en-CA = YYYY-MM-DD)
    const [y, m, d] = ukParts.split('-').map(Number);
    const todayMs = Date.UTC(y, m - 1, d);
    const startMs = Date.UTC(2026, 2, 27); // March = month 2 (0-indexed)

    const diff = Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 0;
    return Math.min(diff + 1, TOTAL_DAYS + 1);
}

/** Date for a given bingo day number. */
export function dateForDay(dayNum) {
    const d = new Date(BINGO_START);
    d.setDate(d.getDate() + dayNum - 1);
    return d;
}

/** Tier info from points. */
export function tierInfo(points) {
    if (points >= 6) return { label: 'Gold',   colour: '#ffd700', cls: 'gold' };
    if (points >= 3) return { label: 'Silver', colour: '#c0c0c0', cls: 'silver' };
    return                   { label: 'Bronze', colour: '#cd7f32', cls: 'bronze' };
}
