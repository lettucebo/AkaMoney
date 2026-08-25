<template>
  <main class="not-found-view">
    <section>
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <path d="M8 16h80v38H8z" /><path d="M20 16V8h56v8M30 34h.01M66 34h.01" /><path d="M34 46h28" />
      </svg>
      <div class="not-found-code">4<span>0</span>4</div>
      <h1>找不到這個頁面</h1>
      <p>這個短代碼可能已被封存、已過期，或從未存在。請確認連結是否正確。</p>
      <router-link to="/dashboard">回到連結列表</router-link>
    </section>
  </main>
</template>

<script setup lang="ts"></script>

<style scoped>
.not-found-view { display: grid; min-height: min(560px, calc(100vh - 96px)); place-items: center; padding: 24px 0; text-align: center; }
.not-found-view section { max-width: 390px; min-width: 0; }
svg { width: 96px; fill: none; stroke: var(--color-accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.not-found-code { color: var(--color-text); font-family: var(--font-display); font-size: clamp(72px, 16vw, 118px); font-weight: 700; line-height: .9; letter-spacing: -.08em; }
.not-found-code span { color: var(--color-accent); }
h1 { margin-top: 15px; font-size: 22px; }
p { margin: 9px 0 22px; color: var(--color-muted); font-size: 13px; line-height: 1.7; }
a { display: inline-flex; padding: 8px 12px; border-radius: var(--radius-md); background: var(--color-accent); color: var(--color-accent-fg); font-size: 13px; font-weight: 600; }
</style>
