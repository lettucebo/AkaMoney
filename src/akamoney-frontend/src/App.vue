<template>
  <div id="app">
    <header v-if="isAuthenticated && !isLoginPage" class="app-header">
      <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
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
            <div class="d-flex">
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
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import authService from './services/authService';

export default {
  name: 'App',
  setup() {
    const route = useRoute();
    const userInfo = ref(null);
    
    const isAuthenticated = computed(() => authService.isAuthenticated());
    const isLoginPage = computed(() => route.path === '/login');
    
    const logout = () => {
      authService.logout();
    };
    
    onMounted(() => {
      // Get user info if authenticated
      if (isAuthenticated.value) {
        const account = authService.getAccount();
        if (account) {
          userInfo.value = {
            name: account.name || account.username,
            email: account.username
          };
        }
      }
    });
    
    return {
      isAuthenticated,
      isLoginPage,
      userInfo,
      logout
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
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f8f9fa;
  color: #212529;
  margin: 0;
  padding: 0;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

.app-header {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
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
  background-color: #f8f9fa;
  border-top: 1px solid #dee2e6;
  color: #6c757d;
}

/* Utility classes */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
