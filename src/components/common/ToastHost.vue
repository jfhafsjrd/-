<script setup>
/** Toast 渲染容器 — 挂在 App 根部 */
import { useToast } from '@/composables/useToast'

const toast = useToast()
const ICONS = { success: '✓', error: '✕', info: 'ℹ' }
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="t in toast.list.value" :key="t.id" class="toast" :class="t.type">
          <span class="t-icon">{{ ICONS[t.type] }}</span>
          <span class="t-msg">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 18px;
  border-radius: 12px;
  background: var(--card-solid);
  color: var(--text-1);
  backdrop-filter: blur(14px);
  border: 1px solid var(--border);
  box-shadow: 0 12px 40px -12px rgba(0, 0, 0, 0.7);
  font-size: 0.88rem;
  max-width: min(360px, 86vw);
}
.t-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 99px;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
}
.toast.success {
  border-color: rgba(52, 211, 153, 0.35);
}
.toast.success .t-icon {
  background: var(--success-soft);
  color: var(--success);
}
.toast.error {
  border-color: rgba(248, 113, 113, 0.35);
}
.toast.error .t-icon {
  background: var(--danger-soft);
  color: var(--danger);
}
.toast.info .t-icon {
  background: var(--accent-soft);
  color: var(--accent);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s var(--ease);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
