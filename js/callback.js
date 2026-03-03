/**
 * Discord OAuth2 callback handler (callback.html).
 */

import { handleOAuthCallback } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    handleOAuthCallback();
});
