<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <div class="text-center mb-5">
          <h1 class="display-4">URL Shortener</h1>
          <p class="lead">Create short, memorable links in seconds</p>
        </div>

        <div class="card shadow">
          <div class="card-body p-4">
            <form @submit.prevent="handleSubmit">
              <div class="mb-3">
                <label for="originalUrl" class="form-label">Enter your long URL</label>
                <input
                  type="url"
                  class="form-control form-control-lg"
                  id="originalUrl"
                  v-model="formData.original_url"
                  placeholder="https://example.com/very-long-url"
                  required
                />
              </div>

              <div class="mb-3">
                <label for="shortCode" class="form-label">
                  Custom short code (optional)
                </label>
                <div class="input-group">
                  <span class="input-group-text">{{ shortDomain }}/</span>
                  <input
                    type="text"
                    class="form-control"
                    id="shortCode"
                    v-model="formData.short_code"
                    placeholder="my-link"
                    pattern="[a-zA-Z0-9-_]{3,20}"
                  />
                </div>
                <div class="form-text">
                  3-20 characters: letters, numbers, hyphens, and underscores only
                </div>
              </div>

              <div v-if="error" class="alert alert-danger" role="alert">
                {{ error }}
              </div>

              <div class="d-grid">
                <button
                  type="submit"
                  class="btn btn-primary btn-lg"
                  :disabled="loading"
                >
                  <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                  Shorten URL
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Result -->
        <div v-if="shortUrl" class="card shadow mt-4">
          <div class="card-body">
            <h5 class="card-title">Your shortened URL:</h5>
            <div class="input-group mb-3">
              <input
                type="text"
                class="form-control"
                :value="fullShortUrl"
                readonly
                ref="shortUrlInput"
              />
              <button
                class="btn btn-outline-secondary"
                type="button"
                @click="copyToClipboard"
              >
                <i class="bi bi-clipboard"></i> Copy
              </button>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <a :href="fullShortUrl" target="_blank" class="btn btn-sm btn-outline-primary">
                <i class="bi bi-box-arrow-up-right"></i> Open
              </a>
              <small class="text-muted">Clicks: {{ shortUrl.click_count }}</small>
            </div>
          </div>
        </div>

        <!-- Features -->
        <div class="row mt-5">
          <div class="col-md-4 text-center mb-4">
            <div class="feature-icon">
              <i class="bi bi-lightning-charge-fill fs-1 text-primary"></i>
            </div>
            <h5>Fast & Reliable</h5>
            <p class="text-muted">Powered by Cloudflare's global network</p>
          </div>
          <div class="col-md-4 text-center mb-4">
            <div class="feature-icon">
              <i class="bi bi-graph-up fs-1 text-primary"></i>
            </div>
            <h5>Analytics</h5>
            <p class="text-muted">Track clicks and understand your audience</p>
          </div>
          <div class="col-md-4 text-center mb-4">
            <div class="feature-icon">
              <i class="bi bi-shield-check fs-1 text-primary"></i>
            </div>
            <h5>Secure</h5>
            <p class="text-muted">Your data is safe and encrypted</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useUrlStore } from '@/stores/url';
import type { UrlResponse } from '@/types';

const urlStore = useUrlStore();
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';

const formData = ref({
  original_url: '',
  short_code: ''
});

const shortUrl = ref<UrlResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const shortUrlInput = ref<HTMLInputElement | null>(null);

const fullShortUrl = ref('');

const handleSubmit = async () => {
  loading.value = true;
  error.value = null;
  shortUrl.value = null;

  try {
    const data: any = {
      original_url: formData.value.original_url
    };

    if (formData.value.short_code) {
      data.short_code = formData.value.short_code;
    }

    const result = await urlStore.createUrl(data);
    shortUrl.value = result;
    fullShortUrl.value = `${shortDomain}/${result.short_code}`;

    // Reset form
    formData.value.original_url = '';
    formData.value.short_code = '';
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to create short URL';
  } finally {
    loading.value = false;
  }
};

const copyToClipboard = async () => {
  if (shortUrlInput.value) {
    try {
      await navigator.clipboard.writeText(fullShortUrl.value);
      // Show success message (could be replaced with toast notification)
      const button = shortUrlInput.value.nextElementSibling;
      const originalText = button?.textContent;
      if (button) {
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText || 'Copy';
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
};
</script>

<style scoped>
.feature-icon {
  margin-bottom: 1rem;
}
</style>
