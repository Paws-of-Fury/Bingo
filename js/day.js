/**
 * Day detail page (day.html?day=N).
 * Renders all tasks for the given day as separate cards.
 */

import { currentDay, dateForDay, tierInfo, TOTAL_DAYS, DOUBLE_POINTS_DAY } from './config.js';
import { fetchTasksByDay, fetchTeamSubmissions, aggregateSubmissions, checkTriplePointsUnlocked } from './supabase.js';
import { updateAuthUI, getSession, getViewTeamId } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();

    const params = new URLSearchParams(window.location.search);
    const dayNum = parseInt(params.get('day'), 10);
    const session = getSession();
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

    // Check submissions if signed in (or admin viewing a team)
    let taskProgress = {};
    const viewTeamId = getViewTeamId();
    if (viewTeamId) {
        const subs = await fetchTeamSubmissions(viewTeamId);
        taskProgress = aggregateSubmissions(subs);
    }

    // Triple points unlock: check DB — only active if this team has completed the unlock task
    const isTripleActive = await checkTriplePointsUnlocked(viewTeamId || null);
    const tripleEl = document.getElementById('triple-points-banner');
    if (tripleEl && isTripleActive) tripleEl.style.display = '';

    // Show double points banner if this is day 7 and it's currently active (and triple not overriding)
    const isDoubleDay = today === DOUBLE_POINTS_DAY;
    const doubleEl = document.getElementById('double-points-banner');
    if (doubleEl && isDoubleDay && !isTripleActive) doubleEl.style.display = '';

    // Sort by points (lowest → highest) and render each task
    tasks.sort((a, b) => a.points - b.points);
    for (const task of tasks) {
        const tier = tierInfo(task.points);
        const reqPieces = task.required_pieces || 1;
        const tp = taskProgress[task.id] || { approved_pieces: 0, has_pending: false, approved_labels: [], pending_labels: [] };
        const isComplete = tp.approved_pieces >= reqPieces;
        const isPending = tp.has_pending;

        const card = document.createElement('div');
        card.className = 'task-detail task-revealed';
        if (isComplete) card.classList.add('task-completed');
        if (isPending && !isComplete) card.classList.add('task-pending');

        let statusBadge = '';
        if (isComplete) {
            statusBadge = '<div class="task-status-badge approved">Completed</div>';
        } else if (reqPieces > 1 && tp.approved_pieces > 0) {
            statusBadge = `<div class="task-status-badge pending">${tp.approved_pieces}/${reqPieces} pieces</div>`;
        } else if (isPending) {
            statusBadge = '<div class="task-status-badge pending">Pending Review</div>';
        }

        // Build obtained items display
        let itemsHTML = '';
        const allLabels = [
            ...tp.approved_labels.map(l => `<span class="obtained-item obtained-approved">✅ ${escapeHTML(l)}</span>`),
            ...tp.pending_labels.map(l => `<span class="obtained-item obtained-pending">⏳ ${escapeHTML(l)}</span>`),
        ];
        if (allLabels.length) {
            itemsHTML = `<div class="obtained-items">${allLabels.join('')}</div>`;
        }

        let submitHTML = '';
        if (session && !isComplete) {
            submitHTML = `
                <div class="submit-section">
                    <a href="submit.html?task=${task.id}&day=${dayNum}" class="btn btn-gold">Submit Proof</a>
                </div>
            `;
        }

        const showDouble = isDoubleDay && !isTripleActive && !isComplete;
        const showTriple = isTripleActive && !isComplete;
        card.innerHTML = `
            <div class="tier-badge ${tier.cls}">${tier.label}</div>
            ${statusBadge}
            ${showTriple ? `<div class="double-pts-badge" style="background:linear-gradient(135deg,#9b59b6,#6c3483);color:#fff;">🔱 3× Points</div>` : ''}
            ${showDouble ? `<div class="double-pts-badge">🎊 2× Points</div>` : ''}
            ${task.image_url ? `<img class="task-image" src="${escapeAttr(task.image_url)}" alt="${escapeAttr(task.title)}">` : ''}
            <h3 class="task-title">${escapeHTML(task.title)}</h3>
            <p class="task-description">${escapeHTML(task.description || '')}</p>
            ${itemsHTML}
            <div class="task-meta">
                <span class="task-points">${showDouble ? `<span style="text-decoration:line-through;opacity:0.5;">${task.points}</span> <strong style="color:#ffd700;">${task.points * 2}</strong>` : task.points} points (${tier.label})${reqPieces > 1 ? ` — ${reqPieces} pieces required` : ''}</span>
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
