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
            <form @submit.prevent="handleCreate">
              <div class="mb-3">
                <label for="originalUrl" class="form-label">Original URL *</label>
                <input
                  type="url"
                  class="form-control"
                  id="originalUrl"
                  v-model="formData.original_url"
                  required
                />
              </div>
              <div class="mb-3">
                <label for="shortCode" class="form-label">Custom Short Code</label>
                <input
                  type="text"
                  class="form-control"
                  id="shortCode"
                  v-model="formData.short_code"
                  pattern="[a-zA-Z0-9-_]{3,20}"
                />
              </div>
              <div class="mb-3">
                <label for="title" class="form-label">Title</label>
                <input
                  type="text"
                  class="form-control"
                  id="title"
                  v-model="formData.title"
                />
              </div>
              <div v-if="createError" class="alert alert-danger">{{ createError }}</div>
              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" @click="closeCreateModal">
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary" :disabled="creating">
                  <span v-if="creating" class="spinner-border spinner-border-sm me-2"></span>
                  Create
                </button>
              </div>
            </form>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUrlStore } from '@/stores/url';

const urlStore = useUrlStore();
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';

const formData = ref({
  original_url: '',
  short_code: '',
  title: ''
});

const creating = ref(false);
const createError = ref<string | null>(null);
const showCreateModal = ref(false);
const deleteUrlId = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleteError = ref<string | null>(null);

onMounted(() => {
  urlStore.fetchUrls();
});

const loadPage = (page: number) => {
  urlStore.fetchUrls(page);
};

const openCreateModal = () => {
  showCreateModal.value = true;
  createError.value = null;
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  formData.value = { original_url: '', short_code: '', title: '' };
};

const handleCreate = async () => {
  creating.value = true;
  createError.value = null;

  try {
    await urlStore.createUrl(formData.value);
    closeCreateModal();
  } catch (err: any) {
    createError.value = err.response?.data?.message || 'Failed to create URL';
  } finally {
    creating.value = false;
  }
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

const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};
</script>
