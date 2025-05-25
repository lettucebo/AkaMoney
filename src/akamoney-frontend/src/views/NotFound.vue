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
  background-color: #f8f9fa;
}

.not-found-content {
  max-width: 500px;
  padding: 2rem;
  text-align: center;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

i {
  color: #ffc107;
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
}

p {
  color: #6c757d;
  margin-bottom: 2rem;
}
</style>
