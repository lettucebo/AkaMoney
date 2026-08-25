<template>
  <div class="state" :data-state="state" :role="state === 'error' ? 'alert' : 'status'">
    <svg
      v-if="state === 'loading'"
      class="si spin"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" />
    </svg>
    <svg
      v-else-if="state === 'error'"
      class="si"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.8v4M8 11.2h.01" />
    </svg>
    <svg
      v-else
      class="si"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.2v4M8 4.8h.01" />
    </svg>
    <div class="min-w-0 flex-1">
      <b v-if="title">{{ title }}</b>
      <span>{{ message }}</span>
    </div>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
export type BlockState = 'loading' | 'error' | 'info';

withDefaults(defineProps<{ state?: BlockState; title?: string; message?: string }>(), {
  state: 'info',
  title: '',
  message: ''
});
</script>
