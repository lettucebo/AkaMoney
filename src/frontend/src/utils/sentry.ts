import * as Sentry from '@sentry/vue';
import type { App } from 'vue';
import type { Router } from 'vue-router';

let sentryInitialized = false;

const buildTracePropagationTargets = (): Array<string | RegExp> => {
  const targets: Array<string | RegExp> = ['localhost'];
  const apiUrl = import.meta.env.VITE_API_URL?.trim();

  if (apiUrl) {
    targets.push(apiUrl);
  }

  return targets;
};

export const initSentry = (app: App<Element>, router: Router): void => {
  if (sentryInitialized || typeof window === 'undefined') {
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: true,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
      Sentry.replayIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
      Sentry.captureConsoleIntegration({ levels: ['error'] })
    ],
    enableLogs: true,
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
    tracePropagationTargets: buildTracePropagationTargets(),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.VITE_SENTRY_REPLAY_ENABLED === 'false' ? 0 : 1.0
  });

  sentryInitialized = true;
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export const setSentryUser = async (userId: string): Promise<void> => {
  const encodedUserId = new TextEncoder().encode(userId);
  const hashedUserId = await crypto.subtle.digest('SHA-256', encodedUserId);

  Sentry.setUser({ id: toHex(hashedUserId) });
};

export const clearSentryUser = (): void => {
  Sentry.setUser(null);
};
