<template>
  <div class="container">
    <div class="row">
      <div class="col-12">
        <h2 class="mb-4">
          <i class="bi bi-database me-2"></i>Database Usage Monitoring
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
          <!-- Summary Cards -->
          <div class="row mb-4">
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center">
                <div class="card-body">
                  <i class="bi bi-link-45deg fs-1 text-primary"></i>
                  <h3 class="mt-2 mb-0">{{ stats.totalUrls }}</h3>
                  <p class="text-muted mb-0">Total URLs</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center">
                <div class="card-body">
                  <i class="bi bi-bar-chart-fill fs-1 text-success"></i>
                  <h3 class="mt-2 mb-0">{{ stats.totalClicks.toLocaleString() }}</h3>
                  <p class="text-muted mb-0">Total Clicks</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center">
                <div class="card-body">
                  <i class="bi bi-calendar-day fs-1 text-info"></i>
                  <h3 class="mt-2 mb-0">{{ stats.todayClicks.toLocaleString() }}</h3>
                  <p class="text-muted mb-0">Today's Clicks</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center">
                <div class="card-body">
                  <i class="bi bi-calendar-month fs-1 text-warning"></i>
                  <h3 class="mt-2 mb-0">{{ stats.monthClicks.toLocaleString() }}</h3>
                  <p class="text-muted mb-0">This Month</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Database Size Info -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="bi bi-hdd me-2"></i>Database Storage
              </h5>
            </div>
            <div class="card-body">
              <div class="row align-items-center mb-3">
                <div class="col-md-6">
                  <h3 class="mb-0">{{ stats.database.estimatedSizeMB }} MB</h3>
                  <p class="text-muted mb-0">
                    ({{ stats.database.estimatedSizeGB }} GB of {{ stats.database.storageLimitGB }} GB limit)
                  </p>
                </div>
                <div class="col-md-6 text-end">
                  <span class="badge" :class="getUsageBadgeClass(stats.database.storageUsagePercent)">
                    {{ stats.database.storageUsagePercent.toFixed(2) }}% Used
                  </span>
                </div>
              </div>
              <div class="progress" style="height: 25px;">
                <div
                  class="progress-bar"
                  :class="getProgressBarClass(stats.database.storageUsagePercent)"
                  role="progressbar"
                  :style="{ width: stats.database.storageUsagePercent + '%' }"
                  :aria-valuenow="stats.database.storageUsagePercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  {{ stats.database.storageUsagePercent.toFixed(2) }}%
                </div>
              </div>
              <div v-if="stats.database.storageUsagePercent >= 80" class="alert alert-warning mt-3 mb-0">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                <strong>Warning:</strong> Storage usage is approaching the free tier limit!
              </div>
            </div>
          </div>

          <!-- D1 Free Tier Limits -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="bi bi-speedometer2 me-2"></i>D1 Free Tier Usage
              </h5>
            </div>
            <div class="card-body">
              <!-- Reads -->
              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong>Database Reads (Today)</strong>
                    <p class="text-muted mb-0 small">
                      {{ stats.limits.reads.estimatedDaily.toLocaleString() }} / {{ stats.limits.reads.limit.toLocaleString() }}
                    </p>
                  </div>
                  <span class="badge" :class="getUsageBadgeClass(stats.limits.reads.usagePercent)">
                    {{ stats.limits.reads.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress" style="height: 20px;">
                  <div
                    class="progress-bar"
                    :class="getProgressBarClass(stats.limits.reads.usagePercent)"
                    role="progressbar"
                    :style="{ width: Math.min(stats.limits.reads.usagePercent, 100) + '%' }"
                    :aria-valuenow="stats.limits.reads.usagePercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {{ stats.limits.reads.usagePercent.toFixed(2) }}%
                  </div>
                </div>
                <div v-if="stats.limits.reads.usagePercent >= 80" class="alert alert-warning mt-2 mb-0">
                  <i class="bi bi-exclamation-triangle-fill me-2"></i>
                  <strong>Warning:</strong> Daily read quota is nearing the limit!
                </div>
              </div>

              <!-- Writes -->
              <div class="mb-0">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong>Database Writes (Today)</strong>
                    <p class="text-muted mb-0 small">
                      {{ stats.limits.writes.estimatedDaily.toLocaleString() }} / {{ stats.limits.writes.limit.toLocaleString() }}
                    </p>
                  </div>
                  <span class="badge" :class="getUsageBadgeClass(stats.limits.writes.usagePercent)">
                    {{ stats.limits.writes.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress" style="height: 20px;">
                  <div
                    class="progress-bar"
                    :class="getProgressBarClass(stats.limits.writes.usagePercent)"
                    role="progressbar"
                    :style="{ width: Math.min(stats.limits.writes.usagePercent, 100) + '%' }"
                    :aria-valuenow="stats.limits.writes.usagePercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {{ stats.limits.writes.usagePercent.toFixed(2) }}%
                  </div>
                </div>
                <div v-if="stats.limits.writes.usagePercent >= 80" class="alert alert-warning mt-2 mb-0">
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
                <i class="bi bi-info-circle me-2"></i>Additional Information
              </h5>
            </div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <strong>Oldest Record:</strong>
                  <p class="mb-0">
                    {{ stats.oldestRecordDate ? formatDate(stats.oldestRecordDate) : 'N/A' }}
                  </p>
                </div>
                <div class="col-md-6 mb-3">
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
import { ref, onMounted } from 'vue';
import axios from 'axios';
import type { UsageStats } from '@/types';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8788';
const loading = ref(false);
const error = ref<string | null>(null);
const stats = ref<UsageStats | null>(null);

const fetchUsageStats = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      error.value = 'Authentication required';
      return;
    }

    const response = await axios.get(`${apiUrl}/api/stats/usage`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    stats.value = response.data;
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
