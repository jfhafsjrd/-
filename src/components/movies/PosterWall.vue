<script setup>
/**
 * 无缝循环海报墙 — rAF + translateX + GPU 加速
 * v1/v2 的坑位修复：
 *   - 图片 Promise.allSettled 预加载完成后才启动滚动（杜绝首屏挤压/闪烁）
 *   - 数据复制两份，回绕以整段宽度为单位（真正无缝）
 *   - 悬停减速、标签页隐藏暂停、reduced-motion 静态展示
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { tmdbPoster } from '@/api'
const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ tmdbId, title, poster, ... }]
})
const emit = defineEmits(['pick'])

const track = ref(null)
const loadedCount = ref(0)
const imgFailed = ref(false)

let raf = 0
let offset = 0
let speed = 0.42 // px / frame @60fps
let halfWidth = 0
let last = 0
let running = false

/** 环境为每张图生成代理 URL；失败时 onerror 换渐变占位由 CSS 处理 */
function posterUrl(path) {
  return tmdbPoster(path, 'w342')
}

async function preload() {
  if (!props.items.length) return
  const imgs = props.items.map((m) => m.poster).filter(Boolean)
  await Promise.allSettled(
    imgs.map(
      (p) =>
        new Promise((resolve) => {
          const im = new Image()
          im.onload = () => {
            loadedCount.value++
            resolve()
          }
          im.onerror = () => {
            resolve()
          }
          im.src = posterUrl(p)
        }),
    ),
  )
}

function measure() {
  const el = track.value
  if (!el) return
  halfWidth = el.scrollWidth / 2
}

function loop(t) {
  raf = requestAnimationFrame(loop)
  if (!last) last = t
  const dt = Math.min(t - last, 50)
  last = t
  if (!halfWidth) measure()
  if (!halfWidth) return
  offset -= (speed * dt) / 16.7
  if (-offset >= halfWidth) offset += halfWidth
  track.value.style.transform = `translate3d(${offset.toFixed(2)}px,0,0)`
}

function setRunning(v) {
  if (running === v) return
  running = v
  cancelAnimationFrame(raf)
  last = 0
  if (running && halfWidth) raf = requestAnimationFrame(loop)
}

function onEnter() {
  speed = 0.08
}
function onLeave() {
  speed = 0.42
}

onMounted(start)
onBeforeUnmount(() => {
  setRunning(false)
  cancelAnimationFrame(raf)
})

/** 数据异步到达时（重）启动：items 在挂载后才填充是常态 */
watch(
  () => props.items,
  (v) => {
    if (v?.length) start()
  },
)

/** 预加载 → 量宽 → 启动（幂等：已启动则只重置尺寸） */
async function start() {
  if (!props.items.length) return
  setRunning(false)
  offset = 0
  halfWidth = 0
  await preload()
  requestAnimationFrame(() => {
    measure()
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRunning(true)
      document.addEventListener('visibilitychange', () => setRunning(!document.hidden))
    }
  })
}
</script>

<template>
  <section class="wall-zone" @mouseenter="onEnter" @mouseleave="onLeave" aria-label="热门海报墙">
    <div class="wall-head">
      <h2 class="wall-title">🔥 本周趋势</h2>
      <span class="text-3 wall-sub">点击海报加入待看 · 悬停减速</span>
    </div>

    <div v-if="!items.length" class="wall-skeleton">
      <div v-for="i in 8" :key="i" class="skeleton wall-sk-card"></div>
    </div>

    <div v-else class="wall-viewport">
      <div ref="track" class="wall-track" :style="{ willChange: 'transform' }">
        <div v-for="(m, i) in [...items, ...items]" :key="`${m.tmdbId}-${i}`" class="wall-card" @click="emit('pick', m)">
          <img :src="posterUrl(m.poster)" :alt="m.title" loading="lazy" draggable="false" />
          <div class="wall-veil">
            <strong class="wall-name">{{ m.title }}</strong>
            <span class="wall-meta">
              <i class="tag">{{ m.typeLabel }}</i>
              <b class="mono">{{ m.year }}</b>
            </span>
          </div>
        </div>
      </div>
      <div class="wall-fade left"></div>
      <div class="wall-fade right"></div>
    </div>
  </section>
</template>

<style scoped>
.wall-zone {
  margin-bottom: 26px;
}
.wall-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.wall-title {
  font-size: 1.02rem;
  font-weight: 650;
  letter-spacing: 0.02em;
}
.wall-sub {
  font-size: 0.76rem;
}

.wall-skeleton {
  display: flex;
  gap: 14px;
  overflow: hidden;
}
.wall-sk-card {
  flex: 0 0 148px;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
}

.wall-viewport {
  overflow: hidden;
  position: relative;
  border-radius: var(--radius);
}
.wall-track {
  display: flex;
  gap: 14px;
  width: max-content;
  padding: 4px 0 8px;
}
.wall-card {
  position: relative;
  flex: 0 0 148px;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: linear-gradient(160deg, #23203a, #141625);
  border: 1px solid var(--border);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur), border-color var(--dur);
}
.wall-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  transition: transform var(--dur) var(--ease);
}
.wall-card:hover {
  transform: translateY(-6px) scale(1.04);
  border-color: var(--border-strong);
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.7), 0 0 30px -6px var(--accent-glow);
  z-index: 2;
}
.wall-card:hover img {
  transform: scale(1.06);
}
.wall-veil {
  position: absolute;
  inset: auto 0 0 0;
  padding: 26px 10px 9px;
  background: linear-gradient(transparent, rgba(8, 9, 14, 0.92));
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.wall-name {
  font-size: 0.82rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wall-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.wall-meta .tag {
  font-size: 0.64rem;
  padding: 1px 7px;
}
.wall-meta b {
  font-weight: 500;
  font-size: 0.68rem;
  color: var(--text-3);
}
.wall-fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 70px;
  pointer-events: none;
  z-index: 3;
}
.wall-fade.left {
  left: 0;
  background: linear-gradient(90deg, rgba(10, 11, 16, 0.9), transparent);
}
.wall-fade.right {
  right: 0;
  background: linear-gradient(-90deg, rgba(10, 11, 16, 0.9), transparent);
}

@media (max-width: 640px) {
  .wall-card {
    flex-basis: 118px;
  }
  .wall-fade {
    width: 44px;
  }
}
</style>
