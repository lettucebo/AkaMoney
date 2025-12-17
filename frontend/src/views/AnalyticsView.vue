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

    <div v-else-if="analytics">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Analytics</h2>
        <router-link to="/dashboard" class="btn btn-outline-secondary">
          <i class="bi bi-arrow-left"></i> Back
        </router-link>
      </div>

      <!-- URL Info Card -->
      <div class="card mb-4">
        <div class="card-body">
          <h5 class="card-title">{{ shortDomain }}/{{ analytics.url.short_code }}</h5>
          <p class="card-text text-muted">{{ analytics.url.original_url }}</p>
          <div class="row text-center mt-3">
            <div class="col-md-4">
              <h3 class="text-primary">{{ analytics.total_clicks }}</h3>
              <p class="text-muted mb-0">Total Clicks</p>
            </div>
            <div class="col-md-4">
              <h3 class="text-success">{{ Object.keys(analytics.clicks_by_date).length }}</h3>
              <p class="text-muted mb-0">Active Days</p>
            </div>
            <div class="col-md-4">
              <h3 class="text-info">{{ Object.keys(analytics.clicks_by_country).length }}</h3>
              <p class="text-muted mb-0">Countries</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Clicks by Date -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Clicks Over Time (Last 30 Days)</h5>
        </div>
        <div class="card-body">
          <div v-if="Object.keys(analytics.clicks_by_date).length === 0" class="text-center text-muted">
            No data available
          </div>
          <div v-else class="chart-container">
            <div v-for="(count, date) in analytics.clicks_by_date" :key="date" class="mb-2">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-muted small">{{ formatDate(date) }}</span>
                <span class="badge bg-primary">{{ count }}</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div
                  class="progress-bar"
                  :style="{ width: `${(count / analytics.total_clicks) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row">
        <!-- Clicks by Country -->
        <div class="col-md-6 mb-4">
          <div class="card h-100">
            <div class="card-header">
              <h5 class="mb-0">Top Countries</h5>
            </div>
            <div class="card-body">
              <div v-if="Object.keys(analytics.clicks_by_country).length === 0" class="text-center text-muted">
                No data available
              </div>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="(count, country) in analytics.clicks_by_country"
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

        <!-- Clicks by Device -->
        <div class="col-md-6 mb-4">
          <div class="card h-100">
            <div class="card-header">
              <h5 class="mb-0">Device Types</h5>
            </div>
            <div class="card-body">
              <div v-if="Object.keys(analytics.clicks_by_device).length === 0" class="text-center text-muted">
                No data available
              </div>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="(count, device) in analytics.clicks_by_device"
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

        <!-- Clicks by Browser -->
        <div class="col-md-6 mb-4">
          <div class="card h-100">
            <div class="card-header">
              <h5 class="mb-0">Top Browsers</h5>
            </div>
            <div class="card-body">
              <div v-if="Object.keys(analytics.clicks_by_browser).length === 0" class="text-center text-muted">
                No data available
              </div>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="(count, browser) in analytics.clicks_by_browser"
                  :key="browser"
                  class="list-group-item d-flex justify-content-between align-items-center"
                >
                  <span class="text-capitalize">{{ browser }}</span>
                  <span class="badge bg-primary rounded-pill">{{ count }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Recent Clicks -->
        <div class="col-md-6 mb-4">
          <div class="card h-100">
            <div class="card-header">
              <h5 class="mb-0">Recent Clicks</h5>
            </div>
            <div class="card-body">
              <div v-if="analytics.recent_clicks.length === 0" class="text-center text-muted">
                No clicks yet
              </div>
              <div v-else class="table-responsive">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Country</th>
                      <th>Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="click in analytics.recent_clicks.slice(0, 10)" :key="click.id">
                      <td>
                        <small>{{ formatDateTime(click.clicked_at) }}</small>
                      </td>
                      <td>{{ click.country || 'Unknown' }}</td>
                      <td class="text-capitalize">{{ click.device_type || 'Unknown' }}</td>
                    </tr>
                  </tbody>
                </table>
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
import { useRoute } from 'vue-router';
import apiService from '@/services/api';
import type { AnalyticsResponse } from '@/types';

const route = useRoute();
const shortCode = route.params.shortCode as string;
const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 'http://localhost:8787';

const analytics = ref<AnalyticsResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  loading.value = true;
  try {
    analytics.value = await apiService.getAnalytics(shortCode);
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to load analytics';
  } finally {
    loading.value = false;
  }
});

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

const formatDateTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};
</script>

<style scoped>
.chart-container {
  max-height: 400px;
  overflow-y: auto;
}
</style>
