import { createRouter, createWebHistory } from 'vue-router';
import authService from '../services/authService';
import Dashboard from '../views/Dashboard.vue';
import Login from '../views/Login.vue';
import ShortUrlForm from '../views/ShortUrlForm.vue';
import ShortUrlDetail from '../views/ShortUrlDetail.vue';
import NotFound from '../views/NotFound.vue';

// Define routes
const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true }
  },
  {
    path: '/create',
    name: 'CreateShortUrl',
    component: ShortUrlForm,
    meta: { requiresAuth: true }
  },
  {
    path: '/edit/:code',
    name: 'EditShortUrl',
    component: ShortUrlForm,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/detail/:code',
    name: 'ShortUrlDetail',
    component: ShortUrlDetail,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound
  }
];

// Create router
const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
});

// Navigation guard
router.beforeEach(async (to, from, next) => {
  // Check if the route requires authentication
  if (to.meta.requiresAuth) {
    const authed = await authService.isAuthenticated();
    if (!authed) {
      // Redirect to login page with return URL
      next({
        path: '/login',
        query: { redirect: to.fullPath }
      });
      return;
    }
  }
  next();
});

export default router;
