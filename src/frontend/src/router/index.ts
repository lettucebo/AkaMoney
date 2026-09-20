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

  // Registered once per router instance: reacts to auth failures reported by
  // the API layer (interaction-required/no-account/initialization-failed
  // from a request, or an unauthorized 401 from a response) by expiring the
  // session and landing safely on Login.
  registerAuthFailureHandler((reason: SessionExpiryReason) => {
    const authStore = useAuthStore();

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
    void router.replace({ name: 'Login', query: { redirect } });
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
