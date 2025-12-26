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
                  :style="{ width: Math.min(stats.storage.usagePercent, 100) + '%' }"
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
                <i class="bi bi-speedometer2 me-2"></i>Operations ({{ formatDateRange }})
              </h5>
            </div>
            <div class="card-body">
              <!-- Reads -->
              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong>Read Operations</strong>
                    <p class="text-muted mb-0 small">
                      {{ stats.reads.total.toLocaleString() }} total reads
                    </p>
                    <p class="text-muted mb-0 small">
                      Limit: {{ stats.reads.limitPerDay.toLocaleString() }} reads per day
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
                    <strong>Write Operations</strong>
                    <p class="text-muted mb-0 small">
                      {{ stats.writes.total.toLocaleString() }} total writes
                    </p>
                    <p class="text-muted mb-0 small">
                      Limit: {{ stats.writes.limitPerDay.toLocaleString() }} writes per day
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
                <div class="col-md-4 mb-3">
                  <strong>Date Range:</strong>
                  <p class="mb-0">{{ formatDateRange }}</p>
                </div>
                <div class="col-md-4 mb-3">
                  <strong>Data Source:</strong>
                  <p class="mb-0">
                    <span v-if="stats.dataSource === 'cloudflare'" class="badge bg-success">
                      <i class="bi bi-cloud-check me-1"></i>Cloudflare GraphQL API (Real-time)
                    </span>
                    <span v-else class="badge bg-warning text-dark">
                      <i class="bi bi-calculator me-1"></i>Estimated from Local DB
                    </span>
                  </p>
                  <p v-if="stats.fallbackReason" class="text-muted mb-0 small mt-1">
                    <i class="bi bi-info-circle me-1"></i>{{ stats.fallbackReason }}
                  </p>
                </div>
                <div class="col-md-4 mb-3">
                  <strong>Last Updated:</strong>
                  <p class="mb-0">{{ formatDate(stats.timestamp) }}</p>
                </div>
              </div>
              <div class="alert alert-info mb-0">
                <i class="bi bi-info-circle-fill me-2"></i>
                <span v-if="stats.dataSource === 'cloudflare'">
                  Operations data is fetched from Cloudflare's D1 Analytics API for the selected date range. 
                  Storage estimates are calculated from local database records.
                </span>
                <span v-else>
                  These are estimated values based on current database usage. 
                  Configure Cloudflare API credentials to see real-time analytics.
                </span>
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
import apiService from '@/services/api';
import type { D1UsageStats } from '@/types';

const loading = ref(false);
const error = ref<string | null>(null);
const stats = ref<D1UsageStats | null>(null);

const fetchUsageStats = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    stats.value = await apiService.getD1Stats();
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

const formatDateRange = computed(() => {
  if (!stats.value?.dateRange) return '';
  return `${stats.value.dateRange.start} to ${stats.value.dateRange.end}`;
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
  background-color: var(--app-progress-bg);
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
