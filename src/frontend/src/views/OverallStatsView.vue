<template>
  <div class="container">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="stats">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Overall Statistics</h2>
        <router-link to="/dashboard" class="btn btn-outline-secondary">
          <i class="bi bi-arrow-left"></i> Back
        </router-link>
      </div>

      <!-- Date Range Selector -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-3 align-items-end">
            <div class="col-md-4">
              <label for="startDate" class="form-label">Start Date</label>
              <input
                type="date"
                id="startDate"
                class="form-control"
                v-model="startDate"
                :max="endDate"
              />
            </div>
            <div class="col-md-4">
              <label for="endDate" class="form-label">End Date</label>
              <input
                type="date"
                id="endDate"
                class="form-control"
                v-model="endDate"
                :min="startDate"
              />
            </div>
            <div class="col-md-4">
              <button
                class="btn btn-primary me-2"
                @click="fetchStats"
                :disabled="loading"
              >
                <i class="bi bi-search"></i> Apply
              </button>
              <button
                class="btn btn-outline-secondary"
                @click="resetToCurrentMonth"
                :disabled="loading"
              >
                <i class="bi bi-arrow-clockwise"></i> Current Month
              </button>
            </div>
          </div>
          <div class="mt-2 text-muted small">
            Showing data from {{ formatDate(stats.date_range.start) }} to {{ formatDate(stats.date_range.end) }}
          </div>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="row mb-4">
        <div class="col-md-4 mb-3">
          <div class="card h-100">
            <div class="card-body text-center">
              <h3 class="text-primary display-4">{{ stats.total_clicks }}</h3>
              <p class="text-muted mb-0">Total Clicks</p>
            </div>
          </div>
        </div>
        <div class="col-md-4 mb-3">
          <div class="card h-100">
            <div class="card-body text-center">
              <h3 class="text-success display-4">{{ stats.active_links }}</h3>
              <p class="text-muted mb-0">Active Links</p>
            </div>
          </div>
        </div>
        <div class="col-md-4 mb-3">
          <div class="card h-100">
            <div class="card-body text-center">
              <h3 class="text-info display-4">{{ stats.total_links }}</h3>
              <p class="text-muted mb-0">Total Links</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Click Trend -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Click Trend</h5>
        </div>
        <div class="card-body">
          <div v-if="Object.keys(stats.click_trend).length === 0" class="text-center text-muted">
            No data available
          </div>
          <div v-else class="chart-container">
            <div v-for="(count, date) in stats.click_trend" :key="date" class="mb-2">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-muted small">{{ formatDate(date) }}</span>
                <span class="badge bg-primary">{{ count }}</span>
              </div>
              <div
                class="progress"
                style="height: 10px;"
                role="progressbar"
                :aria-label="`${count} clicks on ${formatDate(date)}`"
                :aria-valuenow="count"
                :aria-valuemin="0"
                :aria-valuemax="maxClickCount"
              >
                <div
                  class="progress-bar"
                  :style="{ width: `${(count / maxClickCount) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Links -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Top Links</h5>
        </div>
        <div class="card-body">
          <div v-if="stats.top_links.length === 0" class="text-center text-muted">
            No links available
          </div>
          <div v-else class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Short Code</th>
                  <th>Title / URL</th>
                  <th class="text-end">Clicks</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(link, index) in stats.top_links" :key="link.short_code">
                  <td>
                    <span class="badge" :class="getRankBadgeClass(index)">{{ index + 1 }}</span>
                  </td>
                  <td>
                    <router-link :to="`/analytics/${link.short_code}`" class="text-decoration-none">
                      {{ link.short_code }}
                    </router-link>
                  </td>
                  <td>
                    <div v-if="link.title" class="fw-bold">{{ link.title }}</div>
                    <small class="text-muted text-break">{{ link.original_url }}</small>
                  </td>
                  <td class="text-end">
                    <span class="badge bg-primary rounded-pill">{{ link.click_count }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="row">
        <!-- Country Distribution -->
        <div class="col-md-6 mb-4">
          <div class="card h-100">
            <div class="card-header">
              <h5 class="mb-0">Top Countries</h5>
            </div>
            <div class="card-body">
              <div v-if="Object.keys(stats.country_distribution).length === 0" class="text-center text-muted">
                No data available
              </div>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="(count, country) in stats.country_distribution"
                  :key="country"
                  class="list-group-item d-flex justify-content-between align-items-center"
                >
                  {{ country }}
                  <span class="badge bg-primary rounded-pill">{{ count }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Device Distribution -->
        <div class="col-md-6 mb-4">
          <div class="card h-100">
            <div class="card-header">
              <h5 class="mb-0">Device Types</h5>
            </div>
            <div class="card-body">
              <div v-if="Object.keys(stats.device_distribution).length === 0" class="text-center text-muted">
                No data available
              </div>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="(count, device) in stats.device_distribution"
                  :key="device"
                  class="list-group-item d-flex justify-content-between align-items-center"
                >
                  <span class="text-capitalize">{{ device }}</span>
                  <span class="badge bg-primary rounded-pill">{{ count }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import apiService from '@/services/api';
import type { OverallStatsResponse } from '@/types';

const stats = ref<OverallStatsResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// Initialize with current month
const now = new Date();
const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

const startDate = ref<string>(currentMonthStart.toISOString().split('T')[0]);
const endDate = ref<string>(currentMonthEnd.toISOString().split('T')[0]);

const maxClickCount = computed(() => {
  if (!stats.value || Object.keys(stats.value.click_trend).length === 0) return 1;
  const values = Object.values(stats.value.click_trend);
  // Use reduce to avoid potential stack overflow with large arrays
  return values.reduce((max, val) => Math.max(max, val), 0) || 1;
});

const fetchStats = async () => {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await apiService.getOverallStats(startDate.value, endDate.value);
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to load overall statistics';
  } finally {
    loading.value = false;
  }
};

const resetToCurrentMonth = () => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  
  startDate.value = monthStart.toISOString().split('T')[0];
  endDate.value = monthEnd.toISOString().split('T')[0];
  
  fetchStats();
};

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return original string if invalid
    }
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
};

const getRankBadgeClass = (index: number) => {
  if (index === 0) return 'bg-warning text-dark';
  if (index === 1) return 'bg-secondary';
  if (index === 2) return 'bg-info';
  return 'bg-light text-dark';
};

onMounted(() => {
  fetchStats();
});
</script>

<style scoped>
.chart-container {
  max-height: 400px;
  overflow-y: auto;
}

.display-4 {
  font-weight: 600;
}

.text-break {
  word-break: break-word;
}
</style>
