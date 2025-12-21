<template>
  <div class="container">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2>My URLs</h2>
          <button class="btn btn-primary" @click="openCreateModal">
            <i class="bi bi-plus-lg"></i> Create New
          </button>
        </div>

        <!-- Loading State -->
        <div v-if="urlStore.loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="urlStore.error" class="alert alert-danger" role="alert">
          {{ urlStore.error }}
        </div>

        <!-- Empty State -->
        <div v-else-if="urlStore.urls.length === 0" class="text-center py-5">
          <i class="bi bi-link-45deg fs-1 text-muted"></i>
          <h4 class="mt-3">No URLs yet</h4>
          <p class="text-muted">Create your first shortened URL to get started</p>
        </div>

        <!-- URLs List -->
        <div v-else class="row">
          <div v-for="url in urlStore.urls" :key="url.id" class="col-12 mb-3">
            <div class="card">
              <div class="card-body">
                <div class="row align-items-center">
                  <div class="col-md-6">
                    <h5 class="card-title mb-1">
                      <a :href="`${shortDomain}/${url.short_code}`" target="_blank" class="text-decoration-none">
                        {{ shortDomain }}/{{ url.short_code }}
                      </a>
                    </h5>
                    <p class="card-text text-muted small mb-0">
                      {{ truncate(url.original_url, 60) }}
                    </p>
                  </div>
                  <div class="col-md-3 text-center">
                    <div class="d-flex align-items-center justify-content-center">
                      <i class="bi bi-bar-chart-fill me-2 text-primary"></i>
                      <span class="fw-bold">{{ url.click_count }}</span>
                      <span class="text-muted ms-1">clicks</span>
                    </div>
                    <small class="text-muted">
                      {{ formatDate(url.created_at) }}
                    </small>
                  </div>
                  <div class="col-md-3 text-end">
                    <div class="btn-group">
                      <router-link
                        :to="`/analytics/${url.short_code}`"
                        class="btn btn-sm btn-outline-primary"
                      >
                        <i class="bi bi-graph-up"></i> Analytics
                      </router-link>
                      <button
                        class="btn btn-sm btn-outline-secondary"
                        @click="openEditModal(url)"
                      >
                        <i class="bi bi-pencil"></i> Edit
                      </button>
                      <button
                        class="btn btn-sm btn-outline-danger"
                        @click="confirmDelete(url.id)"
                      >
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <nav v-if="urlStore.pagination.total_pages > 1" class="mt-4">
          <ul class="pagination justify-content-center">
            <li class="page-item" :class="{ disabled: urlStore.pagination.page === 1 }">
              <a class="page-link" href="#" @click.prevent="loadPage(urlStore.pagination.page - 1)">
                Previous
              </a>
            </li>
            <li
              v-for="page in urlStore.pagination.total_pages"
              :key="page"
              class="page-item"
              :class="{ active: page === urlStore.pagination.page }"
            >
              <a class="page-link" href="#" @click.prevent="loadPage(page)">{{ page }}</a>
            </li>
            <li
              class="page-item"
              :class="{ disabled: urlStore.pagination.page === urlStore.pagination.total_pages }"
            >
              <a class="page-link" href="#" @click.prevent="loadPage(urlStore.pagination.page + 1)">
                Next
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    <!-- Create URL Modal -->
    <div v-if="showCreateModal" class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Create Short URL</h5>
            <button type="button" class="btn-close" @click="closeCreateModal"></button>
          </div>
          <div class="modal-body">
            <UrlCreateForm mode="modal" @created="onUrlCreated" @cancel="closeCreateModal" />
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Confirm Delete</h5>
            <button type="button" class="btn-close" @click="showDeleteModal = false"></button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete this URL? This action cannot be undone.</p>
            <div v-if="deleteError" class="alert alert-danger">{{ deleteError }}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showDeleteModal = false">
              Cancel
            </button>
            <button type="button" class="btn btn-danger" @click="handleDelete">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit URL Modal -->
    <div v-if="showEditModal" class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-pencil me-2"></i>Edit URL
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="closeEditModal"
            ></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="handleEditSubmit">
              <!-- Short Code (Read-only) -->
              <div class="mb-3">
                <label for="editShortCode" class="form-label">Short Code</label>
                <input
                  type="text"
                  class="form-control"
                  id="editShortCode"
                  v-model="editForm.short_code"
                  disabled
                />
                <small class="text-muted">Short code cannot be changed</small>
              </div>

              <!-- Original URL -->
              <div class="mb-3">
                <label for="editOriginalUrl" class="form-label">
                  Original URL <span class="text-danger">*</span>
                </label>
                <input
                  type="url"
                  class="form-control"
                  id="editOriginalUrl"
                  v-model="editForm.original_url"
                  required
                  placeholder="https://example.com"
                />
              </div>

              <!-- Title -->
              <div class="mb-3">
                <label for="editTitle" class="form-label">Title (Optional)</label>
                <input
                  type="text"
                  class="form-control"
                  id="editTitle"
                  v-model="editForm.title"
                  placeholder="My Link"
                />
              </div>

              <!-- Description -->
              <div class="mb-3">
                <label for="editDescription" class="form-label">Description (Optional)</label>
                <textarea
                  class="form-control"
                  id="editDescription"
                  v-model="editForm.description"
                  rows="3"
                  placeholder="Optional description"
                ></textarea>
              </div>

              <!-- Active Status -->
              <div class="mb-3 form-check">
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="editIsActive"
                  v-model="editForm.is_active"
                />
                <label class="form-check-label" for="editIsActive">
                  Active (uncheck to disable this short URL)
                </label>
              </div>

              <!-- Expiration Date -->
              <div class="mb-3">
                <label for="editExpiresAt" class="form-label">Expiration Date (Optional)</label>
                <input
                  type="datetime-local"
                  class="form-control"
                  id="editExpiresAt"
                  v-model="editForm.expires_at_local"
                />
                <small class="text-muted">Leave empty for no expiration</small>
              </div>

              <!-- Error Display -->
              <div v-if="editError" class="alert alert-danger" role="alert">
                {{ editError }}
              </div>

              <!-- Submit Buttons -->
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  @click="closeEditModal"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="editLoading"
                >
                  <span v-if="editLoading">
                    <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                    Saving...
                  </span>
                  <span v-else>
                    <i class="bi bi-check-lg me-2"></i>Save Changes
                  </span>
                </button>
              </div>
            </form>
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
import { ref, onMounted } from 'vue';
import { useUrlStore } from '@/stores/url';
import UrlCreateForm from '@/components/UrlCreateForm.vue';
import type { UrlResponse } from '@/types';

const urlStore = useUrlStore();
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';

const showCreateModal = ref(false);
const showEditModal = ref(false);
const deleteUrlId = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleteError = ref<string | null>(null);
const showSuccessToast = ref(false);
const successMessage = ref('');

// Edit modal state
const editForm = ref({
  id: '',
  short_code: '',
  original_url: '',
  title: '',
  description: '',
  is_active: true,
  expires_at_local: ''
});
const editLoading = ref(false);
const editError = ref<string | null>(null);

onMounted(() => {
  urlStore.fetchUrls();
});

const loadPage = (page: number) => {
  urlStore.fetchUrls(page);
};

const openCreateModal = () => {
  showCreateModal.value = true;
};

const closeCreateModal = () => {
  showCreateModal.value = false;
};

const onUrlCreated = async (url: UrlResponse) => {
  closeCreateModal();
  await urlStore.fetchUrls();
  
  // Show success toast notification
  successMessage.value = `Successfully created short URL: ${url.short_code}`;
  showSuccessToast.value = true;
  
  // Auto-hide toast after 3 seconds
  setTimeout(() => {
    showSuccessToast.value = false;
  }, 3000);
};

const confirmDelete = (id: string) => {
  deleteUrlId.value = id;
  showDeleteModal.value = true;
  deleteError.value = null;
};

const handleDelete = async () => {
  if (!deleteUrlId.value) return;
  
  try {
    await urlStore.deleteUrl(deleteUrlId.value);
    showDeleteModal.value = false;
    deleteUrlId.value = null;
  } catch (err: any) {
    deleteError.value = err.response?.data?.message || 'Failed to delete URL';
  }
};

// Open edit modal
const openEditModal = (url: UrlResponse) => {
  editForm.value = {
    id: url.id,
    short_code: url.short_code,
    original_url: url.original_url,
    title: url.title || '',
    description: url.description || '',
    is_active: url.is_active,
    expires_at_local: url.expires_at ? timestampToLocalDatetime(url.expires_at) : ''
  };
  editError.value = null;
  showEditModal.value = true;
};

// Close edit modal
const closeEditModal = () => {
  showEditModal.value = false;
  editError.value = null;
};

// Handle edit form submission
const handleEditSubmit = async () => {
  try {
    editLoading.value = true;
    editError.value = null;

    const updateData: any = {
      original_url: editForm.value.original_url,
      title: editForm.value.title || undefined,
      description: editForm.value.description || undefined,
      is_active: editForm.value.is_active
    };

    // Convert local datetime to timestamp if provided
    if (editForm.value.expires_at_local) {
      updateData.expires_at = new Date(editForm.value.expires_at_local).getTime();
    } else {
      updateData.expires_at = null;
    }

    await urlStore.updateUrl(editForm.value.id, updateData);
    
    // Close modal
    closeEditModal();
    
    // Show success message
    successMessage.value = `Successfully updated URL: ${editForm.value.short_code}`;
    showSuccessToast.value = true;
    
    // Auto-hide toast after 3 seconds
    setTimeout(() => {
      showSuccessToast.value = false;
    }, 3000);
  } catch (err: any) {
    editError.value = err.response?.data?.message || 'Failed to update URL';
    console.error('Error updating URL:', err);
  } finally {
    editLoading.value = false;
  }
};

// Helper function to convert timestamp to local datetime input format
const timestampToLocalDatetime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};
</script>
