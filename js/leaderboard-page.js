/**
 * Leaderboard page entry (leaderboard.html).
 */

import { updateAuthUI } from './auth.js';
import { renderLeaderboard, renderDayInfo } from './leaderboard.js';

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    renderDayInfo();
    renderLeaderboard();
});
