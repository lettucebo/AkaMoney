<template>
  <div class="container mt-4">
    <div class="row">
      <div class="col-12">
        <h2 class="mb-4">
          <i class="bi bi-bar-chart-line me-2"></i>
          Database Usage Statistics
        </h2>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="alert alert-danger" role="alert">
          <i class="bi bi-exclamation-triangle me-2"></i>
          {{ error }}
        </div>

        <!-- Statistics Content -->
        <div v-else-if="stats" class="row g-4">
          <!-- Summary Cards -->
          <div class="col-md-3 col-sm-6">
            <div class="card h-100">
              <div class="card-body text-center">
                <i class="bi bi-cursor-fill fs-1 text-primary mb-2"></i>
                <h3 class="mb-0">{{ stats.totalClicks.toLocaleString() }}</h3>
                <p class="text-muted mb-0">Total Clicks</p>
              </div>
            </div>
          </div>

          <div class="col-md-3 col-sm-6">
            <div class="card h-100">
              <div class="card-body text-center">
                <i class="bi bi-calendar-day fs-1 text-success mb-2"></i>
                <h3 class="mb-0">{{ stats.todayClicks.toLocaleString() }}</h3>
                <p class="text-muted mb-0">Today's Clicks</p>
              </div>
            </div>
          </div>

          <div class="col-md-3 col-sm-6">
            <div class="card h-100">
              <div class="card-body text-center">
                <i class="bi bi-calendar-month fs-1 text-info mb-2"></i>
                <h3 class="mb-0">{{ stats.monthClicks.toLocaleString() }}</h3>
                <p class="text-muted mb-0">This Month</p>
              </div>
            </div>
          </div>

          <div class="col-md-3 col-sm-6">
            <div class="card h-100">
              <div class="card-body text-center">
                <i class="bi bi-link-45deg fs-1 text-warning mb-2"></i>
                <h3 class="mb-0">{{ stats.totalUrls.toLocaleString() }}</h3>
                <p class="text-muted mb-0">Total URLs</p>
              </div>
            </div>
          </div>

          <!-- Storage Usage -->
          <div class="col-12">
            <div class="card">
              <div class="card-header">
                <h5 class="mb-0">
                  <i class="bi bi-hdd me-2"></i>
                  Storage Usage
                </h5>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span>
                    {{ stats.database.estimatedSizeMB }} MB / 
                    {{ stats.limits.storage.limit }} MB
                  </span>
                  <span class="badge" :class="getUsageBadgeClass(stats.limits.storage.usagePercent)">
                    {{ stats.limits.storage.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress" style="height: 25px;">
                  <div 
                    class="progress-bar" 
                    :class="getProgressBarClass(stats.limits.storage.usagePercent)"
                    role="progressbar" 
                    :style="{ width: Math.min(stats.limits.storage.usagePercent, 100) + '%' }"
                    :aria-valuenow="stats.limits.storage.usagePercent"
                    aria-valuemin="0" 
                    aria-valuemax="100"
                  >
                    {{ stats.limits.storage.usagePercent < 5 ? '' : stats.limits.storage.usagePercent.toFixed(2) + '%' }}
                  </div>
                </div>
                <small class="text-muted d-block mt-2">
                  Free tier limit: {{ stats.database.storageLimitGB }} GB
                </small>
              </div>
            </div>
          </div>

          <!-- Daily Operations -->
          <div class="col-md-6">
            <div class="card">
              <div class="card-header">
                <h5 class="mb-0">
                  <i class="bi bi-eye me-2"></i>
                  Daily Reads (Estimated)
                </h5>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span>
                    {{ stats.limits.reads.estimatedDaily.toLocaleString() }} / 
                    {{ stats.limits.reads.limit.toLocaleString() }}
                  </span>
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
                  ></div>
                </div>
                <small class="text-muted d-block mt-2">
                  Free tier: 5,000,000 reads per day
                </small>
              </div>
            </div>
          </div>

          <div class="col-md-6">
            <div class="card">
              <div class="card-header">
                <h5 class="mb-0">
                  <i class="bi bi-pencil me-2"></i>
                  Daily Writes (Estimated)
                </h5>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span>
                    {{ stats.limits.writes.estimatedDaily.toLocaleString() }} / 
                    {{ stats.limits.writes.limit.toLocaleString() }}
                  </span>
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
                  ></div>
                </div>
                <small class="text-muted d-block mt-2">
                  Free tier: 100,000 writes per day
                </small>
              </div>
            </div>
          </div>

          <!-- Additional Info -->
          <div class="col-12">
            <div class="card">
              <div class="card-header">
                <h5 class="mb-0">
                  <i class="bi bi-info-circle me-2"></i>
                  Additional Information
                </h5>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6">
                    <p class="mb-2">
                      <strong>Oldest Record:</strong> 
                      {{ stats.oldestRecordDate ? formatDate(stats.oldestRecordDate) : 'N/A' }}
                    </p>
                    <p class="mb-2">
                      <strong>Data Retention:</strong> 365 days (auto-cleanup enabled)
                    </p>
                  </div>
                  <div class="col-md-6">
                    <p class="mb-2">
                      <strong>Last Updated:</strong> 
                      {{ formatDate(stats.timestamp) }}
                    </p>
                    <button 
                      class="btn btn-sm btn-outline-primary" 
                      @click="refreshStats"
                      :disabled="loading"
                    >
                      <i class="bi bi-arrow-clockwise me-1"></i>
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Free Tier Info -->
          <div class="col-12">
            <div class="alert alert-info">
              <h6 class="alert-heading">
                <i class="bi bi-info-circle-fill me-2"></i>
                Cloudflare D1 Free Tier Limits
              </h6>
              <ul class="mb-0">
                <li>Storage: 5 GB</li>
                <li>Reads: 5,000,000 per day</li>
                <li>Writes: 100,000 per day</li>
                <li>Automatic cleanup: Records older than 365 days are deleted daily</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import type { UsageStats } from '@/types';

const stats = ref<UsageStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const fetchStats = async () => {
  try {
    loading.value = true;
    error.value = null;
    stats.value = await api.getUsageStats();
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to load usage statistics';
    console.error('Error fetching usage stats:', err);
  } finally {
    loading.value = false;
  }
};

const refreshStats = () => {
  fetchStats();
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

const getUsageBadgeClass = (percent: number): string => {
  if (percent >= 80) return 'bg-danger';
  if (percent >= 50) return 'bg-warning';
  return 'bg-success';
};

const getProgressBarClass = (percent: number): string => {
  if (percent >= 80) return 'bg-danger';
  if (percent >= 50) return 'bg-warning';
  return 'bg-success';
};

onMounted(() => {
  fetchStats();
});
</script>

<style scoped>
.card {
  box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
  transition: transform 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.progress {
  background-color: #e9ecef;
}

.progress-bar {
  transition: width 0.6s ease;
}
</style>
