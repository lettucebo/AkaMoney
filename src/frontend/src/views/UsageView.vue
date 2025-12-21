<template>
  <div class="container mt-4">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2 class="mb-0">
            <i class="bi bi-bar-chart-line me-2"></i>
            Database Usage Statistics
          </h2>
          <button 
            class="btn btn-primary"
            @click="refreshStats"
            :disabled="loading"
          >
            <i class="bi bi-arrow-clockwise me-1"></i>
            Refresh
          </button>
        </div>

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
            <div class="stat-card stat-card-primary h-100">
              <div class="card-body text-center">
                <div class="icon-wrapper mb-3">
                  <i class="bi bi-cursor-fill"></i>
                </div>
                <h3 class="mb-1 fw-bold">{{ stats.totalClicks.toLocaleString() }}</h3>
                <p class="text-muted mb-0 small">Total Clicks</p>
              </div>
            </div>
          </div>

          <div class="col-md-3 col-sm-6">
            <div class="stat-card stat-card-success h-100">
              <div class="card-body text-center">
                <div class="icon-wrapper mb-3">
                  <i class="bi bi-calendar-day"></i>
                </div>
                <h3 class="mb-1 fw-bold">{{ stats.todayClicks.toLocaleString() }}</h3>
                <p class="text-muted mb-0 small">Today's Clicks</p>
              </div>
            </div>
          </div>

          <div class="col-md-3 col-sm-6">
            <div class="stat-card stat-card-info h-100">
              <div class="card-body text-center">
                <div class="icon-wrapper mb-3">
                  <i class="bi bi-calendar-month"></i>
                </div>
                <h3 class="mb-1 fw-bold">{{ stats.monthClicks.toLocaleString() }}</h3>
                <p class="text-muted mb-0 small">This Month</p>
              </div>
            </div>
          </div>

          <div class="col-md-3 col-sm-6">
            <div class="stat-card stat-card-warning h-100">
              <div class="card-body text-center">
                <div class="icon-wrapper mb-3">
                  <i class="bi bi-link-45deg"></i>
                </div>
                <h3 class="mb-1 fw-bold">{{ stats.totalUrls.toLocaleString() }}</h3>
                <p class="text-muted mb-0 small">Total URLs</p>
              </div>
            </div>
          </div>

          <!-- Storage Usage -->
          <div class="col-12">
            <div class="card usage-card">
              <div class="card-header bg-transparent border-0 pt-4">
                <h5 class="mb-0 d-flex align-items-center">
                  <i class="bi bi-hdd me-2 text-primary"></i>
                  Storage Usage
                </h5>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h4 class="mb-0">{{ stats.database.estimatedSizeMB }} MB</h4>
                    <small class="text-muted">of {{ stats.limits.storage.limit.toLocaleString() }} MB</small>
                  </div>
                  <span class="badge fs-6 px-3 py-2" :class="getUsageBadgeClass(stats.limits.storage.usagePercent)">
                    {{ stats.limits.storage.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress progress-modern" style="height: 30px;">
                  <div 
                    class="progress-bar" 
                    :class="getProgressBarClass(stats.limits.storage.usagePercent)"
                    role="progressbar" 
                    :style="{ width: Math.min(stats.limits.storage.usagePercent, 100) + '%' }"
                    :aria-valuenow="stats.limits.storage.usagePercent"
                    aria-valuemin="0" 
                    aria-valuemax="100"
                  >
                    <span v-if="stats.limits.storage.usagePercent >= 5" class="px-2">
                      {{ stats.limits.storage.usagePercent.toFixed(2) }}%
                    </span>
                  </div>
                </div>
                <small class="text-muted d-block mt-3">
                  <i class="bi bi-info-circle me-1"></i>
                  Free tier limit: {{ stats.database.storageLimitGB }} GB
                </small>
              </div>
            </div>
          </div>

          <!-- Daily Operations -->
          <div class="col-md-6">
            <div class="card usage-card h-100">
              <div class="card-header bg-transparent border-0 pt-4">
                <h5 class="mb-0 d-flex align-items-center">
                  <i class="bi bi-eye me-2 text-info"></i>
                  Daily Reads (Estimated)
                </h5>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h4 class="mb-0">{{ stats.limits.reads.estimatedDaily.toLocaleString() }}</h4>
                    <small class="text-muted">of {{ stats.limits.reads.limit.toLocaleString() }}</small>
                  </div>
                  <span class="badge fs-6 px-3 py-2" :class="getUsageBadgeClass(stats.limits.reads.usagePercent)">
                    {{ stats.limits.reads.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress progress-modern" style="height: 25px;">
                  <div 
                    class="progress-bar bg-info" 
                    :class="getProgressBarClass(stats.limits.reads.usagePercent)"
                    role="progressbar" 
                    :style="{ width: Math.min(stats.limits.reads.usagePercent, 100) + '%' }"
                  ></div>
                </div>
                <small class="text-muted d-block mt-3">
                  <i class="bi bi-info-circle me-1"></i>
                  Free tier: 5,000,000 reads per day
                </small>
              </div>
            </div>
          </div>

          <div class="col-md-6">
            <div class="card usage-card h-100">
              <div class="card-header bg-transparent border-0 pt-4">
                <h5 class="mb-0 d-flex align-items-center">
                  <i class="bi bi-pencil me-2 text-warning"></i>
                  Daily Writes (Estimated)
                </h5>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h4 class="mb-0">{{ stats.limits.writes.estimatedDaily.toLocaleString() }}</h4>
                    <small class="text-muted">of {{ stats.limits.writes.limit.toLocaleString() }}</small>
                  </div>
                  <span class="badge fs-6 px-3 py-2" :class="getUsageBadgeClass(stats.limits.writes.usagePercent)">
                    {{ stats.limits.writes.usagePercent.toFixed(2) }}%
                  </span>
                </div>
                <div class="progress progress-modern" style="height: 25px;">
                  <div 
                    class="progress-bar bg-warning" 
                    :class="getProgressBarClass(stats.limits.writes.usagePercent)"
                    role="progressbar" 
                    :style="{ width: Math.min(stats.limits.writes.usagePercent, 100) + '%' }"
                  ></div>
                </div>
                <small class="text-muted d-block mt-3">
                  <i class="bi bi-info-circle me-1"></i>
                  Free tier: 100,000 writes per day
                </small>
              </div>
            </div>
          </div>

          <!-- Additional Info -->
          <div class="col-12">
            <div class="card usage-card">
              <div class="card-header bg-transparent border-0 pt-4">
                <h5 class="mb-0 d-flex align-items-center">
                  <i class="bi bi-info-circle me-2 text-secondary"></i>
                  Additional Information
                </h5>
              </div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-4">
                    <div class="info-item">
                      <i class="bi bi-clock-history text-muted me-2"></i>
                      <div>
                        <small class="text-muted d-block">Oldest Record</small>
                        <strong>{{ stats.oldestRecordDate ? formatDate(stats.oldestRecordDate) : 'N/A' }}</strong>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="info-item">
                      <i class="bi bi-trash text-muted me-2"></i>
                      <div>
                        <small class="text-muted d-block">Data Retention</small>
                        <strong>365 days (auto-cleanup)</strong>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="info-item">
                      <i class="bi bi-arrow-clockwise text-muted me-2"></i>
                      <div>
                        <small class="text-muted d-block">Last Updated</small>
                        <strong>{{ formatDate(stats.timestamp) }}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Free Tier Info -->
          <div class="col-12">
            <div class="alert alert-info border-0 shadow-sm">
              <div class="d-flex">
                <div class="flex-shrink-0">
                  <i class="bi bi-info-circle-fill fs-4 me-3"></i>
                </div>
                <div class="flex-grow-1">
                  <h6 class="alert-heading mb-2">Cloudflare D1 Free Tier Limits</h6>
                  <div class="row">
                    <div class="col-md-4 mb-2">
                      <i class="bi bi-hdd me-1"></i>
                      <strong>Storage:</strong> 5 GB
                    </div>
                    <div class="col-md-4 mb-2">
                      <i class="bi bi-eye me-1"></i>
                      <strong>Reads:</strong> 5,000,000 per day
                    </div>
                    <div class="col-md-4 mb-2">
                      <i class="bi bi-pencil me-1"></i>
                      <strong>Writes:</strong> 100,000 per day
                    </div>
                  </div>
                  <p class="mb-0 mt-2 small">
                    <i class="bi bi-trash me-1"></i>
                    Records older than 365 days are automatically deleted daily
                  </p>
                </div>
              </div>
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
/* Stat Cards with gradient backgrounds */
.stat-card {
  border: none;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  overflow: hidden;
  position: relative;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--gradient-start), var(--gradient-end));
}

.stat-card-primary {
  --gradient-start: #0d6efd;
  --gradient-end: #0a58ca;
}

.stat-card-success {
  --gradient-start: #198754;
  --gradient-end: #146c43;
}

.stat-card-info {
  --gradient-start: #0dcaf0;
  --gradient-end: #0aa2c0;
}

.stat-card-warning {
  --gradient-start: #ffc107;
  --gradient-end: #cc9a06;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
}

.icon-wrapper {
  width: 60px;
  height: 60px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
}

.icon-wrapper i {
  font-size: 28px;
  color: white;
}

/* Usage Cards */
.usage-card {
  border: none;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.usage-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* Modern Progress Bars */
.progress-modern {
  background-color: #e9ecef;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.progress-modern .progress-bar {
  transition: width 0.6s ease;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}

.progress-modern .progress-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/* Info Items */
.info-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.02);
}

.info-item i {
  font-size: 24px;
}

/* Alert styling */
.alert-info {
  background: linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%);
}

/* Badge improvements */
.badge {
  font-weight: 600;
  border-radius: 8px;
}

/* Card header improvements */
.card-header h5 {
  font-weight: 600;
  color: #212529;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .stat-card {
    margin-bottom: 1rem;
  }
  
  .icon-wrapper {
    width: 50px;
    height: 50px;
  }
  
  .icon-wrapper i {
    font-size: 24px;
  }
  
  .info-item {
    margin-bottom: 0.5rem;
  }
}
</style>
