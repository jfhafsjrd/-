<script setup>
/**
 * 斜向滚动海报背景带 — 影视页 hero 装饰
 * 两排反向滚动的倾斜海报（-7°），上下渐变遮罩压暗保持前景可读性。
 * 纯装饰不拦截交互；图片预加载后才启动动画；reduced-motion 静态。
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { tmdbPoster } from '@/api'

const props = defineProps({
  items: { type: Array, default: () => [] },
})

const rowA = ref(null)
const rowB = ref(null)
let raf = 0
let running = false
let halfA = 0
let halfB = 0
let offsetA = 0
let offsetB = 0
let last = 0

function measure() {
  if (rowA.value) halfA = rowA.value.scrollWidth / 2
  if (rowB.value) halfB = rowB.value.scrollWidth / 2
}

function loop(t) {
  raf = requestAnimationFrame(loop)
  if (!last) last = t
  const dt = Math.min(t - last, 50)
  last = t
  if (!halfA) measure()
  offsetA -= (0.5 * dt) / 16.7
  offsetB += (0.32 * dt) / 16.7
  if (-offsetA >= halfA) offsetA += halfA
  if (offsetB >= halfB) offsetB -= halfB
  if (rowA.value) rowA.value.style.transform = `translate3d(${offsetA.toFixed(1)}px,0,0)`
  if (rowB.value) rowB.value.style.transform = `translate3d(${offsetB.toFixed(1)}px,0,0)`
}

async function preload(list) {
  await Promise.allSettled(
    list.slice(0, 14).map(
      (p) =>
        new Promise((resolve) => {
          const im = new Image()
          im.onload = im.onerror = resolve
          im.src = tmdbPoster(p, 'w185')
        }),
    ),
  )
}

function setRunning(v) {
  if (running === v) return
  running = v
  cancelAnimationFrame(raf)
  last = 0
  if (running) raf = requestAnimationFrame(loop)
}

onMounted(start)
onBeforeUnmount(() => {
  setRunning(false)
  cancelAnimationFrame(raf)
})

/** 数据异步到达时（重）启动 */
watch(
  () => props.items,
  (v) => {
    if (v?.length) start()
  },
)

async function start() {
  if (!props.items.length) return
  setRunning(false)
  offsetA = 0
  offsetB = 0
  halfA = 0
  halfB = 0
  await preload(props.items.map((m) => m.poster || m.cover))
  requestAnimationFrame(() => {
    measure()
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRunning(true)
      document.addEventListener('visibilitychange', () => setRunning(!document.hidden))
    }
  })
}

const posterUrl = (p) => tmdbPoster(p, 'w185')
</script>

<template>
  <section v-if="items.length" class="hero-wall" aria-hidden="true">
    <div class="hw-strip">
      <div ref="rowA" class="hw-row">
        <div v-for="(m, i) in [...items, ...items]" :key="'a' + i" class="hw-card">
          <img :src="posterUrl(m.poster || m.cover)" :alt="''" loading="lazy" draggable="false" />
        </div>
      </div>
      <div ref="rowB" class="hw-row hw-row-b">
        <div v-for="(m, i) in [...items.slice().reverse(), ...items.slice().reverse()]" :key="'b' + i" class="hw-card">
          <img :src="posterUrl(m.poster || m.cover)" :alt="''" loading="lazy" draggable="false" />
        </div>
      </div>
    </div>
    <div class="hw-veil"></div>
  </section>
</template>

<style scoped>
.hero-wall {
  position: absolute;
  inset: -70px -60px auto -60px;
  height: 320px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 12%, #000 78%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 12%, #000 78%, transparent 100%);
}
.hw-strip {
  position: absolute;
  inset: 0;
  transform: rotate(-7deg) scale(1.18);
}
.hw-row {
  display: flex;
  gap: 10px;
  width: max-content;
  padding: 6px 0;
  will-change: transform;
}
.hw-row-b {
  margin-top: 4px;
}
.hw-card {
  flex: 0 0 104px;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  opacity: 0.34;
  filter: saturate(0.75) brightness(0.72);
}
.hw-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hw-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(var(--scrim), 0.92) 0%, rgba(var(--scrim), 0.35) 28%, rgba(var(--scrim), 0.35) 72%, rgba(var(--scrim), 0.92) 100%),
    linear-gradient(180deg, rgba(var(--scrim), 0.5), rgba(var(--scrim), 0.2) 45%, rgba(var(--scrim), 0.85));
}
</style>
