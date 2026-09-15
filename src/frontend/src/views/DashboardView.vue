<template>
  <div class="dashboard-view">
    <KpiSummary :stats="kpiStats" :loading="kpiLoading" :error="kpiError" @retry="loadKpiSummary" />

    <div class="page-head">
      <div>
        <h1>連結</h1>
        <div class="sub">搜尋並管理所有短網址與即時成效。</div>
      </div>
      <BaseButton variant="primary" data-testid="open-create" @click="openCreateModal">
        新增短網址
      </BaseButton>
    </div>

    <UrlTableToolbar
      :search="searchInput"
      :status="urlStore.query.status"
      :sort="urlStore.query.sort"
      :counts="urlStore.counts"
      :busy="isBusy"
      @update:search="onSearchInput"
      @update:status="onStatusChange"
      @update:sort="onSortChange"
    />

    <StateBlock v-if="showInitialLoading" state="loading" title="載入中" message="正在載入短網址清單…" />
    <StateBlock v-else-if="urlStore.listError" state="error" title="無法載入清單" :message="urlStore.listError" />
    <EmptyState
      v-else-if="isEmptyAccount"
      title="尚未建立任何短網址"
      description="建立第一個短網址後，就能在這裡管理連結與查看成效。"
    >
      <template #action>
        <BaseButton variant="primary" data-testid="empty-open-create" @click="openCreateModal">
          新增短網址
        </BaseButton>
      </template>
    </EmptyState>
    <EmptyState
      v-else-if="isNoResults"
      title="沒有符合條件的短網址"
      description="試著調整搜尋關鍵字或狀態篩選。"
    >
      <template #action>
        <BaseButton variant="default" data-testid="clear-filters" @click="clearFilters">
          清除篩選
        </BaseButton>
      </template>
    </EmptyState>
    <div v-else :class="{ 'is-busy': isBusy }" :aria-busy="isBusy">
      <UrlTable
        :urls="urlStore.urls"
        :copied-id="copiedId"
        @copy="handleCopy"
        @edit="openEdit"
        @archive="confirmArchive"
        @restore="confirmRestore"
      />
    </div>

    <DashboardPagination
      :page="urlStore.pagination.page"
      :total-pages="urlStore.pagination.total_pages"
      :total="urlStore.pagination.total"
      @change="onPageChange"
    />

    <UrlCreateModal
      :open="showCreateModal"
      @close="closeCreateModal"
      @created="handleCreated"
    />

    <UrlEditModal :open="showEditModal" :url="editingUrl" @close="closeEdit" @saved="handleEditSaved" />

    <ConfirmActionModal
      :open="showArchiveModal"
      title="封存這個短網址？"
      description="封存後連結會停止轉址，但你可以立即還原。"
      confirm-label="確認封存"
      confirm-variant="danger"
      :loading="archiveSubmitting"
      :error="archiveError"
      @close="showArchiveModal = false"
      @confirm="handleArchiveConfirm"
    />

    <ConfirmActionModal
      :open="showRestoreModal"
      title="還原這個短網址？"
      description="還原後短網址將恢復轉址並重新開始計算點擊。"
      confirm-label="確認還原"
      :loading="restoreSubmitting"
      :error="restoreError"
      @close="showRestoreModal = false"
      @confirm="handleRestoreConfirm"
    />

    <DashboardToastStack :toasts="toasts" @dismiss="dismissToast" />
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard vertical slice (Proposal F): KPI summary -> on-demand create modal
 * -> dense URL table, composed entirely from src/components/dashboard/**.
 *
 * Search/status/sort are account-wide, not current-page: they are sent to
 * `GET /api/urls`, and the server decides which rows belong on the page, in
 * what order, and what the status counts are.
 *
 * The route's query string is the single source of truth for that list query.
 * An `immediate` watcher on it is the ONLY thing that fetches the list, which
 * is what makes browser back/forward work - a same-route query change never
 * re-runs `onMounted`, and `router.replace` would not create the history entry
 * back/forward needs. User-initiated changes therefore `push`; only
 * normalization (e.g. a page the server clamped) uses `replace`.
 *
 * The KPI summary fetch (explicit rolling 30-day window) is independent of the
 * URL list fetch, so a KPI failure never blocks the list from rendering and
 * vice versa.
 *
 * Create/edit/archive/restore keep the table stable: the store applies the
 * mutation to `urlStore.urls` directly and then reconciles with a *silent*
 * refetch that never blanks the table. Only the independent KPI summary is
 * re-fetched here after a mutation, since it may have changed.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUrlStore } from '@/stores/url';
import apiService from '@/services/api';
import type { OverallStatsResponse, UrlListQueryState, UrlListSort, UrlListStatus, UrlResponse } from '@/types';
import { extractErrorMessage } from '@/utils/format';
import { shortLinkTarget } from '@/utils/shortLink';
import { rollingWindow } from '@/utils/trend';
import {
  hasActiveUrlListFilters,
  isSameUrlListQuery,
  parseUrlListRouteQuery,
  toUrlListRouteQuery
} from '@/utils/urlListQuery';
import { useDebouncedCallback } from '@/composables/useDebouncedCallback';
import KpiSummary from '@/components/dashboard/KpiSummary.vue';
import UrlCreateModal from '@/components/dashboard/UrlCreateModal.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import UrlTableToolbar from '@/components/dashboard/UrlTableToolbar.vue';
import UrlTable from '@/components/dashboard/UrlTable.vue';
import DashboardPagination from '@/components/dashboard/DashboardPagination.vue';
import UrlEditModal from '@/components/dashboard/UrlEditModal.vue';
import ConfirmActionModal from '@/components/dashboard/ConfirmActionModal.vue';
import DashboardToastStack, { type DashboardToast } from '@/components/dashboard/DashboardToastStack.vue';
import StateBlock from '@/components/common/StateBlock.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const ROLLING_WINDOW_DAYS = 30;
const COPY_FEEDBACK_DURATION = 2000;
const TOAST_DISPLAY_DURATION = 5000;
const SEARCH_DEBOUNCE_MS = 300;

const urlStore = useUrlStore();
const route = useRoute();
const router = useRouter();

// --- KPI summary: independent loading/error from the URL list below. ---
const kpiStats = ref<OverallStatsResponse | null>(null);
const kpiLoading = ref(false);
const kpiError = ref<string | null>(null);

// Every KPI fetch carries a monotonic generation id. A create/edit/archive/
// restore refresh always starts a newer generation than any fetch already in
// flight, so if the mount-time (or any earlier) request resolves or rejects
// after that, its result is only ever a no-op - it can never clobber newer
// stats with stale data, nor replace a newer success with a stale error.
let kpiRequestGeneration = 0;

const loadKpiSummary = async (): Promise<void> => {
  const generation = ++kpiRequestGeneration;
  kpiLoading.value = true;
  kpiError.value = null;
  try {
    const { start, end } = rollingWindow(ROLLING_WINDOW_DAYS);
    const stats = await apiService.getOverallStats(start, end);
    if (generation !== kpiRequestGeneration) {
      return;
    }
    kpiStats.value = stats;
  } catch (err: unknown) {
    if (generation !== kpiRequestGeneration) {
      return;
    }
    kpiError.value = extractErrorMessage(err, '無法載入統計摘要');
    kpiStats.value = null;
  } finally {
    if (generation === kpiRequestGeneration) {
      kpiLoading.value = false;
    }
  }
};

// --- Account-wide search/status/sort, driven by the route query. ---

/**
 * The search box's live value.
 *
 * Kept separate from `urlStore.query.search` so typing stays responsive while
 * the debounced navigation catches up.
 */
const searchInput = ref('');

const DASHBOARD_ROUTE = 'Dashboard';

/**
 * Whether the dashboard is still the active route.
 *
 * `navigate` intentionally passes only `query`, which vue-router resolves
 * against the *current* route. Without this guard a response that lands just
 * after the user navigated away would rewrite the query string of whatever page
 * they moved on to, and the route watcher would fetch the list for it.
 */
const isDashboardRoute = (): boolean => route.name === DASHBOARD_ROUTE;

const navigate = (next: UrlListQueryState, mode: 'push' | 'replace' = 'push'): void => {
  if (!isDashboardRoute()) {
    return;
  }
  const query = toUrlListRouteQuery(next);
  router[mode]({ query }).catch(() => {
    // Duplicated navigations are expected (e.g. clearing an already-empty
    // filter) and are not an error worth surfacing.
  });
};

const pushSearch = useDebouncedCallback((value: string) => {
  // Refining an existing search replaces its history entry instead of adding
  // one per pause, so Back returns to the pre-search list rather than walking
  // backwards through every prefix the user typed.
  const mode = parseUrlListRouteQuery(route.query).search ? 'replace' : 'push';
  navigate({ ...urlStore.query, search: value.trim(), page: 1 }, mode);
}, SEARCH_DEBOUNCE_MS);

const onSearchInput = (value: string): void => {
  searchInput.value = value;
  pushSearch(value);
};

const onStatusChange = (status: UrlListStatus): void => {
  pushSearch.cancel();
  navigate({ ...urlStore.query, search: searchInput.value.trim(), status, page: 1 });
};

const onSortChange = (sort: UrlListSort): void => {
  pushSearch.cancel();
  // Sorting reorders the whole result set, so the current page number is
  // meaningless afterwards.
  navigate({ ...urlStore.query, search: searchInput.value.trim(), sort, page: 1 });
};

const onPageChange = (page: number): void => {
  pushSearch.cancel();
  navigate({ ...urlStore.query, search: searchInput.value.trim(), page });
};

const clearFilters = (): void => {
  pushSearch.cancel();
  searchInput.value = '';
  navigate({ ...urlStore.query, search: '', status: 'all', page: 1 });
};

/**
 * The single fetch trigger.
 *
 * Runs on mount and on every route query change, including the ones produced by
 * browser back/forward, so the rendered list always matches the address bar.
 */
let lastFetchedQuery: UrlListQueryState | null = null;

watch(
  () => route.query,
  (rawQuery) => {
    if (!isDashboardRoute()) {
      return;
    }
    const next = parseUrlListRouteQuery(rawQuery);

    // An external navigation (back/forward, pasted URL) must win over a search
    // keystroke that has not been committed yet.
    if (next.search !== searchInput.value.trim()) {
      pushSearch.cancel();
      searchInput.value = next.search;
    }

    // Our own navigations land here too; refetching an identical query would
    // double every user interaction.
    if (lastFetchedQuery && isSameUrlListQuery(next, lastFetchedQuery)) {
      return;
    }
    lastFetchedQuery = next;

    void urlStore.fetchUrls({ ...next, limit: urlStore.pagination.limit });
  },
  { immediate: true }
);

/**
 * Keeps the address bar honest when the store's query changes on its own.
 *
 * Two cases reach here, both from the server rather than the user: a requested
 * page the server clamped to the end of the result set, and a mutation whose
 * silent refresh landed on a different page (e.g. archiving the only row on the
 * last page). Neither goes through `navigate`, so without this the URL would
 * keep advertising a page the table is no longer showing.
 *
 * `lastFetchedQuery` is updated first so the resulting route change is
 * recognised as already-applied and does not trigger another fetch. Being a
 * component watcher, it also stops at unmount - a late response can never
 * rewrite the query string of whatever page the user moved on to.
 */
watch(
  () => urlStore.query,
  (storeQuery) => {
    if (isSameUrlListQuery(storeQuery, parseUrlListRouteQuery(route.query))) {
      return;
    }
    lastFetchedQuery = { ...storeQuery };
    navigate(storeQuery, 'replace');
  },
  { deep: true }
);

const showInitialLoading = computed(() => urlStore.listLoading && urlStore.urls.length === 0);
/** A request is in flight but rows are still on screen - dim, do not blank. */
const isBusy = computed(() => urlStore.listLoading && urlStore.urls.length > 0);

const hasFilters = computed(() => hasActiveUrlListFilters(urlStore.query));
const isListSettled = computed(
  () => !showInitialLoading.value && !urlStore.listError && urlStore.urls.length === 0
);
const isEmptyAccount = computed(() => isListSettled.value && !hasFilters.value);
const isNoResults = computed(() => isListSettled.value && hasFilters.value);

// --- Toasts. ---
const timeoutIds: number[] = [];
const scheduleTimeout = (fn: () => void, delay: number): number => {
  const id = window.setTimeout(fn, delay);
  timeoutIds.push(id);
  return id;
};

const toasts = ref<DashboardToast[]>([]);
const dismissToast = (id: string): void => {
  toasts.value = toasts.value.filter((t) => t.id !== id);
};
const pushToast = (message: string, tone: DashboardToast['tone']): void => {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toasts.value.push({ id, message, tone });
  scheduleTimeout(() => dismissToast(id), TOAST_DISPLAY_DURATION);
};

onMounted(() => {
  // The URL list is fetched by the route-query watcher above; only the
  // independent KPI summary is kicked off here.
  loadKpiSummary();
});

onBeforeUnmount(() => {
  timeoutIds.forEach((id) => window.clearTimeout(id));
});

// --- Copy short URL. ---
const copiedId = ref<string | null>(null);
const handleCopy = async (url: UrlResponse): Promise<void> => {
  if (!navigator.clipboard) {
    pushToast('瀏覽器不支援剪貼簿功能，請手動複製網址。', 'err');
    return;
  }
  try {
    // Built from `short_code`, not the API's `short_url` - the Admin API returns
    // the bare short code there (see UrlTable.vue for the full explanation).
    await navigator.clipboard.writeText(shortLinkTarget(url.short_code));
    copiedId.value = url.id;
    scheduleTimeout(() => {
      if (copiedId.value === url.id) {
        copiedId.value = null;
      }
    }, COPY_FEEDBACK_DURATION);
  } catch {
    pushToast('複製失敗，請手動複製網址。', 'err');
  }
};

// --- Create. ---
const showCreateModal = ref(false);

const openCreateModal = (): void => {
  showCreateModal.value = true;
};

const closeCreateModal = (): void => {
  showCreateModal.value = false;
};

const handleCreated = (url: UrlResponse): void => {
  closeCreateModal();
  pushToast(`已建立短網址：${url.short_code}`, 'ok');
  loadKpiSummary();
};

// --- Edit. ---
const showEditModal = ref(false);
const editingUrl = ref<UrlResponse | null>(null);
const openEdit = (url: UrlResponse): void => {
  editingUrl.value = url;
  showEditModal.value = true;
};
const closeEdit = (): void => {
  showEditModal.value = false;
};
const handleEditSaved = (url: UrlResponse): void => {
  pushToast(`已更新短網址：${url.short_code}`, 'ok');
  loadKpiSummary();
};

// --- Archive. ---
const showArchiveModal = ref(false);
const archiveTarget = ref<UrlResponse | null>(null);
const archiveSubmitting = ref(false);
const archiveError = ref<string | null>(null);
const confirmArchive = (url: UrlResponse): void => {
  archiveTarget.value = url;
  archiveError.value = null;
  showArchiveModal.value = true;
};
const handleArchiveConfirm = async (): Promise<void> => {
  if (!archiveTarget.value) {
    return;
  }
  archiveSubmitting.value = true;
  archiveError.value = null;
  try {
    const url = await urlStore.archiveUrl(archiveTarget.value.id);
    showArchiveModal.value = false;
    pushToast(`已封存短網址：${url.short_code}`, 'ok');
    loadKpiSummary();
  } catch (err: unknown) {
    archiveError.value = extractErrorMessage(err, '封存失敗');
  } finally {
    archiveSubmitting.value = false;
  }
};

// --- Restore. ---
const showRestoreModal = ref(false);
const restoreTarget = ref<UrlResponse | null>(null);
const restoreSubmitting = ref(false);
const restoreError = ref<string | null>(null);
const confirmRestore = (url: UrlResponse): void => {
  restoreTarget.value = url;
  restoreError.value = null;
  showRestoreModal.value = true;
};
const handleRestoreConfirm = async (): Promise<void> => {
  if (!restoreTarget.value) {
    return;
  }
  restoreSubmitting.value = true;
  restoreError.value = null;
  try {
    const url = await urlStore.restoreUrl(restoreTarget.value.id);
    showRestoreModal.value = false;
    pushToast(`已還原短網址：${url.short_code}`, 'ok');
    loadKpiSummary();
  } catch (err: unknown) {
    restoreError.value = extractErrorMessage(err, '還原失敗');
  } finally {
    restoreSubmitting.value = false;
  }
};
</script>
