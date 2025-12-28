<template>
  <div class="container">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2>
            <i class="bi bi-cloud-upload me-2"></i>Image Storage
          </h2>
          <div class="d-flex align-items-center gap-2">
            <span v-if="storageConfig" class="badge" :class="storageConfig.provider === 'azure' ? 'bg-info' : 'bg-warning'">
              <i :class="storageConfig.provider === 'azure' ? 'bi bi-cloud' : 'bi bi-cloud-haze2'"></i>
              {{ storageConfig.provider === 'azure' ? 'Azure Blob Storage' : 'Cloudflare R2' }}
            </span>
          </div>
        </div>

        <!-- Storage Config Status -->
        <div v-if="!storageConfig?.configured" class="alert alert-warning">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Storage is not configured. Please configure your storage provider.
        </div>

        <!-- Upload Section -->
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0"><i class="bi bi-upload me-2"></i>Upload Image</h5>
          </div>
          <div class="card-body">
            <div 
              class="upload-area p-4 text-center border border-2 border-dashed rounded"
              :class="{ 'drag-over': isDragging, 'border-primary': isDragging }"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <i class="bi bi-cloud-arrow-up fs-1 text-muted"></i>
              <p class="mt-2 mb-1">Drag and drop an image here, or click to select</p>
              <small class="text-muted">Supports: JPEG, PNG, GIF, WebP, SVG (Max 10MB)</small>
              <input 
                type="file" 
                ref="fileInput"
                class="d-none" 
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                @change="handleFileSelect"
              >
              <div class="mt-3">
                <button class="btn btn-primary" @click="triggerFileInput" :disabled="uploading">
                  <i class="bi bi-folder2-open me-2"></i>Choose File
                </button>
              </div>
            </div>

            <!-- Selected File Preview -->
            <div v-if="selectedFile" class="mt-3">
              <div class="alert alert-info d-flex align-items-center">
                <div class="me-3">
                  <img 
                    v-if="previewUrl" 
                    :src="previewUrl" 
                    alt="Preview" 
                    class="img-thumbnail"
                    style="max-width: 100px; max-height: 100px;"
                  >
                </div>
                <div class="flex-grow-1">
                  <strong>{{ selectedFile.name }}</strong>
                  <br>
                  <small class="text-muted">{{ formatFileSize(selectedFile.size) }} - {{ selectedFile.type }}</small>
                </div>
                <button class="btn btn-outline-secondary btn-sm" @click="clearSelectedFile">
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
              <button 
                class="btn btn-success" 
                @click="uploadFile" 
                :disabled="uploading"
              >
                <span v-if="uploading">
                  <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                  Uploading...
                </span>
                <span v-else>
                  <i class="bi bi-cloud-upload me-2"></i>Upload
                </span>
              </button>
            </div>

            <!-- Upload Error -->
            <div v-if="uploadError" class="alert alert-danger mt-3">
              <i class="bi bi-exclamation-circle me-2"></i>{{ uploadError }}
            </div>
          </div>
        </div>

        <!-- Files List -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0"><i class="bi bi-images me-2"></i>My Images</h5>
            <button class="btn btn-sm btn-outline-secondary" @click="loadFiles" :disabled="loadingFiles">
              <i class="bi bi-arrow-clockwise" :class="{ 'spin': loadingFiles }"></i>
            </button>
          </div>
          <div class="card-body">
            <!-- Loading State -->
            <div v-if="loadingFiles" class="text-center py-4">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="files.length === 0" class="text-center py-4">
              <i class="bi bi-image fs-1 text-muted"></i>
              <p class="mt-2 text-muted">No images uploaded yet</p>
            </div>

            <!-- Files Grid -->
            <div v-else class="row g-3">
              <div v-for="file in files" :key="file.key" class="col-md-4 col-lg-3">
                <div class="card h-100 file-card">
                  <div class="card-img-top bg-light d-flex align-items-center justify-content-center" style="height: 150px; overflow: hidden;">
                    <img 
                      v-if="file.url && isImageUrl(file.contentType)" 
                      :src="file.url" 
                      :alt="getFileName(file.key)"
                      class="img-fluid"
                      style="max-height: 150px; object-fit: cover;"
                      @error="handleImageError"
                    >
                    <i v-else class="bi bi-file-earmark-image fs-1 text-muted"></i>
                  </div>
                  <div class="card-body p-2">
                    <p class="card-text small text-truncate mb-1" :title="getFileName(file.key)">
                      {{ getFileName(file.key) }}
                    </p>
                    <small class="text-muted">{{ formatFileSize(file.size) }}</small>
                  </div>
                  <div class="card-footer bg-transparent p-2">
                    <div class="btn-group w-100">
                      <button 
                        v-if="file.url"
                        class="btn btn-sm btn-outline-primary"
                        @click="copyToClipboard(file.url)"
                        title="Copy URL"
                      >
                        <i :class="copiedKey === file.key ? 'bi bi-check2' : 'bi bi-clipboard'"></i>
                      </button>
                      <a 
                        v-if="file.url"
                        :href="file.url" 
                        target="_blank"
                        class="btn btn-sm btn-outline-secondary"
                        title="Open in new tab"
                      >
                        <i class="bi bi-box-arrow-up-right"></i>
                      </a>
                      <button 
                        class="btn btn-sm btn-outline-danger"
                        @click="confirmDelete(file.key)"
                        title="Delete"
                      >
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Load More -->
            <div v-if="hasMore" class="text-center mt-4">
              <button class="btn btn-outline-primary" @click="loadMoreFiles" :disabled="loadingFiles">
                <i class="bi bi-arrow-down-circle me-2"></i>Load More
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-trash me-2"></i>Confirm Delete</h5>
            <button type="button" class="btn-close" @click="showDeleteModal = false"></button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete this file?</p>
            <p class="text-muted small">{{ deleteFileKey }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showDeleteModal = false">
              Cancel
            </button>
            <button type="button" class="btn btn-danger" @click="handleDelete" :disabled="deleting">
              <span v-if="deleting">
                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                Deleting...
              </span>
              <span v-else>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Success Toast -->
    <div v-if="showSuccessToast" class="position-fixed top-0 end-0 p-3" style="z-index: 11">
      <div class="toast show" role="alert">
        <div class="toast-header bg-success text-white">
          <i class="bi bi-check-circle-fill me-2"></i>
          <strong class="me-auto">Success</strong>
          <button type="button" class="btn-close btn-close-white" @click="showSuccessToast = false"></button>
        </div>
        <div class="toast-body">
          {{ successMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import apiService from '@/services/api';

interface StorageFile {
  key: string;
  size: number;
  lastModified?: string;
  contentType?: string;
  url?: string;
}

interface StorageConfig {
  configured: boolean;
  provider: string;
  hasPublicUrl: boolean;
}

// Config
const storageConfig = ref<StorageConfig | null>(null);

// Upload state
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const uploading = ref(false);
const uploadError = ref<string | null>(null);
const isDragging = ref(false);

// Files state
const files = ref<StorageFile[]>([]);
const loadingFiles = ref(false);
const hasMore = ref(false);
const cursor = ref<string | undefined>(undefined);

// Delete state
const showDeleteModal = ref(false);
const deleteFileKey = ref<string | null>(null);
const deleting = ref(false);

// Toast state
const showSuccessToast = ref(false);
const successMessage = ref('');
const copiedKey = ref<string | null>(null);

// Timeouts for cleanup
const timeoutIds: number[] = [];

onMounted(async () => {
  await loadStorageConfig();
  await loadFiles();
});

onBeforeUnmount(() => {
  timeoutIds.forEach(id => window.clearTimeout(id));
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
});

async function loadStorageConfig() {
  try {
    storageConfig.value = await apiService.getStorageConfig();
  } catch (error) {
    console.error('Failed to load storage config:', error);
  }
}

async function loadFiles() {
  loadingFiles.value = true;
  cursor.value = undefined;
  try {
    const result = await apiService.listFiles(50);
    files.value = result.files;
    hasMore.value = result.hasMore;
    cursor.value = result.cursor;
  } catch (error) {
    console.error('Failed to load files:', error);
  } finally {
    loadingFiles.value = false;
  }
}

async function loadMoreFiles() {
  if (!hasMore.value || !cursor.value) return;
  
  loadingFiles.value = true;
  try {
    const result = await apiService.listFiles(50, cursor.value);
    files.value = [...files.value, ...result.files];
    hasMore.value = result.hasMore;
    cursor.value = result.cursor;
  } catch (error) {
    console.error('Failed to load more files:', error);
  } finally {
    loadingFiles.value = false;
  }
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectFile(target.files[0]);
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    selectFile(event.dataTransfer.files[0]);
  }
}

function selectFile(file: File) {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    uploadError.value = 'Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.';
    return;
  }
  
  // Validate file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = 'File too large. Maximum size is 10MB.';
    return;
  }
  
  selectedFile.value = file;
  uploadError.value = null;
  
  // Create preview URL
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
  previewUrl.value = URL.createObjectURL(file);
}

function clearSelectedFile() {
  selectedFile.value = null;
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

async function uploadFile() {
  if (!selectedFile.value) return;
  
  uploading.value = true;
  uploadError.value = null;
  
  try {
    const result = await apiService.uploadImage(selectedFile.value);
    
    // Show success message
    successMessage.value = `Successfully uploaded: ${result.originalName}`;
    showSuccessToast.value = true;
    const timeoutId = window.setTimeout(() => {
      showSuccessToast.value = false;
    }, 5000);
    timeoutIds.push(timeoutId);
    
    // Clear selected file and reload list
    clearSelectedFile();
    await loadFiles();
  } catch (error: any) {
    uploadError.value = error.response?.data?.message || 'Failed to upload file';
    console.error('Upload error:', error);
  } finally {
    uploading.value = false;
  }
}

function confirmDelete(key: string) {
  deleteFileKey.value = key;
  showDeleteModal.value = true;
}

async function handleDelete() {
  if (!deleteFileKey.value) return;
  
  deleting.value = true;
  try {
    await apiService.deleteFile(deleteFileKey.value);
    
    // Show success message
    successMessage.value = 'File deleted successfully';
    showSuccessToast.value = true;
    const timeoutId = window.setTimeout(() => {
      showSuccessToast.value = false;
    }, 5000);
    timeoutIds.push(timeoutId);
    
    // Close modal and reload
    showDeleteModal.value = false;
    deleteFileKey.value = null;
    await loadFiles();
  } catch (error: any) {
    console.error('Delete error:', error);
    uploadError.value = error.response?.data?.message || 'Failed to delete file';
  } finally {
    deleting.value = false;
  }
}

async function copyToClipboard(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    
    // Find the file key for this URL
    const file = files.value.find(f => f.url === url);
    if (file) {
      copiedKey.value = file.key;
      const timeoutId = window.setTimeout(() => {
        copiedKey.value = null;
      }, 2000);
      timeoutIds.push(timeoutId);
    }
    
    successMessage.value = 'URL copied to clipboard';
    showSuccessToast.value = true;
    const timeoutId = window.setTimeout(() => {
      showSuccessToast.value = false;
    }, 3000);
    timeoutIds.push(timeoutId);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileName(key: string): string {
  return key.split('/').pop() || key;
}

function isImageUrl(contentType?: string): boolean {
  if (!contentType) return false;
  return contentType.startsWith('image/');
}

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.style.display = 'none';
}
</script>

<style scoped>
.upload-area {
  cursor: pointer;
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

.file-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.file-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
