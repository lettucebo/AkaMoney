<template>
  <div class="form-container">
    <div class="form-header">
      <h1>
        <i class="fas" :class="isEdit ? 'fa-edit' : 'fa-plus'"></i>
        {{ isEdit ? '編輯短網址' : '建立短網址' }}
      </h1>
      <button class="btn btn-outline-secondary" @click="goBack">
        <i class="fas fa-arrow-left"></i> 返回
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

    <form v-else @submit.prevent="submitForm" class="url-form">
      <div class="mb-3">
        <label for="targetUrl" class="form-label">目標網址 *</label>
        <input
          type="url"
          class="form-control"
          id="targetUrl"
          v-model="form.targetUrl"
          placeholder="https://example.com"
          required
        >
        <div class="form-text">此為短網址將轉址至的最終網址。</div>
      </div>

      <div class="mb-3">
        <label for="code" class="form-label">自訂短網址代碼</label>
        <div class="input-group">
          <span class="input-group-text">{{ baseUrl }}/</span>
          <input
            type="text"
            class="form-control"
            id="code"
            v-model="form.code"
            placeholder="留空以自動生成"
            :disabled="isEdit"
            pattern="[a-zA-Z0-9-_]+"
          >
          <button v-if="!isEdit" type="button" class="btn btn-outline-secondary" @click="generateRandomCode">
            <i class="fas fa-dice"></i> 隨機生成
          </button>
        </div>
        <div class="form-text">如果留空，系統將自動生成短網址代碼。代碼只能包含字母、數字、連字符和底線。</div>
      </div>

      <div class="mb-3">
        <label for="title" class="form-label">標題</label>
        <input
          type="text"
          class="form-control"
          id="title"
          v-model="form.title"
          placeholder="短網址標題"
        >
        <div class="form-text">此標題用於識別短網址，僅顯示在管理介面。</div>
      </div>

      <div class="social-meta-collapse">
        <div class="social-meta-header" @click="toggleSocialMeta">
          <h3>
            <i class="fas" :class="showSocialMeta ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            社交媒體元資料（選填）
          </h3>
        </div>
        
        <div v-show="showSocialMeta" class="social-meta-content">
          <div class="mb-3">
            <label for="description" class="form-label">描述</label>
            <textarea
              class="form-control"
              id="description"
              v-model="form.description"
              rows="3"
              placeholder="當短網址在社交媒體上分享時顯示的描述"
            ></textarea>
          </div>
          
          <div class="mb-3">
            <label for="imageUrl" class="form-label">圖片 URL</label>
            <input
              type="url"
              class="form-control"
              id="imageUrl"
              v-model="form.imageUrl"
              placeholder="https://example.com/image.jpg"
            >
            <div class="form-text">當短網址在社交媒體上分享時顯示的圖片。</div>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <label for="expirationDate" class="form-label">到期日</label>
        <input
          type="date"
          class="form-control"
          id="expirationDate"
          v-model="form.expirationDate"
        >
        <div class="form-text">短網址到期後將不再有效。留空表示永不過期。</div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-outline-secondary" @click="goBack">取消</button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          <i class="fas" :class="isEdit ? 'fa-save' : 'fa-plus-circle'"></i>
          {{ isEdit ? '更新短網址' : '建立短網址' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import { ref, computed, onMounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { shortUrlService } from '../services/apiService';

export default {
  name: 'ShortUrlForm',
  props: {
    code: {
      type: String,
      required: false
    }
  },
  setup(props) {
    const router = useRouter();
    const route = useRoute();
    
    const loading = ref(false);
    const submitting = ref(false);
    const error = ref(null);
    const showSocialMeta = ref(false);
    
    const form = reactive({
      code: '',
      targetUrl: '',
      title: '',
      description: '',
      imageUrl: '',
      expirationDate: ''
    });
    
    const isEdit = computed(() => !!props.code);
    const baseUrl = computed(() => process.env.VUE_APP_REDIRECT_URL);
    
    // Toggle social metadata section
    const toggleSocialMeta = () => {
      showSocialMeta.value = !showSocialMeta.value;
    };
    
    // Load existing short URL for editing
    const loadShortUrl = async () => {
      if (!props.code) return;
      
      try {
        loading.value = true;
        error.value = null;
        const shortUrl = await shortUrlService.getShortUrl(props.code);
        
        form.code = shortUrl.code;
        form.targetUrl = shortUrl.targetUrl;
        form.title = shortUrl.title || '';
        form.description = shortUrl.description || '';
        form.imageUrl = shortUrl.imageUrl || '';
        
        if (shortUrl.expirationDate) {
          const expDate = new Date(shortUrl.expirationDate);
          form.expirationDate = expDate.toISOString().split('T')[0];
        } else {
          form.expirationDate = '';
        }
      } catch (err) {
        error.value = err.message || '載入短網址資料時發生錯誤';
        console.error('Error loading short URL:', err);
      } finally {
        loading.value = false;
      }
    };
    
    // Generate a random code
    const generateRandomCode = async () => {
      try {
        const code = await shortUrlService.generateRandomCode();
        form.code = code;
      } catch (err) {
        error.value = err.message || '生成隨機代碼時發生錯誤';
        console.error('Error generating random code:', err);
      }
    };
    
    // Submit form
    const submitForm = async () => {
      try {
        submitting.value = true;
        error.value = null;
        
        const data = {
          targetUrl: form.targetUrl,
          title: form.title || null,
          description: form.description || null,
          imageUrl: form.imageUrl || null,
          expirationDate: form.expirationDate || null
        };
        
        // Add code only if not editing and code is provided
        if (!isEdit.value && form.code) {
          data.code = form.code;
        }
        
        let result;
        if (isEdit.value) {
          result = await shortUrlService.updateShortUrl(props.code, data);
        } else {
          result = await shortUrlService.createShortUrl(data);
        }
        
        router.push('/dashboard');
      } catch (err) {
        error.value = err.message || '儲存短網址時發生錯誤';
        console.error('Error submitting form:', err);
      } finally {
        submitting.value = false;
      }
    };
    
    // Go back to dashboard
    const goBack = () => {
      router.push('/dashboard');
    };
    
    onMounted(() => {
      if (isEdit.value) {
        loadShortUrl();
      }
    });
    
    return {
      form,
      loading,
      submitting,
      error,
      isEdit,
      baseUrl,
      showSocialMeta,
      toggleSocialMeta,
      generateRandomCode,
      submitForm,
      goBack
    };
  }
}
</script>

<style scoped>
.form-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.url-form {
  background-color: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.social-meta-collapse {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  margin-bottom: 1rem;
  overflow: hidden;
}

.social-meta-header {
  padding: 0.75rem 1rem;
  background-color: #f8f9fa;
  cursor: pointer;
}

.social-meta-header h3 {
  font-size: 1rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.social-meta-content {
  padding: 1rem;
  border-top: 1px solid #dee2e6;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
}
</style>
