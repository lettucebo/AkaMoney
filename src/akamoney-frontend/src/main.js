import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Import Bootstrap CSS and JS
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

// Import Font Awesome
import '@fortawesome/fontawesome-free/css/all.min.css'

// Import authService for authentication
import authService from './services/authService'

// Ensure MSAL is initialized before mounting the app
(async () => {
  try {
    await authService.initializeAuth();
    // Create and mount the Vue application
    createApp(App)
      .use(router)
      .mount('#app');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('MSAL initialization failed:', e);
  }
})();
