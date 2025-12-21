import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useThemeStore } from './stores/theme';

// Import Bootstrap CSS and JS
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';

// Import custom styles
import './assets/css/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Initialize theme before mounting to prevent flash of unstyled content
const themeStore = useThemeStore();
themeStore.initialize();

app.mount('#app');
