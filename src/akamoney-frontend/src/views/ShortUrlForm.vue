<template>
  <div class="form-container">
    <div class="form-header">
      <h1>
        <i class="fas" :class="isEdit ? 'fa-edit' : 'fa-plus'"></i>
        {{ isEdit ? 'Edit Short URL' : 'Create Short URL' }}
      </h1>
      <button class="btn btn-outline-secondary" @click="goBack">
        <i class="fas fa-arrow-left"></i> Back
      </button>
    </div>

    <div v-if="loading" class="text-center my-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      <i class="fas fa-exclamation-circle"></i> {{ error }}
    </div>

    <form v-else @submit.prevent="submitForm" class="url-form">
      <div class="mb-3">
        <label for="targetUrl" class="form-label">Target URL*</label>
        <input
          type="url"
          class="form-control"
          id="targetUrl"
          v-model="form.targetUrl"
          placeholder="https://example.com/your-page"
          required
        >
      </div>

      <div class="mb-3">
        <label for="code" class="form-label">Custom Short Code</label>
        <div class="input-group">
          <span class="input-group-text">{{ baseUrl }}/</span>
          <input
            type="text"
            class="form-control"
            id="code"
            v-model="form.code"
            placeholder="Leave empty for auto-generation"
            :disabled="isEdit"
            pattern="[a-zA-Z0-9-_]+"
          >
          <button v-if="!isEdit" type="button" class="btn btn-outline-secondary" @click="generateRandomCode">
            <i class="fas fa-dice"></i> Generate Random
          </button>
        </div>
        <div class="form-text">If left empty, the system will automatically generate a short code. Code can only contain letters, numbers, hyphens, and underscores.</div>
      </div>

      <div class="mb-3">
        <label for="title" class="form-label">Title</label>
        <input
          type="text"
          class="form-control"
          id="title"
          v-model="form.title"
          placeholder="Short URL Title"
        >
        <div class="form-text">This title is used to identify the short URL in the management interface.</div>
      </div>

      <div class="social-meta-collapse">
        <div class="social-meta-header" @click="toggleSocialMeta">
          <h3>
            <i class="fas" :class="showSocialMeta ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            Social Media Metadata (Optional)
          </h3>
        </div>
        
        <div v-show="showSocialMeta" class="social-meta-content">
          <div class="mb-3">
            <label for="description" class="form-label">Description</label>
            <textarea
              class="form-control"
              id="description"
              v-model="form.description"
              rows="3"
              placeholder="Description shown when the short URL is shared on social media"
            ></textarea>
          </div>
          
          <div class="mb-3">
            <label for="imageUrl" class="form-label">Image URL</label>
            <input
              type="url"
              class="form-control"
              id="imageUrl"
              v-model="form.imageUrl"
              placeholder="https://example.com/image.jpg"
            >
            <div class="form-text">The image shown when the short URL is shared on social media.</div>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <label for="expirationDate" class="form-label">Expiration Date</label>
        <input
          type="date"
          class="form-control"
          id="expirationDate"
          v-model="form.expirationDate"
        >
        <div class="form-text">The short URL will no longer work after expiration. Leave empty for no expiration.</div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-outline-secondary" @click="goBack">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          <i class="fas" :class="isEdit ? 'fa-save' : 'fa-plus-circle'"></i>
          {{ isEdit ? 'Update Short URL' : 'Create Short URL' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import { ref, computed, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { shortUrlService } from '../services/apiService';

export default {
  name: 'ShortUrlFormView',
  props: {
    code: {
      type: String,
      required: false
    }
  },
  setup(props) {
    const router = useRouter();
    
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
    
    const toggleSocialMeta = () => {
      showSocialMeta.value = !showSocialMeta.value;
    };
    
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
    
    const generateRandomCode = async () => {
      try {
        const code = await shortUrlService.generateRandomCode();
        form.code = code;
      } catch (err) {
        error.value = err.message || '生成隨機代碼時發生錯誤';
        console.error('Error generating random code:', err);
      }
    };
    
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
        
        if (!isEdit.value && form.code) {
          data.code = form.code;
        }
        
        if (isEdit.value) {
          await shortUrlService.updateShortUrl(props.code, data);
        } else {
          await shortUrlService.createShortUrl(data);
        }
        
        router.push('/dashboard');
      } catch (err) {
        error.value = err.message || '儲存短網址時發生錯誤';
        console.error('Error submitting form:', err);
      } finally {
        submitting.value = false;
      }
    };
    
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
  color: var(--text-color);
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.form-header h1 {
  color: var(--text-color);
}

.url-form {
  background-color: var(--bg-color);
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 8px var(--header-shadow);
  border: 1px solid var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.social-meta-collapse {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 1rem;
  overflow: hidden;
  transition: border-color 0.3s ease;
}

.social-meta-header {
  padding: 0.75rem 1rem;
  background-color: var(--footer-bg);
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.social-meta-header h3 {
  font-size: 1rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color);
}

.social-meta-content {
  padding: 1rem;
  border-top: 1px solid var(--border-color);
  transition: border-color 0.3s ease;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
}

/* Form control styles for dark mode */
.form-control, .input-group-text {
  background-color: var(--bg-color);
  border-color: var(--border-color);
  color: var(--text-color);
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}

.form-control:focus {
  background-color: var(--bg-color);
  border-color: var(--primary-color);
  color: var(--text-color);
}

.form-control::placeholder {
  color: var(--footer-text);
}

.form-control:disabled {
  background-color: var(--footer-bg);
  color: var(--footer-text);
}

.form-text {
  color: var(--footer-text);
}

/* Dark mode button hover states */
.btn-outline-secondary:hover,
.btn-outline-primary:hover {
  color: var(--text-color);
}
</style>
