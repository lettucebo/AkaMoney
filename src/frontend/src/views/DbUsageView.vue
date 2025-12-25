<template>
  <div class="container">
    <div class="row">
      <div class="col-12">
        <h2 class="mb-4">
          <i class="bi bi-database me-2"></i>D1 Database Usage Monitoring
        </h2>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="alert alert-danger" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          {{ error }}
        </div>

        <!-- Content -->
        <div v-else-if="stats">
          <!-- Database Storage -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="bi bi-hdd me-2"></i>Storage Usage
              </h5>
            </div>
            <div class="card-body">
              <div class="row align-items-center mb-3">
                <div class="col-md-6">
                  <h3 class="mb-0">{{ stats.storage.estimatedSizeMB }} MB</h3>
                  <p class="text-muted mb-0">
                    ({{ stats.storage.estimatedSizeGB }} GB of {{ stats.storage.limitGB }} GB limit)
                  </p>
                  <p class="text-success mb-0 small">
                    <i class="bi bi-check-circle me-1"></i>{{ getRemainingStorage }} GB remaining
                  </p>
                </div>
                <div class="col-md-6 text-end">
                  <span class="badge" :class="getUsageBadgeClass(stats.storage.usagePercent)">
                    {{ stats.storage.usagePercent.toFixed(2) }}% Used
                  </span>
                </div>
              </div>
              <div class="progress" style="height: 25px;">
                <div
                  class="progress-bar"
                  :class="getProgressBarClass(stats.storage.usagePercent)"
                  role="progressbar"
                  :style="{ width: stats.storage.usagePercent + '%' }"
                  :aria-valuenow="stats.storage.usagePercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  {{ stats.storage.usagePercent.toFixed(2) }}%
                </div>
              </div>
              <div v-if="stats.storage.usagePercent >= 80" class="alert alert-warning mt-3 mb-0">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                <strong>Warning:</strong> Storage usage is approaching the free tier limit!
              </div>
            </div>
          </div>

          <!-- D1 Operations -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="bi bi-speedometer2 me-2"></i>Daily Operations
              </h5>
            </div>
            <div class="card-body">
              <!-- Reads -->
              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong>Read Operations (Today)</strong>
                    <p class="text-muted mb-0 small">
                      {{ stats.reads.estimatedDaily.toLocaleString() }} / {{ stats.reads.limitPerDay.toLocaleString() }}
                    </p>
                    <p class="text-success mb-0 small">
                      <i class="bi bi-check-circle me-1"></i>{{ getRemainingReads }} reads remaining today
                    </p>
                  </div>
                  <span class="badge" :class="getUsageBadgeClass(stats.reads.usagePercent)">
                    {{ stats.reads.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress" style="height: 20px;">
                  <div
                    class="progress-bar"
                    :class="getProgressBarClass(stats.reads.usagePercent)"
                    role="progressbar"
                    :style="{ width: Math.min(stats.reads.usagePercent, 100) + '%' }"
                    :aria-valuenow="stats.reads.usagePercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {{ stats.reads.usagePercent.toFixed(2) }}%
                  </div>
                </div>
                <div v-if="stats.reads.usagePercent >= 80" class="alert alert-warning mt-2 mb-0">
                  <i class="bi bi-exclamation-triangle-fill me-2"></i>
                  <strong>Warning:</strong> Daily read quota is nearing the limit!
                </div>
              </div>

              <!-- Writes -->
              <div class="mb-0">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong>Write Operations (Today)</strong>
                    <p class="text-muted mb-0 small">
                      {{ stats.writes.estimatedDaily.toLocaleString() }} / {{ stats.writes.limitPerDay.toLocaleString() }}
                    </p>
                    <p class="text-success mb-0 small">
                      <i class="bi bi-check-circle me-1"></i>{{ getRemainingWrites }} writes remaining today
                    </p>
                  </div>
                  <span class="badge" :class="getUsageBadgeClass(stats.writes.usagePercent)">
                    {{ stats.writes.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress" style="height: 20px;">
                  <div
                    class="progress-bar"
                    :class="getProgressBarClass(stats.writes.usagePercent)"
                    role="progressbar"
                    :style="{ width: Math.min(stats.writes.usagePercent, 100) + '%' }"
                    :aria-valuenow="stats.writes.usagePercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {{ stats.writes.usagePercent.toFixed(2) }}%
                  </div>
                </div>
                <div v-if="stats.writes.usagePercent >= 80" class="alert alert-warning mt-2 mb-0">
                  <i class="bi bi-exclamation-triangle-fill me-2"></i>
                  <strong>Warning:</strong> Daily write quota is nearing the limit!
                </div>
              </div>
            </div>
          </div>

          <!-- Additional Information -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="bi bi-info-circle me-2"></i>Information
              </h5>
            </div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-12 mb-3">
                  <strong>Last Updated:</strong>
                  <p class="mb-0">{{ formatDate(stats.timestamp) }}</p>
                </div>
              </div>
              <div class="alert alert-info mb-0">
                <i class="bi bi-info-circle-fill me-2"></i>
                These are estimated values based on current database usage. 
                For detailed information about Cloudflare D1 free tier limits, visit the 
                <a href="https://developers.cloudflare.com/d1/platform/limits/" target="_blank" rel="noopener noreferrer">
                  official documentation
                  <i class="bi bi-box-arrow-up-right ms-1"></i>
                </a>.
              </div>
            </div>
          </div>

          <!-- Refresh Button -->
          <div class="text-center">
            <button class="btn btn-primary" @click="fetchUsageStats" :disabled="loading">
              <i class="bi bi-arrow-clockwise me-2"></i>Refresh Data
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import type { D1UsageStats } from '@/types';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8788';
const loading = ref(false);
const error = ref<string | null>(null);
const stats = ref<D1UsageStats | null>(null);

const fetchUsageStats = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      error.value = 'Authentication required';
      return;
    }

    const response = await axios.get(`${apiUrl}/api/stats/d1`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    stats.value = response.data;
  } catch (err: any) {
    console.error('Error fetching D1 stats:', err);
    error.value = err.response?.data?.message || 'Failed to fetch D1 statistics';
  } finally {
    loading.value = false;
  }
};

// Computed properties for remaining capacity
const getRemainingStorage = computed(() => {
  if (!stats.value) return '0';
  const remaining = stats.value.storage.limitGB - stats.value.storage.estimatedSizeGB;
  return remaining.toFixed(4);
});

const getRemainingReads = computed(() => {
  if (!stats.value) return '0';
  const remaining = stats.value.reads.limitPerDay - stats.value.reads.estimatedDaily;
  return remaining.toLocaleString();
});

const getRemainingWrites = computed(() => {
  if (!stats.value) return '0';
  const remaining = stats.value.writes.limitPerDay - stats.value.writes.estimatedDaily;
  return remaining.toLocaleString();
});

const getProgressBarClass = (percent: number): string => {
  if (percent >= 90) return 'bg-danger';
  if (percent >= 80) return 'bg-warning';
  if (percent >= 50) return 'bg-info';
  return 'bg-success';
};

const getUsageBadgeClass = (percent: number): string => {
  if (percent >= 90) return 'bg-danger';
  if (percent >= 80) return 'bg-warning text-dark';
  if (percent >= 50) return 'bg-info';
  return 'bg-success';
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

onMounted(() => {
  fetchUsageStats();
});
</script>

<style scoped>
.card {
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.progress {
  background-color: #e9ecef;
}

.progress-bar {
  transition: width 0.6s ease;
}

.alert a {
  color: inherit;
  text-decoration: underline;
}

.alert a:hover {
  opacity: 0.8;
}
</style>
  } catch (err: any) {
    console.error('Error fetching usage stats:', err);
    error.value = err.response?.data?.message || 'Failed to fetch usage statistics';
  } finally {
    loading.value = false;
  }
};

const getProgressBarClass = (percent: number): string => {
  if (percent >= 90) return 'bg-danger';
  if (percent >= 80) return 'bg-warning';
  if (percent >= 50) return 'bg-info';
  return 'bg-success';
};

const getUsageBadgeClass = (percent: number): string => {
  if (percent >= 90) return 'bg-danger';
  if (percent >= 80) return 'bg-warning text-dark';
  if (percent >= 50) return 'bg-info';
  return 'bg-success';
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

onMounted(() => {
  fetchUsageStats();
});
</script>

<style scoped>
.card {
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.progress {
  background-color: #e9ecef;
}

.progress-bar {
  transition: width 0.6s ease;
}

.alert a {
  color: inherit;
  text-decoration: underline;
}

.alert a:hover {
  opacity: 0.8;
}
</style>
