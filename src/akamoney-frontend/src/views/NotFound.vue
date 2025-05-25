<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <i class="fas fa-exclamation-triangle fa-4x"></i>
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for does not exist or has been removed.</p>
      <button class="btn btn-primary" @click="goHome">
        <i class="fas fa-home"></i> Return to Home
      </button>
    </div>
  </div>
</template>

<script>
import { useRouter } from 'vue-router';

export default {
  name: 'NotFound',
  setup() {
    const router = useRouter();
    
    const goHome = () => {
      router.push('/');
    };
    
    return { goHome };
  }
}
</script>

<style scoped>
.not-found-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: var(--bg-color);
  transition: background-color 0.3s ease;
}

.not-found-content {
  max-width: 500px;
  padding: 2rem;
  text-align: center;
  background-color: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--header-shadow);
  border: 1px solid var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

i {
  color: var(--warning-color);
  margin-bottom: 1.5rem;
  transition: color 0.3s ease;
}

h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: var(--text-color);
  transition: color 0.3s ease;
}

p {
  color: var(--footer-text);
  margin-bottom: 2rem;
  transition: color 0.3s ease;
}

/* Button hover states for dark mode */
.btn-primary:hover {
  border-color: var(--primary-color);
}
</style>
