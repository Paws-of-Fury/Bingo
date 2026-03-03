/**
 * Task grid rendering + countdown timer.
 */

import { currentDay, dateForDay, tierInfo, BINGO_START, TOTAL_DAYS } from './config.js';
import { fetchTasks } from './supabase.js';

/** Build the 15-card grid. */
export async function renderDayGrid() {
    const grid = document.getElementById('day-grid');
    if (!grid) return;

    const day = currentDay();
    const tasks = day >= 1 ? await fetchTasks(day) : [];
    const taskMap = Object.fromEntries(tasks.map(t => [t.day_number, t]));

    grid.innerHTML = '';

    for (let i = 1; i <= TOTAL_DAYS; i++) {
        const task = taskMap[i];
        const isRevealed = !!task;
        const isToday = (i === day);
        const tier = task ? tierInfo(task.points) : null;

        const card = document.createElement('div');
        card.className = 'day-card';
        card.style.setProperty('--i', String(i));
        if (isRevealed) card.classList.add('revealed');
        if (isToday) card.classList.add('today');
        if (tier) card.classList.add(`tier-${tier.cls}`);

        const date = dateForDay(i);
        const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

        card.innerHTML = `
            <div class="day-card-inner">
                <div class="day-card-front">
                    <span class="question">?</span>
                    <span class="day-label">Day ${i} &middot; ${dateStr}</span>
                </div>
                <div class="day-card-back">
                    ${task?.image_url ? `<img class="card-thumb" src="${escapeAttr(task.image_url)}" alt="" loading="lazy">` : ''}
                    <div class="card-info">
                        <div class="card-title">${task ? escapeHTML(task.title) : ''}</div>
                        <div class="card-pts">${task ? `${task.points} pts &middot; ${tier.label}` : ''}</div>
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
