<template>
  <div id="app">
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
      <div class="container">
        <router-link to="/" class="navbar-brand">
          <strong>{{ appName }}</strong>
        </router-link>
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-auto">
            <li v-if="authStore.isAuthenticated" class="nav-item">
              <router-link to="/dashboard" class="nav-link">Dashboard</router-link>
            </li>
            <li v-if="authStore.isAuthenticated" class="nav-item">
              <router-link to="/stats" class="nav-link">
                <i class="bi bi-bar-chart-line me-1"></i>Statistics
              </router-link>
            </li>
            <li v-if="authStore.isAuthenticated" class="nav-item">
              <router-link to="/db-usage" class="nav-link">
                <i class="bi bi-database me-1"></i>Usage
              </router-link>
            </li>
            <li class="nav-item">
              <button
                class="nav-link btn btn-link"
                @click="themeStore.toggleTheme()"
                :aria-label="themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
                :title="themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
              >
                <i :class="['bi', themeStore.toggleIcon]"></i>
              </button>
            </li>
            <li v-if="authStore.isAuthenticated" class="nav-item dropdown">
              <a
                class="nav-link dropdown-toggle"
                href="#"
                id="userDropdown"
                role="button"
                data-bs-toggle="dropdown"
              >
                {{ authStore.userName }}
              </a>
              <ul class="dropdown-menu dropdown-menu-end">
                <li>
                  <a class="dropdown-item" href="#" @click.prevent="handleLogout">Logout</a>
                </li>
              </ul>
            </li>
            <li v-else class="nav-item">
              <router-link to="/login" class="nav-link">Login</router-link>
            </li>
          </ul>
        </div>
      </div>
    </nav>

    <main class="py-4">
      <router-view />
    </main>

    <footer class="footer mt-auto py-3 bg-body-secondary">
      <div class="container text-center">
        <span class="text-body-secondary">{{ appName }} &copy; 2024</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useRouter } from 'vue-router';

const appName = import.meta.env.VITE_APP_NAME || 'AkaMoney';
const authStore = useAuthStore();
const themeStore = useThemeStore();
const router = useRouter();

onMounted(async () => {
  await authStore.initialize();
});

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<style>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

.footer {
  margin-top: auto;
}

/* Theme toggle button styling */
.nav-link.btn-link {
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
}

.nav-link.btn-link:hover {
  opacity: 0.8;
}

/* Smooth theme transition */
html {
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* Limit transitions to specific elements for better performance */
.card,
.modal,
.dropdown-menu,
.navbar,
.btn,
.form-control,
.form-select,
.alert,
.badge,
.list-group-item,
.table,
.progress,
.footer {
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
</style>
