<template>
  <div class="login-container">
    <div class="login-card">
      <img src="../assets/logo.png" alt="AkaMoney Logo" class="logo">
      <h1>AkaMoney 短網址服務</h1>
      <p>請登入以管理您的短網址</p>
      <button class="btn btn-primary login-btn" @click="login">
        <i class="fas fa-sign-in-alt"></i> 使用 Microsoft 帳號登入
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
  background-color: #f8f9fa;
}

.login-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  text-align: center;
  width: 100%;
  max-width: 400px;
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
  color: #007bff;
  margin-bottom: 1rem;
}

p {
  color: #6c757d;
  margin-bottom: 1.5rem;
}
</style>
