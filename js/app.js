/**
 * Main entry — homepage (index.html).
 */

import { updateAuthUI } from './auth.js';
import { renderDayGrid, startCountdown } from './tasks.js';

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    renderDayGrid();
    startCountdown();
});
