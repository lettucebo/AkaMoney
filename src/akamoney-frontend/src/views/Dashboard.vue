<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h1><i class="fas fa-link"></i> 短網址管理</h1>
      <button class="btn btn-primary" @click="navigateToCreate">
        <i class="fas fa-plus"></i> 建立新短網址
      </button>
    </div>

    <div v-if="loading" class="text-center my-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">讀取中...</span>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      <i class="fas fa-exclamation-circle"></i> 發生錯誤: {{ error }}
    </div>

    <div v-else-if="shortUrls.length === 0" class="empty-state">
      <i class="fas fa-link fa-4x"></i>
      <p>您還沒有建立任何短網址</p>
      <button class="btn btn-primary" @click="navigateToCreate">建立第一個短網址</button>
    </div>

    <div v-else class="url-cards">
      <div v-for="url in shortUrls" :key="url.code" class="url-card">
        <div class="url-info">
          <h3>{{ url.title || '未命名連結' }}</h3>
          <div class="url-meta">
            <div class="short-url">
              <span class="code">{{ getFullShortUrl(url.code) }}</span>
              <button class="btn btn-sm btn-outline-secondary" @click="copyToClipboard(url.code)">
                <i class="fas fa-copy"></i>
              </button>
            </div>
            <div class="target-url">{{ truncateUrl(url.targetUrl) }}</div>
          </div>
          <div class="url-stats">
            <span class="clicks"><i class="fas fa-mouse-pointer"></i> {{ url.clickCount }} 次點擊</span>
            <span v-if="url.expirationDate" class="expiry">
              <i class="fas fa-clock"></i> 到期日: {{ formatDate(url.expirationDate) }}
            </span>
            <span v-if="url.isArchived" class="archived">
              <i class="fas fa-archive"></i> 已封存
            </span>
          </div>
        </div>
        <div class="url-actions">
          <button class="btn btn-sm btn-outline-info" @click="viewDetails(url.code)">
            <i class="fas fa-chart-bar"></i> 統計
          </button>
          <button class="btn btn-sm btn-outline-primary" @click="editUrl(url.code)">
            <i class="fas fa-edit"></i> 編輯
          </button>
          <button class="btn btn-sm btn-outline-danger" @click="confirmArchive(url.code)">
            <i class="fas fa-archive"></i> 封存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { shortUrlService } from '../services/apiService';

export default {
  name: 'DashboardView',
  setup() {
    const shortUrls = ref([]);
    const loading = ref(true);
    const error = ref(null);
    const router = useRouter();

    // Load all short URLs
    const loadShortUrls = async () => {
      try {
        loading.value = true;
        error.value = null;
        shortUrls.value = await shortUrlService.getAllShortUrls();
      } catch (err) {
        error.value = err.message || '無法載入短網址';
        console.error('Error loading short URLs:', err);
      } finally {
        loading.value = false;
      }
    };

    // Format date for display
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('zh-TW').format(date);
    };

    // Truncate long URLs for display
    const truncateUrl = (url, maxLength = 50) => {
      if (url.length <= maxLength) return url;
      return url.substring(0, maxLength) + '...';
    };

    // Navigate to create page
    const navigateToCreate = () => {
      router.push('/create');
    };

    // Navigate to edit page
    const editUrl = (code) => {
      router.push(`/edit/${code}`);
    };

    // Navigate to details page
    const viewDetails = (code) => {
      router.push(`/detail/${code}`);
    };

    // Copy short URL to clipboard
    const copyToClipboard = (code) => {
      const fullUrl = getFullShortUrl(code);
      navigator.clipboard.writeText(fullUrl);
      alert('短網址已複製到剪貼簿');
    };

    // Get full short URL including domain
    const getFullShortUrl = (code) => {
      return `${process.env.VUE_APP_REDIRECT_URL}/${code}`;
    };

    // Confirm and archive a short URL
    const confirmArchive = async (code) => {
      if (confirm('您確定要封存此短網址嗎？封存後，此連結將不再生效。')) {
        try {
          await shortUrlService.archiveShortUrl(code);
          loadShortUrls(); // Reload the list
        } catch (err) {
          error.value = err.message || '封存短網址時發生錯誤';
          console.error('Error archiving short URL:', err);
        }
      }
    };

    onMounted(loadShortUrls);

    return {
      shortUrls,
      loading,
      error,
      formatDate,
      truncateUrl,
      navigateToCreate,
      editUrl,
      viewDetails,
      copyToClipboard,
      getFullShortUrl,
      confirmArchive
    };
  }
}
</script>

<style scoped>
.dashboard-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 0;
  color: #6c757d;
}

.empty-state i {
  margin-bottom: 1rem;
  color: #adb5bd;
}

.url-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.url-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1.25rem;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.url-info {
  margin-bottom: 1rem;
}

.url-info h3 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: #212529;
}

.url-meta {
  margin-bottom: 0.75rem;
}

.short-url {
  display: flex;
  align-items: center;
  margin-bottom: 0.25rem;
}

.code {
  font-family: monospace;
  background-color: #f8f9fa;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  margin-right: 0.5rem;
  font-weight: bold;
  color: #007bff;
}

.target-url {
  color: #6c757d;
  font-size: 0.85rem;
  word-break: break-all;
}

.url-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: #6c757d;
}

.url-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.clicks {
  color: #28a745;
}

.expiry {
  color: #ffc107;
}

.archived {
  color: #dc3545;
}
</style>
