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

        <!-- Search Box -->
        <div v-if="!urlStore.loading && urlStore.urls.length > 0" class="mb-4">
          <div class="input-group">
            <span class="input-group-text">
              <i class="bi bi-search"></i>
            </span>
            <input 
              type="text" 
              class="form-control" 
              placeholder="Search by short code, URL, or title..." 
              v-model="searchQuery"
              aria-label="Search URLs"
            >
            <button 
              v-if="searchQuery" 
              class="btn btn-outline-secondary" 
              @click="searchQuery = ''"
              type="button"
              aria-label="Clear search"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <small v-if="searchQuery" class="text-muted">
            Found {{ totalFilteredCount }} of {{ urlStore.urls.length }} URLs
          </small>
        </div>

        <!-- URLs List -->
        <div v-if="!urlStore.loading && urlStore.urls.length > 0" class="row">
          <div v-for="url in filteredUrls" :key="url.id" class="col-12 mb-3">
            <div class="card">
              <div class="card-body">
                <div class="row align-items-center">
                  <div class="col-md-6">
                    <!-- Short URL with Copy Button -->
                    <div class="d-flex align-items-center gap-2 mb-1">
                      <h5 class="card-title mb-0">
                        <a 
                          :href="`${shortDomain}/${url.short_code}`" 
                          target="_blank" 
                          class="text-decoration-none"
                        >
                          {{ shortDomain }}/{{ url.short_code }}
                        </a>
                      </h5>
                      <button 
                        class="btn btn-sm btn-outline-secondary"
                        @click="copyToClipboard(`${shortDomain}/${url.short_code}`, url.id)"
                        :title="copiedId === url.id ? 'Copied!' : 'Copy short URL'"
                        :aria-label="copiedId === url.id ? 'Copied!' : 'Copy short URL'"
                      >
                        <i :class="copiedId === url.id ? 'bi bi-check2' : 'bi bi-clipboard'"></i>
                        <span class="visually-hidden" role="status" aria-live="polite">
                          {{ copiedId === url.id ? 'Short URL copied to clipboard.' : '' }}
                        </span>
                      </button>
                    </div>
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
        <nav v-if="shouldShowPagination" class="mt-4" aria-label="Pagination">
          <ul class="pagination justify-content-center">
            <li class="page-item" :class="{ disabled: currentPage === 1 }">
              <a class="page-link" href="#" @click.prevent="goToPage(currentPage - 1)" :aria-disabled="currentPage === 1 ? 'true' : 'false'">
                Previous
              </a>
            </li>
            <li
              v-for="page in visiblePages"
              :key="page"
              class="page-item"
              :class="{ active: page === currentPage }"
            >
              <a class="page-link" href="#" @click.prevent="goToPage(page)">{{ page }}</a>
            </li>
            <li
              class="page-item"
              :class="{ disabled: currentPage === totalPages }"
            >
              <a class="page-link" href="#" @click.prevent="goToPage(currentPage + 1)" :aria-disabled="currentPage === totalPages ? 'true' : 'false'">
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

    <!-- Error Toast -->
    <div v-if="showErrorToast" class="position-fixed top-0 end-0 p-3" style="z-index: 11">
      <div class="toast show" role="alert">
        <div class="toast-header bg-danger text-white">
          <i class="bi bi-exclamation-circle-fill me-2"></i>
          <strong class="me-auto">Error</strong>
          <button type="button" class="btn-close btn-close-white" @click="showErrorToast = false"></button>
        </div>
        <div class="toast-body">
          {{ errorMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useUrlStore } from '@/stores/url';
import UrlCreateForm from '@/components/UrlCreateForm.vue';
import type { UrlResponse, UpdateUrlRequest } from '@/types';

const urlStore = useUrlStore();
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';

// Timeout constants
const COPY_FEEDBACK_DURATION = 2000;
const TOAST_DISPLAY_DURATION = 5000;

// Pagination constants
const PAGE_SIZE = 20;

// Search functionality
const searchQuery = ref('');
const searchCurrentPage = ref(1);

// Watch search query and reset page when it changes
watch(searchQuery, (newQuery, oldQuery) => {
  // Always reset local search pagination when the query changes
  searchCurrentPage.value = 1;
  
  // If the user clears the search (non-empty -> empty),
  // also reset the server-side pagination to page 1 to keep them in sync
  if (!newQuery && oldQuery) {
    loadPage(1);
  }
});

// Shared filtered results (before pagination)
const allFilteredUrls = computed(() => {
  if (!searchQuery.value) {
    return urlStore.urls;
  }
  
  const query = searchQuery.value.toLowerCase();
  return urlStore.urls.filter(url => 
    url.short_code.toLowerCase().includes(query) ||
    url.original_url.toLowerCase().includes(query) ||
    (url.title && url.title.toLowerCase().includes(query))
  );
});

// Paginated filtered results for display
const filteredUrls = computed(() => {
  const filtered = allFilteredUrls.value;
  
  // When not searching, return the server-side paginated results
  if (!searchQuery.value) {
    return filtered;
  }
  
  // Apply client-side pagination when searching
  const start = (searchCurrentPage.value - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return filtered.slice(start, end);
});

// Total filtered count (before pagination)
const totalFilteredCount = computed(() => {
  return allFilteredUrls.value.length;
});

// Compute total pages for search results
const searchTotalPages = computed(() => {
  if (!searchQuery.value) {
    return 0;
  }
  return Math.ceil(totalFilteredCount.value / PAGE_SIZE);
});

// Unified pagination info
const currentPage = computed(() => {
  return searchQuery.value ? searchCurrentPage.value : urlStore.pagination.page;
});

const totalPages = computed(() => {
  return searchQuery.value ? searchTotalPages.value : urlStore.pagination.total_pages;
});

const shouldShowPagination = computed(() => {
  return totalPages.value > 1;
});

// Compute visible page numbers for windowed pagination
const visiblePages = computed(() => {
  const pages: number[] = [];
  const total = totalPages.value;
  const current = currentPage.value;
  const maxVisible = 5; // Maximum number of page buttons to show
  
  if (total <= maxVisible) {
    // Show all pages if total is within the limit
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Calculate window around current page
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    
    // Adjust start if we're near the end
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
  }
  
  return pages;
});

// Copy to clipboard functionality
const copiedId = ref<string | null>(null);
const timeoutIds: number[] = [];

const copyToClipboard = async (text: string, id: string) => {
  // Check if clipboard API is available
  if (!navigator.clipboard) {
    errorMessage.value = 'Clipboard API not available. Please copy the URL manually.';
    showErrorToast.value = true;
    const timeoutId = window.setTimeout(() => {
      showErrorToast.value = false;
    }, TOAST_DISPLAY_DURATION);
    timeoutIds.push(timeoutId);
    return;
  }
  
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = id;
    
    // Reset after configured duration
    const timeoutId = window.setTimeout(() => {
      copiedId.value = null;
    }, COPY_FEEDBACK_DURATION);
    timeoutIds.push(timeoutId);
  } catch (error) {
    console.error('Failed to copy:', error);
    errorMessage.value = 'Failed to copy to clipboard. Please copy the URL manually.';
    showErrorToast.value = true;
    const timeoutId = window.setTimeout(() => {
      showErrorToast.value = false;
    }, TOAST_DISPLAY_DURATION);
    timeoutIds.push(timeoutId);
  }
};

const showCreateModal = ref(false);
const showEditModal = ref(false);
const deleteUrlId = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleteError = ref<string | null>(null);
const showSuccessToast = ref(false);
const successMessage = ref('');
const showErrorToast = ref(false);
const errorMessage = ref('');

// Cleanup timeouts on unmount to prevent memory leaks
onBeforeUnmount(() => {
  timeoutIds.forEach(id => window.clearTimeout(id));
});

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

const goToPage = (page: number) => {
  // Prevent navigating to invalid pages
  if (page < 1 || page > totalPages.value) {
    return;
  }
  
  if (searchQuery.value) {
    // Handle search pagination (client-side)
    searchCurrentPage.value = page;
  } else {
    // Handle regular pagination (server-side)
    loadPage(page);
  }
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
  
  // Auto-hide toast after configured duration
  const timeoutId = window.setTimeout(() => {
    showSuccessToast.value = false;
  }, TOAST_DISPLAY_DURATION);
  timeoutIds.push(timeoutId);
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

    const updateData: UpdateUrlRequest = {
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
    
    // Auto-hide toast after configured duration
    const timeoutId = window.setTimeout(() => {
      showSuccessToast.value = false;
    }, TOAST_DISPLAY_DURATION);
    timeoutIds.push(timeoutId);
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

  // Format as YYYY-MM-DDTHH:mm for datetime-local, using local time components
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};
</script>

<style scoped>
.card {
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.btn-sm i {
  font-size: 0.875rem;
}

/* Copy button animation */
.btn-outline-secondary i.bi-check2 {
  color: var(--bs-success);
  font-weight: bold;
}

/* Search box styling */
.input-group-text {
  background-color: #f8f9fa;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .btn-group {
    flex-direction: column;
    width: 100%;
  }
  
  .btn-group > * {
    width: 100%;
    margin-bottom: 0.25rem;
  }
}
</style>
