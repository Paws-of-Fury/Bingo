/**
 * Day detail page (day.html?day=N).
 */

import { currentDay, dateForDay, tierInfo, TOTAL_DAYS } from './config.js';
import { fetchTaskByDay } from './supabase.js';
import { updateAuthUI, getSession } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();

    const params = new URLSearchParams(window.location.search);
    const dayNum = parseInt(params.get('day'), 10);
    if (!dayNum || dayNum < 1 || dayNum > TOTAL_DAYS) {
        window.location.href = 'index.html';
        return;
    }

    // Heading
    const date = dateForDay(dayNum);
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('day-heading').textContent = `Day ${dayNum} — ${dateStr}`;
    document.title = `Day ${dayNum} — Paws of Fury Bingo`;

    // Prev / Next arrows
    const prev = document.getElementById('prev-day');
    const next = document.getElementById('next-day');
    if (dayNum > 1) {
        prev.href = `day.html?day=${dayNum - 1}`;
    } else {
        prev.classList.add('disabled');
    }
    if (dayNum < TOTAL_DAYS) {
        next.href = `day.html?day=${dayNum + 1}`;
    } else {
        next.classList.add('disabled');
    }

    // Check if day is unlocked
    const today = currentDay();
    if (dayNum > today || today < 1) {
        // Not yet revealed
        document.getElementById('task-unrevealed').style.display = '';
        document.getElementById('task-revealed').style.display = 'none';
        return;
    }

    // Fetch task
    const task = await fetchTaskByDay(dayNum);
    if (!task) {
        // No task set for this day yet
        document.getElementById('task-unrevealed').style.display = '';
        document.getElementById('task-revealed').style.display = 'none';
        return;
    }

    // Show revealed
    document.getElementById('task-unrevealed').style.display = 'none';
    document.getElementById('task-revealed').style.display = '';

    const tier = tierInfo(task.points);

    // Tier badge
    const badge = document.getElementById('task-tier-badge');
    badge.textContent = tier.label;
    badge.className = `tier-badge ${tier.cls}`;

    // Image
    const img = document.getElementById('task-image');
    if (task.image_url) {
        img.src = task.image_url;
        img.alt = task.title;
    } else {
        img.style.display = 'none';
    }

    // Text
    document.getElementById('task-title').textContent = task.title;
    document.getElementById('task-description').textContent = task.description || '';
    document.getElementById('task-points').textContent = `${task.points} points (${tier.label})`;
    document.getElementById('task-date').textContent = dateStr;

    // Submit section
    const session = getSession();
    if (session) {
        document.getElementById('submit-section').style.display = '';
        document.getElementById('submit-link').href = `submit.html?task=${task.id}&day=${dayNum}`;
    } else {
        document.getElementById('login-prompt').style.display = '';
    }
});
