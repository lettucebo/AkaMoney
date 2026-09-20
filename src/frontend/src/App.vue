<template>
  <AppShell v-if="showShell">
    <router-view />
  </AppShell>
  <router-view v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppShell from '@/components/layout/AppShell.vue';

const route = useRoute();
const authStore = useAuthStore();

/** The login screen is standalone; every route with a valid session renders inside the shell. */
const showShell = computed(() => authStore.hasValidSession && route.name !== 'Login');
</script>
