<template>
  <BaseModal :open="open" title="編輯短網址" wide @close="handleClose">
    <form novalidate @submit.prevent="handleSubmit">
      <div class="form">
        <div class="field wide">
          <span class="fl">短代碼</span>
          <div class="prefix-input">
            <span class="px">aka.money/</span>
            <input type="text" :value="url?.short_code" disabled data-testid="edit-short-code" />
          </div>
          <p class="field-hint">短代碼建立後無法變更。</p>
        </div>

        <div class="field wide">
          <label class="fl" for="edit-original-url">原始網址 <span class="req">必填</span></label>
          <input
            id="edit-original-url"
            v-model.trim="form.original_url"
            type="url"
            required
            data-testid="edit-original-url"
            placeholder="https://example.com"
          />
        </div>

        <div class="field">
          <label class="fl" for="edit-title">標題 <span class="opt">選填</span></label>
          <input id="edit-title" v-model.trim="form.title" type="text" data-testid="edit-title" placeholder="我的連結" />
        </div>

        <div class="field">
          <label class="fl" for="edit-expires-at">到期時間 <span class="opt">選填</span></label>
          <input
            id="edit-expires-at"
            v-model="form.expires_at_local"
            type="datetime-local"
            data-testid="edit-expires-at"
          />
          <p class="field-hint">清空表示永久有效（會明確清除既有到期日）。</p>
        </div>

        <div class="field wide">
          <label class="fl" for="edit-description">描述 <span class="opt">選填</span></label>
          <textarea id="edit-description" v-model.trim="form.description" rows="2" data-testid="edit-description"></textarea>
        </div>

        <div class="field wide">
          <span class="fl">預覽圖片 <span class="opt">選填</span></span>

          <div v-if="previewSrc" class="preview-thumb">
            <img :src="previewSrc" alt="連結預覽縮圖" />
            <BaseButton type="button" size="sm" variant="danger" class="preview-remove" @click="clearImage">移除</BaseButton>
          </div>
          <div
            v-else
            class="upload-area"
            :class="{ 'is-dragging': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
            @click="triggerFileInput"
          >
            <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <path d="M8 11V3M8 3 5.5 5.5M8 3l2.5 2.5" />
              <path d="M3 10.5v1.5A1.5 1.5 0 0 0 4.5 13.5h7a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
            </svg>
            <p>拖曳圖片到此處，或點擊上傳</p>
            <p class="field-hint">支援 JPEG、PNG、GIF、WebP、SVG，最大 10MB</p>
          </div>
          <input
            ref="fileInput"
            type="file"
            hidden
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            @change="handleFileSelect"
          />
          <p v-if="imageUploading" class="field-hint">上傳圖片中…</p>
          <p v-if="imageError" class="field-error" role="alert">{{ imageError }}</p>
        </div>

        <div class="field wide">
          <label class="fl" style="flex-direction: row; align-items: center; gap: 8px">
            <input
              v-model="form.is_active"
              type="checkbox"
              style="width: auto; height: auto"
              data-testid="edit-is-active"
            />
            使用中（取消勾選以封存此短網址）
          </label>
        </div>

        <StateBlock v-if="error" state="error" class="field wide" :message="error" />
      </div>
    </form>

    <template #footer>
      <BaseButton variant="ghost" :disabled="saving" @click="handleClose">取消</BaseButton>
      <BaseButton
        type="button"
        variant="primary"
        data-testid="edit-submit"
        :disabled="imageUploading"
        :loading="saving"
        loading-label="儲存中…"
        @click="handleSubmit"
      >
        儲存變更
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * Edit-URL modal - preserves every field the previous inline edit modal in
 * DashboardView.vue had (original URL, title, description, image upload,
 * active toggle, expiration-with-clear), moved behind BaseModal.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useUrlStore } from '@/stores/url';
import apiService from '@/services/api';
import type { UpdateUrlRequest, UrlResponse } from '@/types';
import { extractErrorMessage, toLocalDateTimeInputValue } from '@/utils/format';
import { validateImageFile } from './dashboardFormValidation';
import BaseModal from '@/components/common/BaseModal.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import StateBlock from '@/components/common/StateBlock.vue';

const props = defineProps<{
  open: boolean;
  url: UrlResponse | null;
}>();

const emit = defineEmits<{ close: []; saved: [url: UrlResponse] }>();

const urlStore = useUrlStore();

const emptyForm = () => ({
  original_url: '',
  title: '',
  description: '',
  image_url: '',
  is_active: true,
  expires_at_local: ''
});

const form = ref(emptyForm());
const saving = ref(false);
const error = ref<string | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const previewObjectUrl = ref<string | null>(null);
const imageUploading = ref(false);
const imageError = ref<string | null>(null);

// Only the newest file selection may write `image_url`/`imageUploading`. Anything
// that abandons the current selection (clear, close, unmount, a newer pick) bumps
// the generation so an in-flight upload resolving later becomes a no-op.
let uploadGeneration = 0;

const previewSrc = computed(() => previewObjectUrl.value || form.value.image_url || '');

const revokePreview = (): void => {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
};

const invalidateUpload = (): void => {
  uploadGeneration += 1;
  imageUploading.value = false;
};

// Re-seed the form on every open transition as well as on a url change, so an
// abandoned draft can never survive into the next time the same url is opened.
watch(
  [() => props.open, () => props.url],
  ([open, url]) => {
    invalidateUpload();
    error.value = null;
    imageError.value = null;
    revokePreview();
    if (!open || !url) {
      form.value = emptyForm();
      return;
    }
    form.value = {
      original_url: url.original_url,
      title: url.title || '',
      description: url.description || '',
      image_url: url.image_url || '',
      is_active: url.is_active,
      expires_at_local: url.expires_at ? toLocalDateTimeInputValue(url.expires_at) : ''
    };
  },
  { immediate: true }
);

const triggerFileInput = (): void => {
  fileInput.value?.click();
};

const uploadImage = async (file: File): Promise<void> => {
  const validationError = validateImageFile(file);
  if (validationError) {
    imageError.value = validationError;
    return;
  }

  const generation = ++uploadGeneration;
  imageError.value = null;
  imageUploading.value = true;
  revokePreview();
  previewObjectUrl.value = URL.createObjectURL(file);

  try {
    const result = await apiService.uploadImage(file);
    if (generation !== uploadGeneration) {
      return;
    }
    if (!result.url) {
      // A response missing the public url is not a usable upload - treat it as
      // an explicit failure and preserve whatever image_url was already saved,
      // instead of silently wiping it out with an empty string.
      imageError.value = '圖片上傳失敗，伺服器未提供圖片網址，請重新上傳。';
      revokePreview();
      return;
    }
    form.value.image_url = result.url;
  } catch (err: unknown) {
    if (generation !== uploadGeneration) {
      return;
    }
    imageError.value = extractErrorMessage(err, '圖片上傳失敗');
    revokePreview();
  } finally {
    if (generation === uploadGeneration) {
      imageUploading.value = false;
    }
  }
};

const handleFileSelect = (event: Event): void => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    uploadImage(file);
  }
};

const handleDrop = (event: DragEvent): void => {
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    uploadImage(file);
  }
};

const clearImage = (): void => {
  invalidateUpload();
  revokePreview();
  form.value.image_url = '';
  imageError.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const handleClose = (): void => {
  if (saving.value) {
    return;
  }
  emit('close');
};

const handleSubmit = async (): Promise<void> => {
  if (!props.url || saving.value) {
    return;
  }
  if (imageUploading.value) {
    error.value = '圖片上傳中，請稍候再儲存。';
    return;
  }
  error.value = null;
  saving.value = true;

  try {
    // Every optional field is sent explicitly: `null` clears it, a string writes
    // it. `undefined` would be dropped by JSON serialisation and silently mean
    // "leave unchanged", which is why an emptied field must not send `undefined`.
    const updateData: UpdateUrlRequest = {
      original_url: form.value.original_url,
      title: form.value.title || null,
      description: form.value.description || null,
      image_url: form.value.image_url || null,
      is_active: form.value.is_active,
      expires_at: form.value.expires_at_local ? new Date(form.value.expires_at_local).getTime() : null
    };

    const updated = await urlStore.updateUrl(props.url.id, updateData);
    emit('saved', updated);
    emit('close');
  } catch (err: unknown) {
    error.value = extractErrorMessage(err, '更新短網址失敗');
  } finally {
    saving.value = false;
  }
};

onBeforeUnmount(() => {
  invalidateUpload();
  revokePreview();
});
</script>
