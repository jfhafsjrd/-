<script setup>
/** 数字滚动动画 — 值变化时 rAF 从旧值缓动到新值 */
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  duration: { type: Number, default: 800 },
})
const display = ref(0)
let raf = 0

function animate(from, to) {
  cancelAnimationFrame(raf)
  const t0 = performance.now()
  const tick = (t) => {
    const p = Math.min((t - t0) / props.duration, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    display.value = Math.round(from + (to - from) * eased)
    if (p < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

watch(
  () => props.value,
  (v, old) => animate(old || 0, v || 0),
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span class="mono">{{ display.toLocaleString() }}</span>
</template>
