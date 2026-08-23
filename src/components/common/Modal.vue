<script setup>
/** 通用模态 — Teleport + 毛玻璃遮罩 + 缩放过渡 + ESC 关闭 */
import { onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '520px' },
})
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape' && props.show) emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-mask" @click.self="emit('close')">
        <div class="modal glass-card" :style="{ maxWidth: width }" role="dialog" :aria-label="title">
          <header class="modal-head">
            <h3>{{ title }}</h3>
            <button class="icon-btn" aria-label="关闭" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(5, 6, 10, 0.62);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.modal {
  width: 100%;
  max-height: min(84vh, 720px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 90px -20px rgba(0, 0, 0, 0.8), 0 0 60px -20px var(--accent-glow);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  font-size: 1.05rem;
  font-weight: 650;
}
.modal-body {
  padding: 18px 22px;
  overflow-y: auto;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--border);
}

.modal-enter-active {
  transition: opacity 0.22s ease;
}
.modal-enter-active .modal {
  transition: transform 0.26s var(--ease), opacity 0.26s;
}
.modal-leave-active {
  transition: opacity 0.16s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal {
  transform: scale(0.94) translateY(12px);
}
</style>
