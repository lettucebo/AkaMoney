<template>
  <section class="palette" aria-labelledby="quick-create-heading">
    <div class="palette-head">
      <svg class="pi" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="2" />
        <path d="M5.5 6.5 7.5 8l-2 1.5M8.8 9.8H11" />
      </svg>
      <span id="quick-create-heading" class="pt">快速建立短網址</span>
    </div>

    <form novalidate @submit.prevent="handleSubmit">
      <div class="palette-body form">
        <div class="field wide">
          <label class="fl" for="qc-original-url">原始網址 <span class="req">必填</span></label>
          <input
            id="qc-original-url"
            v-model.trim="originalUrl"
            type="url"
            required
            autocomplete="off"
            placeholder="https://example.com/very-long-url"
          />
        </div>

        <div class="field">
          <label class="fl" for="qc-alias">短代碼 <span class="req">必填</span></label>
          <div class="prefix-input">
            <span class="px">aka.money/</span>
            <input
              id="qc-alias"
              v-model.trim="alias"
              type="text"
              required
              minlength="3"
              maxlength="20"
              autocomplete="off"
              placeholder="my-link"
              @blur="validateAliasField"
            />
            <BaseButton type="button" size="sm" variant="ghost" @click="generateRandomAlias">
              隨機
            </BaseButton>
          </div>
          <p v-if="aliasError" class="field-error" role="alert">{{ aliasError }}</p>
          <p v-else class="field-hint">3–20 個字元，僅限英文字母、數字、連字號（-）與底線（_）。</p>
        </div>

        <div class="field">
          <label class="fl" for="qc-title">標題 <span class="opt">選填</span></label>
          <input id="qc-title" v-model.trim="title" type="text" autocomplete="off" placeholder="我的連結" />
        </div>

        <div class="field wide">
          <label class="fl" for="qc-description">描述 <span class="opt">選填</span></label>
          <textarea id="qc-description" v-model.trim="description" rows="2" placeholder="簡短描述這個連結的用途"></textarea>
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

        <div class="field">
          <label class="fl" for="qc-expires">到期時間 <span class="opt">選填</span></label>
          <input id="qc-expires" v-model="expiresAtInput" type="datetime-local" />
          <p class="field-hint">留空表示永久有效</p>
        </div>

        <StateBlock v-if="formError" state="error" class="field wide" :message="formError" />
      </div>

      <div class="palette-foot">
        <span class="field-hint">建立後將立即出現在下方清單最前面</span>
        <span class="grow" />
        <BaseButton type="button" variant="ghost" :disabled="submitting" @click="resetForm">重設</BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          :disabled="imageUploading"
          :loading="submitting"
          loading-label="建立中…"
        >
          建立短網址
        </BaseButton>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
/**
 * Inline quick-create panel - the Proposal F dashboard replaces the old
 * modal-triggered UrlCreateForm.vue with an always-visible inline panel.
 *
 * This preserves every capability the old form had: a required custom
 * alias (validated client-side, 3-20 chars) with a random-code generator,
 * optional title/description/expiry, and image upload (drag & drop or
 * click, with an allow-listed type/10MB check, object-URL preview, and
 * removal). It intentionally does NOT add password/delete/QR fields, and
 * does not add a raw image-URL text input - the original form only ever
 * populated `image_url` via a successful upload.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { nanoid } from 'nanoid';
import { useUrlStore } from '@/stores/url';
import apiService from '@/services/api';
import type { CreateUrlRequest, UrlResponse } from '@/types';
import { extractErrorMessage } from '@/utils/format';
import { validateImageFile, validateShortCode } from './dashboardFormValidation';
import BaseButton from '@/components/common/BaseButton.vue';
import StateBlock from '@/components/common/StateBlock.vue';

const emit = defineEmits<{ created: [url: UrlResponse] }>();

const urlStore = useUrlStore();

const originalUrl = ref('');
const alias = ref('');
const title = ref('');
const description = ref('');
const expiresAtInput = ref('');

const aliasError = ref<string | null>(null);
const formError = ref<string | null>(null);
const submitting = ref(false);

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const imageUrl = ref('');
const previewObjectUrl = ref<string | null>(null);
const imageUploading = ref(false);
const imageError = ref<string | null>(null);

// Only the newest file selection may write `imageUrl`/`imageUploading`. Anything
// that abandons the current selection (clear, reset, unmount, a newer pick) bumps
// the generation, so an in-flight upload resolving later becomes a no-op instead
// of attaching a stale image to whatever the form now holds.
let uploadGeneration = 0;

const previewSrc = computed(() => previewObjectUrl.value || imageUrl.value || '');

const invalidateUpload = (): void => {
  uploadGeneration += 1;
  imageUploading.value = false;
};

const validateAliasField = (): boolean => {
  aliasError.value = validateShortCode(alias.value);
  return aliasError.value === null;
};

const generateRandomAlias = (): void => {
  alias.value = nanoid(8);
  aliasError.value = null;
};

const triggerFileInput = (): void => {
  fileInput.value?.click();
};

const revokePreview = (): void => {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
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
      // an explicit failure instead of silently attaching an empty image_url.
      imageError.value = '圖片上傳失敗，伺服器未提供圖片網址，請重新上傳。';
      revokePreview();
      return;
    }
    imageUrl.value = result.url;
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
  imageUrl.value = '';
  imageError.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const resetForm = (): void => {
  originalUrl.value = '';
  alias.value = '';
  title.value = '';
  description.value = '';
  expiresAtInput.value = '';
  aliasError.value = null;
  formError.value = null;
  clearImage();
};

const handleSubmit = async (): Promise<void> => {
  if (submitting.value) {
    return;
  }
  formError.value = null;
  if (imageUploading.value) {
    formError.value = '圖片上傳中，請稍候再建立。';
    return;
  }
  const aliasValid = validateAliasField();
  if (!originalUrl.value) {
    formError.value = '請輸入原始網址';
    return;
  }
  if (!aliasValid) {
    return;
  }

  submitting.value = true;
  try {
    const data: CreateUrlRequest = {
      original_url: originalUrl.value,
      short_code: alias.value.trim()
    };
    if (title.value) data.title = title.value;
    if (description.value) data.description = description.value;
    if (imageUrl.value) data.image_url = imageUrl.value;
    if (expiresAtInput.value) {
      data.expires_at = new Date(expiresAtInput.value).getTime();
    }

    const created = await urlStore.createUrl(data);
    resetForm();
    emit('created', created);
  } catch (err: unknown) {
    formError.value = extractErrorMessage(err, '建立短網址失敗');
  } finally {
    submitting.value = false;
  }
};

onBeforeUnmount(() => {
  invalidateUpload();
  revokePreview();
});
</script>
