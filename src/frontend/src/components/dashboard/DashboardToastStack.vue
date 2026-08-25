<template>
  <div class="toast-stack" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.tone" role="status">
      <svg
        v-if="toast.tone === 'ok'"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
      <svg v-else viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 5.2v3.4M8 11h.01" stroke-linecap="round" />
      </svg>
      <span class="tmsg">{{ toast.message }}</span>
      <button type="button" class="icon-btn" aria-label="關閉通知" @click="emit('dismiss', toast.id)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Fixed-position success/error toast stack for dashboard CRUD feedback. */
export interface DashboardToast {
  id: string;
  message: string;
  tone: 'ok' | 'err';
}

defineProps<{ toasts: DashboardToast[] }>();

const emit = defineEmits<{ dismiss: [id: string] }>();
</script>
