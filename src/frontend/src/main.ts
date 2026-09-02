import { bootstrapApp } from './bootstrap';

import './assets/css/main.css';

/**
 * The bootstrap owns the startup order: authentication first, then - only for
 * a document without OAuth callback parameters - the router, Sentry and the
 * mount. See `src/bootstrap.ts`.
 */
void bootstrapApp().catch(() => {
  console.error('[Bootstrap] Application bootstrap failed.');
});
