<template>
  <main class="login-view">
    <section class="login-card" aria-labelledby="login-title">
      <div class="brand-mark" aria-hidden="true">A</div>
      <h1 id="login-title">登入 AkaMoney</h1>
      <p>使用 Microsoft 帳號（Entra ID）繼續管理你的短網址與成效分析。</p>

      <div v-if="authSkipped" class="notice" data-tone="warning" role="status">目前使用開發環境略過驗證模式。</div>
      <div v-if="error" class="notice" data-tone="error" role="alert">{{ error }}</div>

      <button type="button" :disabled="loading" @click="handleLogin">
        <svg v-if="loading" class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>
        <svg v-else class="microsoft-glyph" viewBox="0 0 20 20" aria-hidden="true"><path fill="#f25022" d="M1 1h8v8H1z" /><path fill="#7fba00" d="M11 1h8v8h-8z" /><path fill="#00a4ef" d="M1 11h8v8H1z" /><path fill="#ffb900" d="M11 11h8v8h-8z" /></svg>
        {{ loading ? '正在前往登入…' : '使用 Microsoft 帳號登入' }}
      </button>

      <small>受 Microsoft Entra ID 單一登入（SSO）保護 · 僅限受邀成員</small>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { AuthConfigurationError, isAuthSkipped } from '@/services/auth';
import { getValidatedRedirect } from '@/utils/redirect';
import { toSafeErrorContext } from '@/utils/safeError';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const loading = ref(false);
const error = ref<string | null>(null);
const authSkipped = ref(isAuthSkipped());

onMounted(async () => {
  if (!authSkipped.value) return;
  loading.value = true;
  try {
    await authStore.login();
    await router.push(getValidatedRedirect(route.query.redirect));
  } catch (caught: unknown) {
    console.error('[Auth] Auto-login failed.', toSafeErrorContext(caught));
    error.value = '開發環境設定錯誤：略過驗證模式的自動登入失敗，請查看主控台。';
  } finally {
    loading.value = false;
  }
});

const handleLogin = async (): Promise<void> => {
  loading.value = true;
  error.value = null;
  try {
    await authStore.loginRedirect();
  } catch (caught: unknown) {
    error.value = caught instanceof AuthConfigurationError
      ? caught.message || '驗證尚未設定，請聯絡系統管理員。'
      : '登入失敗，請再試一次。';
    console.error('[Auth] Login failed.', toSafeErrorContext(caught));
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-view { display: grid; min-height: min(620px, calc(100vh - 96px)); place-items: center; padding: 24px 0; }
.login-card { display: grid; justify-items: stretch; gap: 15px; width: min(100%, 390px); box-sizing: border-box; padding: 28px; border: 1px solid var(--color-border); border-radius: var(--radius-xl); background: var(--color-surface); box-shadow: var(--shadow-2); }
.brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--radius-md); background: var(--color-accent); color: var(--color-accent-fg); font-family: var(--font-display); font-size: 19px; font-weight: 700; }
.login-card h1 { font-size: 24px; }
.login-card p { color: var(--color-muted); font-size: 13px; line-height: 1.6; }
.notice { padding: 9px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-muted); background: var(--color-surface-alt); font-size: 12px; }
.notice[data-tone="warning"] { border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border)); }
.notice[data-tone="error"] { border-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border)); background: var(--color-danger-soft); color: var(--color-danger); }
.login-card button { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 42px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.login-card button:hover:not(:disabled) { background: var(--color-surface-alt); }
.login-card button:disabled { cursor: wait; opacity: .7; }
.microsoft-glyph, .spinner { width: 18px; height: 18px; flex: none; }
.spinner { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 38 12; animation: spin .8s linear infinite; }
.login-card small { color: var(--color-faint); font-size: 11px; line-height: 1.5; text-align: center; }
@keyframes spin { to { transform: rotate(1turn); } }
</style>
