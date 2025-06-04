<template>
  <div id="app">
    <header v-if="isAuthenticated && !isLoginPage" class="app-header">
      <nav class="navbar navbar-expand-lg navbar-dark">
        <div class="container-fluid">
          <router-link class="navbar-brand" to="/">
            <img src="./assets/logo.png" alt="AkaMoney Logo" class="navbar-logo">
            AkaMoney
          </router-link>
          
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          
          <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0">
              <li class="nav-item">
                <router-link class="nav-link" to="/dashboard">
                  <i class="fas fa-tachometer-alt"></i> Dashboard
                </router-link>
              </li>
              <li class="nav-item">
                <router-link class="nav-link" to="/create">
                  <i class="fas fa-plus"></i> Create Short URL
                </router-link>
              </li>
            </ul>
            <div class="d-flex align-items-center">
              <button @click="toggleTheme" class="theme-toggle-btn me-3" :title="theme.text">
                <i class="fas" :class="theme.icon"></i>
              </button>
              <div class="user-info me-2">
                <span v-if="userInfo">{{ userInfo.name }}</span>
              </div>
              <button class="btn btn-outline-light" @click="logout">
                <i class="fas fa-sign-out-alt"></i> Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
    </header>
    
    <main>
      <router-view />
    </main>
    
    <footer v-if="isAuthenticated && !isLoginPage" class="app-footer">
      <div class="container text-center">
        <p>&copy; 2025 AkaMoney URL Shortener Service</p>
      </div>
    </footer>
  </div>
</template>

<script>
import { computed, ref, reactive, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import authService from './services/authService';

export default {
  name: 'App',
  setup() {
    const route = useRoute();
    const userInfo = ref(null);
    
    const theme = reactive({
      isDark: localStorage.getItem('theme') === 'dark',
      icon: localStorage.getItem('theme') === 'dark' ? 'fa-sun' : 'fa-moon',
      text: localStorage.getItem('theme') === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
    });
    
    const updateTheme = (isDark) => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      document.body.style.backgroundColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-color');
    };
    
    const isAuthenticated = ref(false);
    const isLoginPage = computed(() => route.path === '/login');
    
    const toggleTheme = () => {
      theme.isDark = !theme.isDark;
      theme.icon = theme.isDark ? 'fa-sun' : 'fa-moon';
      theme.text = theme.isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      localStorage.setItem('theme', theme.isDark ? 'dark' : 'light');
      updateTheme(theme.isDark);
    };
    
    const logout = async () => {
      await authService.logout();
    };
    
    watch(() => theme.isDark, (newValue) => {
      updateTheme(newValue);
    });
    
    onMounted(async () => {
      isAuthenticated.value = await authService.isAuthenticated();
      if (isAuthenticated.value) {
        const account = await authService.getAccount();
        if (account) {
          userInfo.value = {
            name: account.name || account.username,
            email: account.username
          };
        }
        // 若目前在 /login 頁，且已驗證，直接導向 dashboard
        if (route.path === '/login') {
          window.location.replace('/dashboard');
        }
      }
      updateTheme(theme.isDark);
    });
    
    return {
      isAuthenticated,
      isLoginPage,
      userInfo,
      logout,
      theme,
      toggleTheme
    };
  }
}
</script>

<style>
/* Global Styles */
:root {
  --primary-color: #007bff;
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --warning-color: #ffc107;
  --info-color: #17a2b8;
  --bg-color: #f8f9fa;
  --text-color: #212529;
  --border-color: #dee2e6;
  --header-shadow: rgba(0, 0, 0, 0.1);
  --footer-bg: #f8f9fa;
  --footer-border: #dee2e6;
  --footer-text: #6c757d;
  --navbar-bg: var(--primary-color);
  --calendar-bg: #ffffff;
  --table-bg: #ffffff;
  --table-hover-bg: #f8f9fa;
}

[data-theme="dark"] {
  --bg-color: #1a1a1a;
  --text-color: #e0e0e0;
  --border-color: #333;
  --header-shadow: rgba(0, 0, 0, 0.3);
  --footer-bg: #252525;
  --footer-border: #333;
  --footer-text: #888;
  --navbar-bg: #2d2d2d;
  --calendar-bg: #2d2d2d;
  --table-bg: #252525;
  --table-hover-bg: #2d2d2d;
}

html {
  min-height: 100%;
  background-color: var(--bg-color) !important;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 0;
  min-height: 100vh;
  background-color: var(--bg-color) !important;
  color: var(--text-color);
  transition: background-color 0.3s ease, color 0.3s ease;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color) !important;
}

main {
  flex: 1;
  background-color: var(--bg-color) !important;
}

.app-header {
  box-shadow: 0 2px 4px var(--header-shadow);
  margin-bottom: 1rem;
  background-color: var(--navbar-bg);
}

.navbar {
  background-color: var(--navbar-bg) !important;
  transition: background-color 0.3s ease;
}

.navbar-logo {
  height: 30px;
  margin-right: 0.5rem;
}

.user-info {
  display: flex;
  align-items: center;
  color: white;
}

.app-footer {
  margin-top: 2rem;
  padding: 1rem 0;
  background-color: var(--footer-bg);
  border-top: 1px solid var(--footer-border);
  color: var(--footer-text);
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}

.theme-toggle-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 1.2rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0;
}

.theme-toggle-btn:hover {
  color: white;
  background-color: rgba(255, 255, 255, 0.1);
}

.theme-toggle-btn:focus {
  outline: none;
}

.nav-link.btn-link {
  color: rgba(255, 255, 255, 0.85);
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: color 0.3s ease;
}

.nav-link.btn-link:hover {
  color: white;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

[data-theme="dark"] .card,
[data-theme="dark"] .modal-content,
[data-theme="dark"] .dropdown-menu {
  background-color: var(--bg-color);
  border-color: var(--border-color);
}

[data-theme="dark"] .form-control,
[data-theme="dark"] .input-group-text {
  background-color: var(--footer-bg);
  border-color: var(--border-color);
  color: var(--text-color);
}

[data-theme="dark"] .form-control:focus {
  background-color: var(--footer-bg);
  border-color: var(--primary-color);
  color: var(--text-color);
}

[data-theme="dark"] .table {
  color: var(--text-color) !important;
  background-color: var(--table-bg) !important;
}

[data-theme="dark"] .table th,
[data-theme="dark"] .table td {
  background-color: var(--table-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

[data-theme="dark"] .table thead th {
  border-bottom-color: var(--border-color) !important;
}

[data-theme="dark"] .table tbody tr:hover td {
  background-color: var(--table-hover-bg) !important;
  color: var(--text-color) !important;
}

[data-theme="dark"] .table-hover tbody tr:hover {
  background-color: var(--table-hover-bg) !important;
  color: var(--text-color) !important;
}

[data-theme="dark"] input[type="date"] {
  background-color: var(--footer-bg) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

[data-theme="dark"] input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
}

[data-theme="dark"] input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  opacity: 0.8;
}

[data-theme="dark"] input::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}

[data-theme="dark"] input::-webkit-datetime-edit {
  color: var(--text-color);
}

[data-theme="dark"] input::-webkit-datetime-edit-fields-wrapper {
  color: var(--text-color);
}

[data-theme="dark"] input::-webkit-datetime-edit-text {
  color: var(--text-color);
}

[data-theme="dark"] input::-webkit-datetime-edit-month-field,
[data-theme="dark"] input::-webkit-datetime-edit-day-field,
[data-theme="dark"] input::-webkit-datetime-edit-year-field {
  color: var(--text-color);
}
</style>
