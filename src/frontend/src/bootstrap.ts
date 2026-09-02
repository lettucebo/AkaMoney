import { createApp as createVueApp, type App } from 'vue';
import { createPinia } from 'pinia';
import type { Router } from 'vue-router';
import AppRoot from './App.vue';
import type { AuthInitializationResult } from './services/auth';
import { useAuthStore } from './stores/auth';
import { useThemeStore } from './stores/theme';
import { inspectOAuthCallback } from './utils/oauthCallback';
import { initSentry, setSentryUser } from './utils/sentry';

/**
 * Seams of the production bootstrap. Tests inject fakes to record the exact
 * call order; production supplies the real browser, router, auth and Sentry
 * implementations through {@link createDefaultDependencies}.
 */
export interface BootstrapDependencies {
  readLaunchHref: () => string;
  readHistoryState: () => unknown;
  replaceHistoryState: (state: unknown, url: string) => void;
  reloadDocument: () => void;
  replaceLocation: (url: string) => void;
  createApp: () => App<Element>;
  initializeTheme: () => void;
  initializeAuth: () => Promise<AuthInitializationResult>;
  readAccountId: () => string | null;
  createRouter: () => Promise<Router>;
  initSentry: (app: App<Element>, router: Router) => void;
  setSentryUser: (userId: string) => Promise<void>;
}

export interface BootstrapResult {
  /**
   * `callback-terminated`: the document carried an OAuth response, so the
   * bootstrap left it without a router, telemetry or a mounted app.
   * `app-started`: a clean document completed the normal startup sequence.
   */
  readonly status: 'callback-terminated' | 'app-started';
}

const MOUNT_SELECTOR = '#app';

/** Diagnostics are constant: an error value here can carry the callback URL. */
const HISTORY_REPLACE_FAILED_MESSAGE = '[Bootstrap] Unable to replace the callback history entry.';
const NAVIGATION_FAILED_MESSAGE = '[Bootstrap] Unable to leave the callback document.';
const TELEMETRY_FAILED_MESSAGE = '[Bootstrap] Telemetry initialization failed.';
const AUTH_FAILED_MESSAGE = '[Bootstrap] Authentication initialization failed.';

const createDefaultDependencies = (): BootstrapDependencies => ({
  readLaunchHref: () => window.location.href,
  readHistoryState: () => window.history.state,
  replaceHistoryState: (state, url) => window.history.replaceState(state, '', url),
  reloadDocument: () => window.location.reload(),
  replaceLocation: (url) => window.location.replace(url),
  createApp: () => {
    const app = createVueApp(AppRoot);
    app.use(createPinia());
    return app;
  },
  initializeTheme: () => useThemeStore().initialize(),
  initializeAuth: () => useAuthStore().initialize(),
  readAccountId: () => useAuthStore().user?.homeAccountId ?? null,
  // Imported dynamically so `createWebHistory()` can never run - and never
  // snapshot a callback URL - before the document is known to be clean.
  createRouter: async () => (await import('./router')).createAppRouter(),
  initSentry,
  setSentryUser
});

/**
 * Leaves a callback document for a fresh, clean one.
 *
 * `replaceState` drops the callback entry from history (so Back cannot restore
 * it) and `reload()` then fetches the already-clean current URL as a new
 * document. If `replaceState` is refused the address bar still holds the OAuth
 * response, so this document is abandoned in place: navigating from it would
 * send the response as the `Referer` of the next document's requests. Only
 * after `replaceState` succeeded - when the current entry is already sanitized
 * - may a `location.replace` of that same clean URL stand in for a refused
 * reload. The caller never continues bootstrap in this document, whatever
 * happens here.
 */
const leaveCallbackDocument = (
  dependencies: BootstrapDependencies,
  savedHistoryState: unknown,
  cleanUrl: string
): void => {
  try {
    dependencies.replaceHistoryState(savedHistoryState, cleanUrl);
  } catch {
    console.error(HISTORY_REPLACE_FAILED_MESSAGE);
    return;
  }

  try {
    dependencies.reloadDocument();
    return;
  } catch {
    console.error(NAVIGATION_FAILED_MESSAGE);
  }

  try {
    dependencies.replaceLocation(cleanUrl);
  } catch {
    console.error(NAVIGATION_FAILED_MESSAGE);
  }
};

const startTelemetry = (
  dependencies: BootstrapDependencies,
  app: App<Element>,
  router: Router
): void => {
  try {
    dependencies.initSentry(app, router);
  } catch {
    console.error(TELEMETRY_FAILED_MESSAGE);
  }
};

const synchronizeTelemetryUser = async (dependencies: BootstrapDependencies): Promise<void> => {
  const accountId = dependencies.readAccountId();
  if (!accountId) {
    return;
  }

  try {
    await dependencies.setSentryUser(accountId);
  } catch {
    console.error(TELEMETRY_FAILED_MESSAGE);
  }
};

/**
 * Starts the admin SPA.
 *
 * Authentication runs first so MSAL consumes the OAuth redirect response
 * before any router, Sentry integration or Replay recorder exists. A document
 * that was launched with callback parameters is never used for the app: it is
 * replaced by a sanitized, freshly loaded document. Only a clean document
 * creates a router, initializes telemetry and mounts.
 */
export const bootstrapApp = async (
  overrides: Partial<BootstrapDependencies> = {}
): Promise<BootstrapResult> => {
  const dependencies: BootstrapDependencies = { ...createDefaultDependencies(), ...overrides };

  // Captured before auth: MSAL rewrites the URL while handling the response.
  const launch = inspectOAuthCallback(dependencies.readLaunchHref());
  const savedHistoryState = dependencies.readHistoryState();

  const app = dependencies.createApp();
  dependencies.initializeTheme();

  // A rejection here must not skip callback cleanup: an unhandled failure would
  // otherwise leave the OAuth response in the address bar and in history.
  let authResult: AuthInitializationResult;
  try {
    authResult = await dependencies.initializeAuth();
  } catch {
    console.error(AUTH_FAILED_MESSAGE);
    authResult = { status: 'failed', callbackPresent: launch.isCallback };
  }

  if (launch.isCallback || authResult.callbackPresent) {
    leaveCallbackDocument(dependencies, savedHistoryState, launch.sanitizedUrl);
    return { status: 'callback-terminated' };
  }

  const router = await dependencies.createRouter();
  startTelemetry(dependencies, app, router);
  await synchronizeTelemetryUser(dependencies);
  app.use(router);
  app.mount(MOUNT_SELECTOR);

  return { status: 'app-started' };
};
