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
          Custom short code (optional)
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
          />
        </div>
        <input
          v-else
          type="text"
          class="form-control"
          id="shortCode"
          v-model="formData.short_code"
          placeholder="my-link"
          pattern="[a-zA-Z0-9-_]{3,20}"
        />
        <div class="form-text">
          3-20 characters: letters, numbers, hyphens, and underscores only
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

      <!-- Preview Image Upload -->
      <div class="mb-3">
        <label class="form-label">
          <i class="bi bi-image me-1"></i>Preview Image (optional)
        </label>
        <div class="form-text mb-2">
          Upload an image for link preview when sharing on social media
        </div>
        
        <!-- Current/Preview Image -->
        <div v-if="previewImageUrl || formData.image_url" class="mb-2">
          <div class="position-relative d-inline-block">
            <img 
              :src="previewImageUrl || formData.image_url" 
              alt="Preview" 
              class="img-thumbnail"
              style="max-width: 200px; max-height: 150px;"
            >
            <button 
              type="button"
              class="btn btn-sm btn-danger position-absolute top-0 end-0"
              @click="clearPreviewImage"
              title="Remove image"
            >
              <i class="bi bi-x"></i>
            </button>
          </div>
        </div>
        
        <!-- Upload Area -->
        <div 
          v-if="!previewImageUrl && !formData.image_url"
          class="upload-area p-3 text-center border border-2 border-dashed rounded"
          :class="{ 'drag-over': isDragging, 'border-primary': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
          @click="triggerFileInput"
          style="cursor: pointer;"
        >
          <i class="bi bi-cloud-arrow-up fs-4 text-muted"></i>
          <p class="mb-0 small text-muted">Drag & drop or click to upload</p>
          <small class="text-muted">JPEG, PNG, GIF, WebP (Max 10MB)</small>
        </div>
        <input 
          type="file" 
          ref="fileInput"
          class="d-none" 
          accept="image/jpeg,image/png,image/gif,image/webp"
          @change="handleFileSelect"
        >
        
        <!-- Upload Progress -->
        <div v-if="imageUploading" class="mt-2">
          <div class="spinner-border spinner-border-sm me-2" role="status"></div>
          <span class="small">Uploading image...</span>
        </div>
        
        <!-- Image Error -->
        <div v-if="imageError" class="alert alert-danger mt-2 py-1 px-2 small">
          {{ imageError }}
        </div>
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
          :disabled="loading || imageUploading"
        >
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          Shorten URL
        </button>
      </div>
      <div v-else class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-secondary" @click="handleCancel">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="loading || imageUploading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          Create
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { useUrlStore } from '@/stores/url';
import apiService from '@/services/api';
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
  description: '',
  image_url: ''
});

const expiresAtInput = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

// Image upload state
const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const previewImageUrl = ref<string | null>(null);
const imageUploading = ref(false);
const imageError = ref<string | null>(null);

// Cleanup preview URL on unmount
onBeforeUnmount(() => {
  if (previewImageUrl.value) {
    URL.revokeObjectURL(previewImageUrl.value);
  }
});

const triggerFileInput = () => {
  fileInput.value?.click();
};

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    uploadImage(target.files[0]);
  }
};

const handleDrop = (event: DragEvent) => {
  isDragging.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    uploadImage(event.dataTransfer.files[0]);
  }
};

const uploadImage = async (file: File) => {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    imageError.value = 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.';
    return;
  }
  
  // Validate file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    imageError.value = 'File too large. Maximum size is 10MB.';
    return;
  }
  
  imageError.value = null;
  imageUploading.value = true;
  
  // Create local preview
  if (previewImageUrl.value) {
    URL.revokeObjectURL(previewImageUrl.value);
  }
  previewImageUrl.value = URL.createObjectURL(file);
  
  try {
    const result = await apiService.uploadImage(file);
    formData.value.image_url = result.url || '';
  } catch (err: any) {
    imageError.value = err.response?.data?.message || 'Failed to upload image';
    // Clear preview on error
    if (previewImageUrl.value) {
      URL.revokeObjectURL(previewImageUrl.value);
      previewImageUrl.value = null;
    }
  } finally {
    imageUploading.value = false;
  }
};

const clearPreviewImage = () => {
  if (previewImageUrl.value) {
    URL.revokeObjectURL(previewImageUrl.value);
    previewImageUrl.value = null;
  }
  formData.value.image_url = '';
  imageError.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const handleSubmit = async () => {
  loading.value = true;
  error.value = null;

  try {
    const data: CreateUrlRequest = {
      original_url: formData.value.original_url
    };

    if (formData.value.short_code) {
      data.short_code = formData.value.short_code;
    }

    if (formData.value.title) {
      data.title = formData.value.title;
    }

    if (formData.value.description) {
      data.description = formData.value.description;
    }

    if (formData.value.image_url) {
      data.image_url = formData.value.image_url;
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
      description: '',
      image_url: ''
    };
    expiresAtInput.value = '';
    clearPreviewImage();

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

<style scoped>
.upload-area {
  transition: all 0.2s ease;
  background-color: var(--bs-body-bg);
}

.upload-area:hover {
  background-color: var(--bs-tertiary-bg);
}

.upload-area.drag-over {
  background-color: var(--bs-primary-bg-subtle);
}

.border-dashed {
  border-style: dashed !important;
}
</style>
