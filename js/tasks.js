/**
 * Task grid rendering + countdown timer.
 */

import { currentDay, dateForDay, tierInfo, BINGO_START, TOTAL_DAYS } from './config.js';
import { fetchTasks, fetchTeamSubmissions } from './supabase.js';
import { getSession } from './auth.js';

/** Build the 15-card grid (supports multiple tasks per day). */
export async function renderDayGrid() {
    const grid = document.getElementById('day-grid');
    if (!grid) return;

    let day = currentDay();
    const TEST_USER_ID = '145884917627224065';
    const session0 = getSession();
    const isTestUser = session0?.discord_id === TEST_USER_ID;

    // Test mode: show day 1 for the test user before the event starts
    if (isTestUser && day < 1) {
        day = 1;
    }

    const tasks = day >= 1 ? await fetchTasks(isTestUser ? 100 : day) : [];

    // Group tasks by day_number
    const dayTasksMap = {};  // day_number → [task, task, …]
    for (const t of tasks) {
        if (!dayTasksMap[t.day_number]) dayTasksMap[t.day_number] = [];
        dayTasksMap[t.day_number].push(t);
    }

    // If signed in, fetch team submissions to show completion status
    const session = getSession();
    let submissionMap = {};  // task_id → status
    if (session?.team_id) {
        const subs = await fetchTeamSubmissions(session.team_id);
        submissionMap = Object.fromEntries(subs.map(s => [s.task_id, s.status]));
    }

    grid.innerHTML = '';

    // Build list of days to render — add day 100 for test user
    const dayNumbers = [];
    for (let i = 1; i <= TOTAL_DAYS; i++) dayNumbers.push(i);
    if (isTestUser && dayTasksMap[100]) dayNumbers.push(100);

    for (const i of dayNumbers) {
        const dayTasks = dayTasksMap[i] || [];
        const isRevealed = dayTasks.length > 0;
        const isToday = (i === day);

        // Highest tier among all tasks for this day
        const totalPts = dayTasks.reduce((sum, t) => sum + t.points, 0);
        const maxPts = dayTasks.length ? Math.max(...dayTasks.map(t => t.points)) : 0;
        const tier = maxPts > 0 ? tierInfo(maxPts) : null;

        const card = document.createElement('div');
        card.className = 'day-card';
        card.style.setProperty('--i', String(i));
        if (isRevealed) card.classList.add('revealed');
        if (isToday) card.classList.add('today');
        if (tier) card.classList.add(`tier-${tier.cls}`);

        // Completion status (only for revealed cards when signed in)
        let statusHTML = '';
        if (isRevealed && session?.team_id) {
            const doneCount = dayTasks.filter(t => submissionMap[t.id] === 'approved').length;
            const totalCount = dayTasks.length;

            if (doneCount === totalCount) {
                card.classList.add('completed');
                statusHTML = `<span class="status-icon">✓</span>`;
            } else if (doneCount > 0) {
                card.classList.add('partial');
                statusHTML = `<span class="status-icon">${doneCount}/${totalCount}</span>`;
            } else {
                card.classList.add('incomplete');
                statusHTML = `<span class="status-icon">✗</span>`;
            }
        }

        const date = dateForDay(i);
        const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

        // Build images sorted by points (highest first)
        const sorted = [...dayTasks].sort((a, b) => b.points - a.points);
        const imgs = sorted.filter(t => t.image_url).map(t => t.image_url);
        let imagesHTML = '';
        if (imgs.length > 0) {
            imagesHTML = `<div class="card-images card-images-${Math.min(imgs.length, 3)}">`;
            for (const url of imgs.slice(0, 3)) {
                imagesHTML += `<img src="${escapeAttr(url)}" alt="">`;
            }
            imagesHTML += '</div>';
        }

        // Build task list for back of card
        let taskListHTML;
        if (dayTasks.length === 1) {
            const t = dayTasks[0];
            taskListHTML = `
                <div class="card-title">${escapeHTML(t.title)}</div>
                <div class="card-pts">${t.points} pts &middot; ${tier.label}</div>
            `;
        } else {
            taskListHTML = `
                <div class="card-task-count">${dayTasks.length} tasks &middot; ${totalPts} pts</div>
                <ul class="card-task-list">
                    ${dayTasks.map(t => {
                        const done = session?.team_id && submissionMap[t.id] === 'approved';
                        return `<li class="${done ? 'done' : ''}">${escapeHTML(t.title)}</li>`;
                    }).join('')}
                </ul>
            `;
        }

        card.innerHTML = `
            <div class="day-card-inner">
                <div class="day-card-front">
                    <span class="question">?</span>
                    <span class="day-label">Day ${i} &middot; ${dateStr}</span>
                </div>
                <div class="day-card-back">
                    ${statusHTML}
                    ${imagesHTML}
                    <div class="card-info">
                        ${taskListHTML}
                    </div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            window.location.href = `day.html?day=${i}`;
        });

        grid.appendChild(card);
    }
}

/** Countdown timer to event start (or next day reveal). */
export function startCountdown() {
    const el = document.getElementById('countdown');
    if (!el) return;

    function update() {
        const now = new Date();
        const day = currentDay();
        let target, label;

        if (day < 1) {
            // Before event
            target = BINGO_START;
            label = 'Event starts in';
        } else if (day <= TOTAL_DAYS) {
            // Next day reveal (midnight UK)
            const tomorrow = dateForDay(day + 1);
            target = tomorrow;
            label = 'Next task in';
        } else {
            el.innerHTML = '<p class="text-secondary">Event complete!</p>';
            return;
        }

        const diff = Math.max(0, target - now);
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        el.innerHTML = `
            <div class="countdown-unit">
                <div class="countdown-value">${d}</div>
                <div class="countdown-label">Days</div>
            </div>
            <div class="countdown-unit">
                <div class="countdown-value">${pad(h)}</div>
                <div class="countdown-label">Hours</div>
            </div>
            <div class="countdown-unit">
                <div class="countdown-value">${pad(m)}</div>
                <div class="countdown-label">Mins</div>
            </div>
            <div class="countdown-unit">
                <div class="countdown-value">${pad(s)}</div>
                <div class="countdown-label">Secs</div>
            </div>
        `;
    }

    update();
    setInterval(update, 1000);
}

function pad(n) { return String(n).padStart(2, '0'); }

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
