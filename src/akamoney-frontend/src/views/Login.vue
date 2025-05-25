<template>
  <div class="login-container">
    <div class="login-card">
      <img src="../assets/logo.png" alt="AkaMoney Logo" class="logo">
      <h1>AkaMoney URL Shortener Service</h1>
      <p>Please sign in to manage your short URLs</p>
      <button class="btn btn-primary login-btn" @click="login">
        <i class="fas fa-sign-in-alt"></i> Sign in with Microsoft Account
      </button>
    </div>
  </div>
</template>

<script>
import authService from '../services/authService';

export default {
  name: 'LoginView',
  methods: {
    login() {
      authService.login();
    }
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: var(--bg-color);
  transition: background-color 0.3s ease;
}

.login-card {
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--header-shadow);
  padding: 2rem;
  text-align: center;
  width: 100%;
  max-width: 400px;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
  border: 1px solid var(--border-color);
}

.logo {
  width: 80px;
  margin-bottom: 1rem;
}

.login-btn {
  margin-top: 1.5rem;
  width: 100%;
  padding: 10px;
}

h1 {
  color: var(--primary-color);
  margin-bottom: 1rem;
}

p {
  color: var(--text-color);
  margin-bottom: 1.5rem;
}
</style>
