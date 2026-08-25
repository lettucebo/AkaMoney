<template>
  <div class="empty-cta">
    <span class="big">{{ title }}</span>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string }>(), { description: '' });
</script>
