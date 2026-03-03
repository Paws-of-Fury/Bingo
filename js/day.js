/**
 * Day detail page (day.html?day=N).
 * Renders all tasks for the given day as separate cards.
 */

import { currentDay, dateForDay, tierInfo, TOTAL_DAYS } from './config.js';
import { fetchTasksByDay, fetchTeamSubmissions } from './supabase.js';
import { updateAuthUI, getSession } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();

    const params = new URLSearchParams(window.location.search);
    const dayNum = parseInt(params.get('day'), 10);
    const TEST_USER_ID = '145884917627224065';
    const isTestUser = session?.discord_id === TEST_USER_ID;
    if (!dayNum || dayNum < 1 || (dayNum > TOTAL_DAYS && dayNum !== 100)) {
        window.location.href = 'index.html';
        return;
    }
    if (dayNum === 100 && !isTestUser) {
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
    let today = currentDay();
    if (isTestUser && today < 1) {
        today = 1;
    }
    if (dayNum === 100 && isTestUser) {
        // Always allow test day
    } else if (dayNum > today || today < 1) {
        document.getElementById('task-unrevealed').style.display = '';
        document.getElementById('tasks-container').style.display = 'none';
        return;
    }

    // Fetch tasks for this day
    const tasks = await fetchTasksByDay(dayNum);
    if (!tasks.length) {
        document.getElementById('task-unrevealed').style.display = '';
        document.getElementById('tasks-container').style.display = 'none';
        return;
    }

    // Hide unrevealed, show container
    document.getElementById('task-unrevealed').style.display = 'none';
    const container = document.getElementById('tasks-container');
    container.style.display = '';

    // Check submissions if signed in
    const session = getSession();
    let submissionMap = {};
    if (session?.team_id) {
        const subs = await fetchTeamSubmissions(session.team_id);
        submissionMap = Object.fromEntries(subs.map(s => [s.task_id, s.status]));
    }

    // Render each task as its own card
    for (const task of tasks) {
        const tier = tierInfo(task.points);
        const subStatus = session?.team_id ? submissionMap[task.id] : null;
        const isApproved = subStatus === 'approved';
        const isPending = subStatus === 'pending';

        const card = document.createElement('div');
        card.className = 'task-detail task-revealed';
        if (isApproved) card.classList.add('task-completed');
        if (isPending) card.classList.add('task-pending');

        let statusBadge = '';
        if (isApproved) {
            statusBadge = '<div class="task-status-badge approved">Completed</div>';
        } else if (isPending) {
            statusBadge = '<div class="task-status-badge pending">Pending Review</div>';
        } else if (subStatus === 'denied') {
            statusBadge = '<div class="task-status-badge denied">Denied</div>';
        }

        let submitHTML = '';
        if (session && !isApproved && !isPending) {
            submitHTML = `
                <div class="submit-section">
                    <a href="submit.html?task=${task.id}&day=${dayNum}" class="btn btn-gold">Submit Proof</a>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="tier-badge ${tier.cls}">${tier.label}</div>
            ${statusBadge}
            ${task.image_url ? `<img class="task-image" src="${escapeAttr(task.image_url)}" alt="${escapeAttr(task.title)}">` : ''}
            <h3 class="task-title">${escapeHTML(task.title)}</h3>
            <p class="task-description">${escapeHTML(task.description || '')}</p>
            <div class="task-meta">
                <span class="task-points">${task.points} points (${tier.label})</span>
                <span class="task-date">${dateStr}</span>
            </div>
            ${submitHTML}
        `;

        container.appendChild(card);
    }

    // Show login prompt if not signed in
    if (!session) {
        document.getElementById('login-prompt').style.display = '';
    }
});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
