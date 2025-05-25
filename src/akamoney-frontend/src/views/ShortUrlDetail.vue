<template>
  <div class="detail-container">
    <div class="detail-header">
      <h1>
        <i class="fas fa-chart-bar"></i>
        Short URL Statistics
      </h1>
      <div>
        <button class="btn btn-outline-primary me-2" @click="editUrl">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button class="btn btn-outline-secondary" @click="goBack">
          <i class="fas fa-arrow-left"></i> Back
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center my-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      <i class="fas fa-exclamation-circle"></i> Error: {{ error }}
    </div>

    <div v-else class="detail-content">
      <div class="url-summary-card">
        <div class="url-title">
          <h2>{{ shortUrl.title || 'Untitled Link' }}</h2>
          <span v-if="shortUrl.isArchived" class="badge bg-danger">Archived</span>
        </div>

        <div class="url-links">
          <div class="short-url-display">
            <label>Short URL</label>
            <div class="url-copy-container">
              <span class="url-value">{{ fullShortUrl }}</span>
              <button class="btn btn-sm btn-outline-secondary" @click="copyToClipboard(fullShortUrl)">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <div class="target-url-display">
            <label>Target URL</label>
            <div class="url-copy-container">
              <span class="url-value">{{ shortUrl.targetUrl }}</span>
              <button class="btn btn-sm btn-outline-secondary" @click="copyToClipboard(shortUrl.targetUrl)">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="url-meta-grid">
          <div class="meta-item">
            <label><i class="fas fa-mouse-pointer"></i> Click Count</label>
            <span class="meta-value highlight">{{ clickCount }}</span>
          </div>
          <div v-if="shortUrl.expirationDate" class="meta-item">
            <label><i class="fas fa-clock"></i> Expiration Date</label>
            <span class="meta-value">{{ formatDate(shortUrl.expirationDate) }}</span>
          </div>
          <div class="meta-item">
            <label><i class="fas fa-calendar-plus"></i> Created On</label>
            <span class="meta-value">{{ formatDate(shortUrl.createdAt) }}</span>
          </div>
        </div>

        <div v-if="shortUrl.description || shortUrl.imageUrl" class="social-preview">
          <h3>Social Media Preview</h3>
          <div class="social-card">
            <div v-if="shortUrl.imageUrl" class="social-image">
              <img :src="shortUrl.imageUrl" alt="Social Preview">
            </div>
            <div class="social-content">
              <h4>{{ shortUrl.title || shortUrl.targetUrl }}</h4>
              <p v-if="shortUrl.description">{{ shortUrl.description }}</p>
              <small>{{ getDomain(shortUrl.targetUrl) }}</small>
            </div>
          </div>
        </div>
      </div>

      <div class="click-data">
        <h3><i class="fas fa-chart-line"></i> Click Data</h3>
        
        <div v-if="loadingClicks" class="text-center my-3">
          <div class="spinner-border spinner-border-sm text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
        
        <div v-else-if="clicks.length === 0" class="empty-clicks">
          <i class="fas fa-mouse-pointer fa-2x"></i>
          <p>No click data available</p>
        </div>
        
        <div v-else>
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User Agent</th>
                  <th>Referrer</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="click in clicks" :key="click.id">
                  <td>{{ formatDateTime(click.timestamp) }}</td>
                  <td class="user-agent">{{ click.userAgent }}</td>
                  <td>{{ click.referrer || '-' }}</td>
                  <td>{{ click.ipAddress }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { shortUrlService, clickTrackingService } from '../services/apiService';

export default {
  name: 'ShortUrlDetail',
  props: {
    code: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const router = useRouter();
    const shortUrl = ref({});
    const clicks = ref([]);
    const clickCount = ref(0);
    const loading = ref(true);
    const loadingClicks = ref(true);
    const error = ref(null);

    const fullShortUrl = computed(() => {
      return `${process.env.VUE_APP_REDIRECT_URL}/${props.code}`;
    });

    const loadShortUrl = async () => {
      try {
        loading.value = true;
        error.value = null;
        shortUrl.value = await shortUrlService.getShortUrl(props.code);
      } catch (err) {
        error.value = err.message || '載入短網址資料時發生錯誤';
        console.error('Error loading short URL:', err);
      } finally {
        loading.value = false;
      }
    };

    const loadClickData = async () => {
      try {
        loadingClicks.value = true;
        clickCount.value = await clickTrackingService.getClickCount(props.code);
        clicks.value = await clickTrackingService.getClicksForShortUrl(props.code);
      } catch (err) {
        console.error('Error loading click data:', err);
      } finally {
        loadingClicks.value = false;
      }
    };

    const formatDate = (dateString) => {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('zh-TW').format(date);
    };

    const formatDateTime = (dateString) => {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date);
    };

    const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    };

    const editUrl = () => {
      router.push(`/edit/${props.code}`);
    };

    const goBack = () => {
      router.push('/dashboard');
    };

    onMounted(() => {
      loadShortUrl();
      loadClickData();
    });

    return {
      shortUrl,
      clicks,
      clickCount,
      loading,
      loadingClicks,
      error,
      fullShortUrl,
      formatDate,
      formatDateTime,
      copyToClipboard,
      editUrl,
      goBack
    };
  }
}
</script>

<style scoped>
.detail-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem 1rem;
  color: var(--text-color);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.detail-header h1 {
  color: var(--text-color);
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.url-summary-card {
  background-color: var(--bg-color);
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px var(--header-shadow);
  border: 1px solid var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.url-title {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 0.75rem;
}

.url-title h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-color);
}

.url-links {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.short-url-display, .target-url-display {
  display: flex;
  flex-direction: column;
}

.url-copy-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--footer-bg);
  padding: 0.5rem;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.url-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  color: var(--text-color);
}

label {
  font-size: 0.8rem;
  color: var(--footer-text);
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.url-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.meta-item {
  display: flex;
  flex-direction: column;
}

.meta-value {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-color);
}

.meta-value.highlight {
  color: var(--primary-color);
  font-size: 1.5rem;
}

.social-preview {
  margin-top: 1rem;
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.social-preview h3 {
  font-size: 1rem;
  margin-bottom: 1rem;
  color: var(--text-color);
}

.social-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  max-width: 500px;
  background-color: var(--bg-color);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.social-image img {
  width: 100%;
  height: auto;
  max-height: 250px;
  object-fit: cover;
}

.social-content {
  padding: 1rem;
}

.social-content h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  color: var(--text-color);
}

.social-content p {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: var(--footer-text);
}

.social-content small {
  color: var(--footer-text);
  font-size: 0.8rem;
}

.click-data {
  background-color: var(--bg-color);
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px var(--header-shadow);
  border: 1px solid var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.click-data h3 {
  margin-bottom: 1rem;
  font-size: 1.2rem;
  color: var(--text-color);
}

.empty-clicks {
  text-align: center;
  padding: 2rem 0;
  color: var(--footer-text);
}

.user-agent {
  max-width: 250px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color);
}

/* Table styles for dark mode */
.table {
  color: var(--text-color);
}

.table th {
  color: var(--text-color);
  border-color: var(--border-color);
}

.table td {
  border-color: var(--border-color);
}

.table-hover tbody tr:hover {
  background-color: var(--footer-bg);
}
</style>
