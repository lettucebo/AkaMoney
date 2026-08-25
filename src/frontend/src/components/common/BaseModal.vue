<template>
  <div v-if="open" class="modal-scrim" @click.self="emit('close')">
    <div
      class="modal-panel"
      :class="{ wide }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <div class="modal-head">
        <h2 :id="titleId">{{ title }}</h2>
        <span class="topbar-spacer" />
        <button
          type="button"
          class="icon-btn"
          data-testid="modal-close"
          aria-label="關閉"
          @click="emit('close')"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="modal-foot">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId } from 'vue';

const props = withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean }>(), {
  wide: false
});

const emit = defineEmits<{ close: [] }>();

const titleId = `modal-title-${useId()}`;

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && props.open) {
    emit('close');
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>
