<script setup>
/**
 * 页面三态壳 — loading(骨架) / error(重试) / empty(空态) / 正常内容
 * 用法：
 *   <StateShell :loading :error :empty="!list.length" @retry="load">
 *     <div>内容</div>
 *   </StateShell>
 */
defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  empty: { type: Boolean, default: false },
  emptyEmoji: { type: String, default: '🌌' },
  emptyText: { type: String, default: '这里还什么都没有' },
  emptySub: { type: String, default: '' },
  rows: { type: Number, default: 3 }, // 骨架行数
})
defineEmits(['retry'])
</script>

<template>
  <div v-if="loading" class="state-skeletons">
    <div v-for="i in rows" :key="i" class="skeleton" :style="{ height: `${64 + (i % 3) * 14}px` }"></div>
  </div>

  <div v-else-if="error" class="state-box glass-card">
    <span class="emoji">⚠️</span>
    <span class="msg">{{ error }}</span>
    <button class="btn sm" @click="$emit('retry')">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" />
      </svg>
      重试
    </button>
  </div>

  <div v-else-if="empty" class="state-box glass-card">
    <span class="emoji">{{ emptyEmoji }}</span>
    <span class="msg">{{ emptyText }}</span>
    <span v-if="emptySub" class="sub">{{ emptySub }}</span>
    <slot name="empty-action" />
  </div>

  <slot v-else />
</template>

<style scoped>
.state-skeletons {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
