<template>
  <div>
    <form @submit.prevent="handleSubmit">
      <div class="mb-3">
        <label for="originalUrl" class="form-label">
          {{ mode === 'modal' ? 'Original URL *' : 'Enter your long URL' }}
        </label>
        <input
          type="url"
          :class="['form-control', mode === 'page' ? 'form-control-lg' : '']"
          id="originalUrl"
          v-model="formData.original_url"
          placeholder="https://example.com/very-long-url"
          required
        />
      </div>

      <div class="mb-3">
        <label for="shortCode" class="form-label">
          Custom short code *
        </label>
        <div v-if="mode === 'page'" class="input-group">
          <span class="input-group-text">{{ shortDomain }}/</span>
          <input
            type="text"
            class="form-control"
            id="shortCode"
            v-model="formData.short_code"
            placeholder="my-link"
            pattern="[a-zA-Z0-9-_]{3,20}"
            required
          />
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click="generateRandomCode"
            title="Generate random 8-character code"
          >
            <i class="bi bi-shuffle"></i> Random
          </button>
        </div>
        <div v-else class="input-group">
          <input
            type="text"
            class="form-control"
            id="shortCode"
            v-model="formData.short_code"
            placeholder="my-link"
            pattern="[a-zA-Z0-9-_]{3,20}"
            required
          />
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click="generateRandomCode"
            title="Generate random 8-character code"
          >
            <i class="bi bi-shuffle"></i> Random
          </button>
        </div>
        <div class="form-text">
          3-20 characters: letters, numbers, hyphens, and underscores only. Click "Random" to generate an 8-character code.
        </div>
      </div>

      <div class="mb-3">
        <label for="title" class="form-label">Title (optional)</label>
        <input
          type="text"
          class="form-control"
          id="title"
          v-model="formData.title"
          placeholder="My Link"
        />
      </div>

      <div class="mb-3">
        <label for="description" class="form-label">Description (optional)</label>
        <textarea
          class="form-control"
          id="description"
          v-model="formData.description"
          placeholder="A brief description of your link"
          rows="2"
        ></textarea>
      </div>

      <div class="mb-3">
        <label for="expiresAt" class="form-label">Expiration date (optional)</label>
        <input
          type="datetime-local"
          class="form-control"
          id="expiresAt"
          v-model="expiresAtInput"
        />
        <div class="form-text">
          Leave empty for links that never expire
        </div>
      </div>

      <div v-if="error" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

      <div v-if="mode === 'page'" class="d-grid">
        <button
          type="submit"
          class="btn btn-primary btn-lg"
          :disabled="loading"
        >
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          Shorten URL
        </button>
      </div>
      <div v-else class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-secondary" @click="handleCancel">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          Create
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { nanoid } from 'nanoid';
import { useUrlStore } from '@/stores/url';
import type { UrlResponse, CreateUrlRequest } from '@/types';

interface Props {
  mode?: 'modal' | 'page';
}

withDefaults(defineProps<Props>(), {
  mode: 'page'
});

const emit = defineEmits<{
  created: [url: UrlResponse];
  cancel: [];
}>();

const urlStore = useUrlStore();
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';

const formData = ref({
  original_url: '',
  short_code: '',
  title: '',
  description: ''
});

const expiresAtInput = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

const generateRandomCode = () => {
  formData.value.short_code = nanoid(8);
};

const handleSubmit = async () => {
  loading.value = true;
  error.value = null;

  try {
    const data: CreateUrlRequest = {
      original_url: formData.value.original_url,
      short_code: formData.value.short_code
    };

    if (formData.value.title) {
      data.title = formData.value.title;
    }

    if (formData.value.description) {
      data.description = formData.value.description;
    }

    if (expiresAtInput.value) {
      const expiresDate = new Date(expiresAtInput.value);
      data.expires_at = expiresDate.getTime();
    }

    const result = await urlStore.createUrl(data);

    // Reset form
    formData.value = {
      original_url: '',
      short_code: '',
      title: '',
      description: ''
    };
    expiresAtInput.value = '';

    // Emit created event
    emit('created', result);
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to create short URL';
  } finally {
    loading.value = false;
  }
};

const handleCancel = () => {
  emit('cancel');
};
</script>
