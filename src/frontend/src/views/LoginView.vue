<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-6 col-lg-4">
        <div class="card shadow">
          <div class="card-body p-5">
            <h2 class="text-center mb-4">Login</h2>
            <p class="text-center text-muted mb-4">
              Sign in with your Microsoft account to manage your URLs
            </p>

            <div v-if="authSkipped" class="alert alert-warning" role="alert">
              <i class="bi bi-exclamation-triangle me-2"></i>
              Authentication skipped (Development Mode)
            </div>

            <div v-if="error" class="alert alert-danger" role="alert">
              {{ error }}
            </div>

            <div class="d-grid">
              <button
                @click="handleLogin"
                class="btn btn-primary btn-lg"
                :disabled="loading"
              >
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                <i v-else class="bi bi-microsoft me-2"></i>
                Sign in with Microsoft
              </button>
            </div>

            <div class="text-center mt-4">
              <small class="text-muted">
                By signing in, you agree to our Terms of Service
              </small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { AuthConfigurationError, isAuthSkipped } from '@/services/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref<string | null>(null);
const authSkipped = ref(isAuthSkipped());

onMounted(async () => {
  // Auto-login when auth is skipped in development mode
  if (authSkipped.value) {
    loading.value = true;
    try {
      await authStore.login();
      const redirect = (route.query.redirect as string) || '/dashboard';
      router.push(redirect);
    } catch (err) {
      console.error('Auto-login failed:', err);
      error.value = 'Auto-login failed. Please try manual login.';
    } finally {
      loading.value = false;
    }
  }
});

const handleLogin = async () => {
  loading.value = true;
  error.value = null;

  try {
    // Use loginRedirect instead of login (loginPopup)
    await authStore.loginRedirect();
    // Note: Code after this won't execute when using redirect
    // because the page will redirect
  } catch (err) {
    if (err instanceof AuthConfigurationError) {
      error.value =
        err.message || 'Authentication is not configured. Please contact the administrator.';
    } else {
      error.value = 'Failed to sign in. Please try again.';
    }
    console.error('Login error:', err);
  } finally {
    loading.value = false;
  }
};
</script>
