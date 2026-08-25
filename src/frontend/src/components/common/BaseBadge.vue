<template>
  <span class="badge" :class="tone === 'neutral' ? null : tone">
    <slot />
  </span>
</template>

<script setup lang="ts">
export type BadgeTone = 'neutral' | 'on' | 'off' | 'exp';

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: 'neutral' });
</script>
