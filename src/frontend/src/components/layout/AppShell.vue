<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed, 'is-drawer-open': drawerOpen }">
    <AppSidebar :collapsed="collapsed" @toggle-collapsed="collapsed = !collapsed" />
    <div class="content">
      <AppTopbar :title="title" @open-drawer="drawerOpen = true" />
      <main class="view-wrap">
        <slot />
      </main>
    </div>
    <div v-if="drawerOpen" class="drawer-scrim" @click="drawerOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';

const route = useRoute();
const collapsed = ref(false);
const drawerOpen = ref(false);

const title = computed(() => {
  const routeTitle = route.meta.title;
  return typeof routeTitle === 'string' ? routeTitle : '連結';
});

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  }
);
</script>
