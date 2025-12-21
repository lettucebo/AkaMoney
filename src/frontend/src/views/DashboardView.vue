<template>
  <div class="container">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2>My URLs</h2>
          <div>
            <button 
              class="btn btn-sm me-2"
              :class="showArchived ? 'btn-secondary' : 'btn-outline-secondary'"
              @click="toggleArchived"
            >
              <i class="bi bi-archive"></i>
              {{ showArchived ? 'Hide Archived' : 'Show All' }}
              <span v-if="archivedCount > 0" class="badge bg-secondary ms-1">
                {{ archivedCount }}
              </span>
            </button>
            <button class="btn btn-primary" @click="openCreateModal">
              <i class="bi bi-plus-lg"></i> Create New
            </button>
          </div>
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
        <div v-else-if="filteredUrls.length === 0" class="text-center py-5">
          <i class="bi bi-link-45deg fs-1 text-muted"></i>
          <h4 class="mt-3">{{ showArchived ? 'No URLs yet' : 'No active URLs' }}</h4>
          <p class="text-muted">{{ showArchived ? 'Create your first shortened URL to get started' : 'All URLs are archived. Click "Show All" to view them.' }}</p>
        </div>

        <!-- URLs List -->
        <div v-else class="row">
          <div v-for="url in filteredUrls" :key="url.id" class="col-12 mb-3">
            <div class="card" :class="{ 'archived-url-card': !url.is_active }">
              <div class="card-body">
                <div class="row align-items-center">
                  <div class="col-md-6">
                    <h5 class="card-title mb-1">
                      <a :href="`${shortDomain}/${url.short_code}`" target="_blank" class="text-decoration-none">
                        {{ shortDomain }}/{{ url.short_code }}
                      </a>
                      <span v-if="!url.is_active" class="archived-badge">
                        <i class="bi bi-archive"></i> Archived
                      </span>
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
                    <div class="btn-group" v-if="url.is_active">
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
                        class="btn btn-sm btn-outline-warning"
                        @click="confirmArchive(url.id)"
                      >
                        <i class="bi bi-archive"></i> Archive
                      </button>
                    </div>
                    <div class="btn-group" v-else>
                      <router-link
                        :to="`/analytics/${url.short_code}`"
                        class="btn btn-sm btn-outline-primary"
                      >
                        <i class="bi bi-graph-up"></i> Analytics
                      </router-link>
                      <button
                        class="btn btn-sm btn-outline-success"
                        @click="confirmRestore(url.id)"
                      >
                        <i class="bi bi-arrow-counterclockwise"></i> Restore
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

    <!-- Edit URL Modal -->
    <div v-if="showEditModal" class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Edit URL</h5>
            <button type="button" class="btn-close" @click="closeEditModal"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="handleEditSubmit">
              <div class="mb-3">
                <label for="edit-original-url" class="form-label">Original URL</label>
                <input 
                  type="url" 
                  class="form-control" 
                  id="edit-original-url" 
                  v-model="editForm.original_url"
                  required
                />
              </div>
              <div class="mb-3">
                <label for="edit-title" class="form-label">Title (Optional)</label>
                <input 
                  type="text" 
                  class="form-control" 
                  id="edit-title" 
                  v-model="editForm.title"
                />
              </div>
              <div class="mb-3">
                <label for="edit-description" class="form-label">Description (Optional)</label>
                <textarea 
                  class="form-control" 
                  id="edit-description" 
                  v-model="editForm.description"
                  rows="3"
                ></textarea>
              </div>
              <div v-if="editError" class="alert alert-danger">{{ editError }}</div>
              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" @click="closeEditModal">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Changes</button>
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
import { ref, onMounted, computed } from 'vue';
import { useUrlStore } from '@/stores/url';
import UrlCreateForm from '@/components/UrlCreateForm.vue';
import type { UrlResponse } from '@/types';
import api from '@/services/api';

const urlStore = useUrlStore();
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';
const archivedRedirectUrl = import.meta.env.VITE_ARCHIVED_REDIRECT_URL || 'https://aka.money/archived';

const showCreateModal = ref(false);
const showEditModal = ref(false);
const showSuccessToast = ref(false);
const successMessage = ref('');
const editError = ref<string | null>(null);
const editForm = ref({
  id: '',
  original_url: '',
  title: '',
  description: ''
});

// Filter state
const showArchived = ref(false);

// Computed filtered URLs
const filteredUrls = computed(() => {
  if (showArchived.value) {
    return urlStore.urls; // Show all
  }
  return urlStore.urls.filter(url => url.is_active); // Show only active
});

// Computed archived count
const archivedCount = computed(() => {
  return urlStore.urls.filter(url => !url.is_active).length;
});

// Toggle archived visibility
const toggleArchived = () => {
  showArchived.value = !showArchived.value;
};

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

const openEditModal = (url: UrlResponse) => {
  if (!url.is_active) {
    alert('Cannot edit archived URLs. Please restore it first.');
    return;
  }
  
  editForm.value = {
    id: url.id,
    original_url: url.original_url,
    title: url.title || '',
    description: url.description || ''
  };
  editError.value = null;
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editError.value = null;
};

const handleEditSubmit = async () => {
  try {
    await api.updateUrl(editForm.value.id, {
      original_url: editForm.value.original_url,
      title: editForm.value.title,
      description: editForm.value.description
    });
    await urlStore.fetchUrls();
    closeEditModal();
    
    // Show success toast
    successMessage.value = 'URL updated successfully';
    showSuccessToast.value = true;
    setTimeout(() => {
      showSuccessToast.value = false;
    }, 3000);
  } catch (error: any) {
    editError.value = error.response?.data?.message || 'Failed to update URL';
  }
};

// Archive URL (soft delete)
const confirmArchive = async (urlId: string) => {
  const confirmed = confirm(
    `⚠️ Archive this shortened URL?\n\n` +
    `After archiving:\n` +
    `• Visitors will be redirected to: ${archivedRedirectUrl}\n` +
    `• Clicks will NOT be counted\n` +
    `• You can restore it anytime\n\n` +
    `Continue?`
  );
  
  if (!confirmed) return;

  try {
    await api.updateUrl(urlId, { is_active: false });
    await urlStore.fetchUrls();
    
    // Show success toast
    successMessage.value = 'URL archived successfully';
    showSuccessToast.value = true;
    setTimeout(() => {
      showSuccessToast.value = false;
    }, 3000);
  } catch (error) {
    console.error('Failed to archive URL:', error);
    alert('Failed to archive URL. Please try again.');
  }
};

// Restore URL
const confirmRestore = async (urlId: string) => {
  const confirmed = confirm('Restore this URL? It will become active again.');
  
  if (!confirmed) return;

  try {
    await api.updateUrl(urlId, { is_active: true });
    await urlStore.fetchUrls();
    
    // Show success toast
    successMessage.value = 'URL restored successfully';
    showSuccessToast.value = true;
    setTimeout(() => {
      showSuccessToast.value = false;
    }, 3000);
  } catch (error) {
    console.error('Failed to restore URL:', error);
    alert('Failed to restore URL. Please try again.');
  }
};

const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};
</script>

<style scoped>
.archived-url-card {
  opacity: 0.7;
  background-color: #f8f9fa;
  border-left: 4px solid #ffc107;
}

.archived-badge {
  display: inline-block;
  background-color: #ffc107;
  color: #000;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
}

.card {
  transition: opacity 0.2s;
}
</style>
