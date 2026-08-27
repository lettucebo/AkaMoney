<template>
  <button
    :type="type"
      :form="form"
      class="btn"
    :class="[variant === 'default' ? null : variant, size === 'sm' ? 'sm' : null]"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    @click="emit('click', $event)"
  >
    <svg
      v-if="loading"
      class="spin"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      aria-hidden="true"
    >
      <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" />
    </svg>
    <span v-if="loading && loadingLabel">{{ loadingLabel }}</span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
    type?: 'button' | 'submit' | 'reset';
    form?: string;
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
  }>(),
  {
    variant: 'default',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    loadingLabel: ''
  }
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<style scoped>
.spin {
  animation: aka-spin 0.8s linear infinite;
}
</style>
