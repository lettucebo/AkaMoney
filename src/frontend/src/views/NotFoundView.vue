<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-6 text-center">
        <div class="error-page">
          <h1 class="display-1 text-body-tertiary">404</h1>
          <h2 class="mb-4">Page Not Found</h2>
          <p class="lead text-body-secondary mb-4">
            The page you are looking for doesn't exist or has been moved.
          </p>
          <router-link to="/" class="btn btn-primary">
            <i class="bi bi-house"></i> Go Home
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.error-page {
  padding: 4rem 0;
}

.display-1 {
  font-size: 8rem;
  font-weight: 700;
}
</style>
