<template>
  <header class="topbar">
    <button
      type="button"
      class="icon-btn drawer-trigger"
      data-testid="drawer-open"
      aria-label="開啟導覽選單"
      @click="emit('open-drawer')"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      </svg>
    </button>

    <div class="crumbs">
      <b>{{ appName }}</b>
      <span class="sep">/</span>
      <span>{{ title }}</span>
    </div>

    <span class="topbar-spacer" />

    <div class="user-menu">
      <button
        type="button"
        class="btn sm ghost"
        data-testid="user-menu-toggle"
        :aria-expanded="open ? 'true' : 'false'"
        aria-haspopup="menu"
        @click="open = !open"
      >
        <span class="who-avatar" aria-hidden="true">{{ initial }}</span>
        <span class="user-menu-name">{{ authStore.userName }}</span>
      </button>
      <div v-if="open" class="user-menu-panel" role="menu">
        <div class="user-menu-head">
          <b>{{ authStore.userName }}</b>
          <span>{{ authStore.userEmail }}</span>
        </div>
        <button type="button" class="user-menu-item" role="menuitem" data-testid="logout" @click="handleLogout">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path d="M6 2h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6" />
            <path d="M9 8H2m0 0 2.5-2.5M2 8l2.5 2.5" />
          </svg>
          登出
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

defineProps<{ title: string }>();

const emit = defineEmits<{ 'open-drawer': [] }>();

const appName = import.meta.env.VITE_APP_NAME || 'AkaMoney';
const authStore = useAuthStore();
const router = useRouter();
const open = ref(false);

const initial = computed(() => authStore.userName.trim().charAt(0).toUpperCase() || 'A');

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    open.value = false;
  }
};

const handleLogout = async (): Promise<void> => {
  open.value = false;
  await authStore.logout();
  await router.push('/login');
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.drawer-trigger {
  display: none;
}

.user-menu-name {
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .drawer-trigger {
    display: inline-grid;
  }

  .user-menu-name {
    display: none;
  }
}
</style>
