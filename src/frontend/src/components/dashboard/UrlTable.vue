<template>
  <div class="table" role="table" aria-label="短網址清單（目前頁面）">
    <div class="thead" aria-hidden="true">
      <span>短連結</span>
      <span>原始網址</span>
      <span class="num">點擊</span>
      <span>狀態</span>
      <span />
    </div>
    <div v-for="url in urls" :key="url.id" class="row" role="row">
      <span class="c-code">
        <span class="dot" :class="{ off: linkStatus(url) === 'off', exp: linkStatus(url) === 'exp' }" aria-hidden="true" />
        <span class="c-code-main">
          <a class="lk" :href="shortLinkTarget(url.short_code)" target="_blank" rel="noopener noreferrer" :title="`${displayHost}/${url.short_code}`">
            {{ displayHost }}/{{ url.short_code }}
          </a>
          <span class="title">{{ url.title || '（未命名）' }}</span>
        </span>
      </span>

      <!-- Replay must not record customer destinations: they can carry signed query credentials. -->
      <span class="url" data-sentry-block :title="url.original_url">{{ url.original_url }}</span>
      <span class="num">{{ formatNumber(url.click_count) }}</span>

      <span class="c-status">
        <BaseBadge :tone="badgeTone(url)">{{ statusLabel(url) }}</BaseBadge>
        <span v-if="url.expires_at" class="title">{{ formatTimestamp(url.expires_at) }} 到期</span>
      </span>

      <span class="c-actions">
        <button
          type="button"
          class="icon-btn"
          data-testid="row-copy"
          :aria-label="copiedId === url.id ? '已複製短網址' : '複製短網址'"
          :title="copiedId === url.id ? '已複製' : '複製'"
          @click="emit('copy', url)"
        >
          <svg v-if="copiedId === url.id" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
          <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="9" rx="1.4" />
            <path d="M3.5 10.5v-6a1.5 1.5 0 0 1 1.5-1.5h6" />
          </svg>
        </button>
        <router-link
          :to="`/analytics/${url.short_code}`"
          class="icon-btn"
          data-testid="row-analytics"
          aria-label="查看成效分析"
          title="成效分析"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path d="M2.5 13.5h11M4 11V7M7.5 11V4.5M11 11V8" />
          </svg>
        </router-link>
        <button
          type="button"
          class="icon-btn"
          data-testid="row-edit"
          aria-label="編輯"
          title="編輯"
          @click="emit('edit', url)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path d="M10.5 2.5 13.5 5.5 5 14H2v-3z" />
          </svg>
        </button>
        <button
          v-if="url.is_active"
          type="button"
          class="icon-btn"
          data-testid="row-archive"
          aria-label="封存"
          title="封存"
          @click="emit('archive', url)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <rect x="2" y="3" width="12" height="3" rx="1" />
            <path d="M3 6.5v6A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-6" />
            <path d="M6.5 9h3" />
          </svg>
        </button>
        <button
          v-else
          type="button"
          class="icon-btn"
          data-testid="row-restore"
          aria-label="還原"
          title="還原"
          @click="emit('restore', url)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path d="M3 8a5 5 0 1 1 1.6 3.7M3 8V4.5M3 8h3.5" />
          </svg>
        </button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dense, scannable URL table (Proposal F: `linkRepresentation: dense-table`).
 * Progressively degrades to stacked mobile cards via the `.row`
 * grid-template-areas media query already defined in assets/css/main.css -
 * no separate mobile markup is needed.
 *
 * Per the "no raw localhost display" requirement, the link is always *shown*
 * as `aka.money/<code>` regardless of `VITE_SHORT_DOMAIN`. The working href is
 * rebuilt from `short_code`, never from the API's `short_url`: the Admin API
 * formats that field without a base URL, so it is only the bare short code
 * (see `formatUrlResponse` in src/backend/src/services/url.ts).
 */
import type { UrlResponse } from '@/types';
import { formatNumber, formatTimestamp } from '@/utils/format';
import { SHORT_LINK_DISPLAY_HOST, shortLinkTarget } from '@/utils/shortLink';
import { getLinkStatus, type LinkStatus } from './dashboardUrlList';
import BaseBadge from '@/components/common/BaseBadge.vue';

defineProps<{
  urls: UrlResponse[];
  copiedId: string | null;
}>();

const emit = defineEmits<{
  copy: [url: UrlResponse];
  edit: [url: UrlResponse];
  archive: [url: UrlResponse];
  restore: [url: UrlResponse];
}>();

const displayHost = SHORT_LINK_DISPLAY_HOST;

const linkStatus = (url: UrlResponse): LinkStatus => getLinkStatus(url);

const statusLabel = (url: UrlResponse): string => {
  switch (linkStatus(url)) {
    case 'off':
      return '已封存';
    case 'exp':
      return '已過期';
    default:
      return '作用中';
  }
};

const badgeTone = (url: UrlResponse): 'on' | 'off' | 'exp' => linkStatus(url);
</script>
