import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw, Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { getValidatedRedirect } from '@/utils/redirect';
import { registerAuthFailureHandler } from '@/services/api';
import { recordAuthRedirect, type SessionExpiryReason } from '@/utils/sessionExpiry';

// Extend vue-router RouteMeta interface to include requiresAuth
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    /** Breadcrumb label rendered by the app shell topbar. */
    title?: string;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true, title: '連結' }
  },
  {
    path: '/stats',
    name: 'OverallStats',
    component: () => import('@/views/OverallStatsView.vue'),
    meta: { requiresAuth: true, title: '總覽統計' }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登入' }
  },
  {
    path: '/analytics/:shortCode',
    name: 'Analytics',
    component: () => import('@/views/AnalyticsView.vue'),
    meta: { requiresAuth: true, title: '成效分析' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { requiresAuth: true, title: '找不到頁面' }
  }
];

/**
 * Creates a router with a history that snapshots the *current* URL.
 *
 * The application bootstrap imports this factory dynamically and calls it only
 * after MSAL has consumed the OAuth callback and the document is clean, so no
 * router, history entry or Sentry routing instrumentation can ever observe a
 * callback URL.
 */
export const createAppRouter = (): Router => {
  const router = createRouter({
    history: createWebHistory(),
    routes
  });

  // Tracks the current auth-failure-to-Login transition while it is
  // pending. `router.currentRoute` only reflects the new location once
  // `router.replace()` resolves, so a failure that arrives on a later tick
  // while this is still in flight cannot rely on the "already on Login"
  // check above alone; it must instead be coalesced into the same
  // transition (returned below) rather than recording another fuse hit and
  // navigating a second time.
  let redirectInFlight: Promise<void> | null = null;

  // Registered once per router instance: reacts to auth failures reported by
  // the API layer (interaction-required/no-account/initialization-failed
  // from a request, or an unauthorized 401 from a response) by expiring the
  // session and landing safely on Login.
  //
  // The returned promise is also awaited by the API layer's own
  // single-flight guard (see `triggerAuthFailure` in `services/api.ts`), so
  // the two layers agree on when the transition has settled.
  registerAuthFailureHandler((reason: SessionExpiryReason): Promise<void> | void => {
    const authStore = useAuthStore();

    if (redirectInFlight) {
      // A previous auth-failure transition has not settled yet: fold this
      // failure into it instead of recording another fuse hit or
      // navigating again, preserving the first redirect.
      return redirectInFlight;
    }

    if (router.currentRoute.value.name === 'Login') {
      // Already on a safe landing page: do not count this as a new redirect
      // or navigate again.
      return;
    }

    const fuseResult = recordAuthRedirect();
    const effectiveReason: SessionExpiryReason = fuseResult.loopDetected ? 'loop-detected' : reason;

    // Update Pinia state (and persistence, via expireSession) before
    // navigating, so the guard below and LoginView both see the final
    // reason immediately.
    authStore.expireSession(effectiveReason);

    const redirect = getValidatedRedirect(router.currentRoute.value.fullPath);
    // Preserve the first redirect: resolve regardless of outcome (e.g. a
    // duplicate-navigation rejection) so this transition always "settles"
    // rather than propagating an unhandled rejection, and clear the
    // in-flight marker once it does.
    redirectInFlight = router.replace({ name: 'Login', query: { redirect } }).then(
      () => undefined,
      () => undefined
    ).finally(() => {
      redirectInFlight = null;
    });

    return redirectInFlight;
  });

  // Navigation guard for authentication
  router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore();

    // Wait for auth initialization if not already done
    if (!authStore.initialized) {
      await authStore.initialize();
    }

    if (to.meta.requiresAuth && !authStore.hasValidSession) {
      next({ name: 'Login', query: { redirect: to.fullPath } });
    } else if (to.name === 'Login' && authStore.hasValidSession) {
      // Single non-skip-auth decision point for post-login redirects.
      const redirect = getValidatedRedirect(to.query.redirect);
      next(redirect);
    } else {
      next();
    }
  });

  return router;
};
