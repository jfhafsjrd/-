<script setup>
/**
 * 漫画沉浸阅读器 — Mihon/Tachiyomi 式阅读模式
 * 单页 / 双页(跨页) / 条漫(连续竖滚) + 翻页方向 LTR/RTL(日漫) + 适宽适高 + 预加载 + 进度记忆
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'

const props = defineProps({ book: { type: Object, required: true } })
const emit = defineEmits(['close'])

const LSC = 'lifeos_comic_cfg'
const cfg = ref(Object.assign(
  { fit: 'height', dir: 'ltr', mode: 'single' },
  JSON.parse(localStorage.getItem(LSC) || '{}'),
))
watchCfg()
function watchCfg() {
  // 深度持久化（不用 watch 以省依赖，手动调用）
}
function persist() {
  localStorage.setItem(LSC, JSON.stringify(cfg.value))
}

const total = computed(() => props.book.pages || 1)
const page = ref(Math.min(props.book.progress?.page || 0, total.value - 1))
const barsVisible = ref(false)
const loading = ref(true)
const preload = ref([])
const scrollEl = ref(null)
const pageEls = ref([])

const isWebtoon = computed(() => cfg.value.mode === 'webtoon')
const step = computed(() => (cfg.value.mode === 'double' ? 2 : 1))
/** 双页模式的展示页码文案 */
const pageLabel = computed(() => {
  if (cfg.value.mode === 'double') {
    const a = page.value + 1
    const b = Math.min(page.value + 2, total.value)
    return a === b ? `${a}` : `${a}-${b}`
  }
  return `${page.value + 1}`
})

/** 翻页：dir=1 下一屏。RTL 时视觉方向相反（下一页在左边） */
function turn(d) {
  if (isWebtoon.value) return
  const next = page.value + d * step.value
  if (next < 0 || next >= total.value) return
  page.value = next
  loading.value = true
  scheduleSave()
  warm()
}

/* 预加载后两屏，翻页零等待 */
function warm() {
  preload.value = [1, 2]
    .map((d) => page.value + d * step.value)
    .filter((n) => n < total.value)
    .map((n) => {
      const img = new Image()
      img.src = api.reader.pageUrl(props.book.id, n)
      return img
    })
}

function onBodyClick(e) {
  if (isWebtoon.value) {
    barsVisible.value = !barsVisible.value
    return
  }
  if (cfg.value.dir === 'rtl') {
    /* 日漫：右侧是下一页 */
    if (e.clientX / window.innerWidth > 0.72) turn(-1)
    else if (e.clientX / window.innerWidth < 0.28) turn(1)
    else barsVisible.value = !barsVisible.value
  } else {
    if (e.clientX / window.innerWidth < 0.28) turn(-1)
    else if (e.clientX / window.innerWidth > 0.72) turn(1)
    else barsVisible.value = !barsVisible.value
  }
}
function onKey(e) {
  if (e.key === 'Escape') return emit('close')
  if (isWebtoon.value) return
  const fwd = cfg.value.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const back = cfg.value.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  if (e.key === back || e.key === 'PageUp') turn(-1)
  else if (e.key === fwd || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); turn(1) }
}
let touchX = 0
let touchY = 0
function onTouchStart(e) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY }
function onTouchEnd(e) {
  if (isWebtoon.value) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const forward = cfg.value.dir === 'rtl' ? dx > 0 : dx < 0
    turn(forward ? 1 : -1)
  }
}

/* ---------- 条漫模式：滚动追进度 ---------- */
let scrollTimer = 0
function onWebtoonScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const el = scrollEl.value
    if (!el) return
    /* 找到视口中线所在页 */
    const mid = el.scrollTop + el.clientHeight / 2
    let best = 0
    for (let i = 0; i < pageEls.value.length; i++) {
      const p = pageEls.value[i]
      if (!p) continue
      if (p.offsetTop <= mid) best = i
    }
    if (best !== page.value) {
      page.value = best
      scheduleSave()
    }
  }, 200)
}
function jumpPage(n) {
  if (isWebtoon.value) {
    const el = pageEls.value[n]
    if (el) scrollEl.value.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
    return
  }
  page.value = Math.max(0, Math.min(n, total.value - 1))
  loading.value = true
  warm()
}

const pct = computed(() => (total.value > 1 ? (page.value / (total.value - 1)) * 100 : 100))

let saveTimer = 0
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.reader.saveProgress(props.book.id, { page: page.value }, pct.value).catch(() => {})
  }, 1500)
}

function cycleMode() {
  cfg.value.mode = cfg.value.mode === 'single' ? 'double' : cfg.value.mode === 'double' ? 'webtoon' : 'single'
  persist()
  if (isWebtoon.value) {
    /* 进入条漫模式后滚到当前页 */
    requestAnimationFrame(() => jumpPage(page.value))
  }
}
function toggleDir() {
  cfg.value.dir = cfg.value.dir === 'ltr' ? 'rtl' : 'ltr'
  persist()
}
function toggleFit() {
  cfg.value.fit = cfg.value.fit === 'height' ? 'width' : 'height'
  persist()
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
  warm()
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
  clearTimeout(saveTimer)
  clearTimeout(scrollTimer)
  api.reader.saveProgress(props.book.id, { page: page.value }, pct.value).catch(() => {})
})
</script>

<template>
  <div class="cc-reader">
    <header class="cc-bar cc-top" :class="{ show: barsVisible }">
      <button class="tr-btn" @click="emit('close')">← 书架</button>
      <div class="cc-titles">
        <strong>{{ book.title }}</strong>
      </div>
      <div class="cc-actions">
        <button class="tr-btn" @click="cycleMode">{{ { single: '单页', double: '双页', webtoon: '条漫' }[cfg.mode] }}</button>
        <button v-if="!isWebtoon" class="tr-btn" @click="toggleDir">{{ cfg.dir === 'ltr' ? '→ LTR' : '← RTL' }}</button>
        <button v-if="!isWebtoon" class="tr-btn" @click="toggleFit">{{ cfg.fit === 'height' ? '适高' : '适宽' }}</button>
      </div>
    </header>

    <!-- 条漫：连续竖向滚动 -->
    <main
      v-if="isWebtoon"
      ref="scrollEl"
      class="cc-webtoon"
      @click="onBodyClick"
    >
      <img
        v-for="n in total"
        :key="n"
        :ref="(el) => (pageEls[n - 1] = el)"
        :src="api.reader.pageUrl(book.id, n - 1)"
        :alt="`第 ${n} 页`"
        loading="lazy"
        width="800"
      />
      <div class="cc-wt-space"></div>
    </main>

    <!-- 单页 / 双页 -->
    <main
      v-else
      class="cc-main"
      :class="[cfg.fit, { double: cfg.mode === 'double' }]"
      @click="onBodyClick"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <img
        :key="page"
        :src="api.reader.pageUrl(book.id, page)"
        :alt="`第 ${page + 1} 页`"
        @load="loading = false"
        @error="loading = false"
      />
      <img
        v-if="cfg.mode === 'double' && page + 1 < total"
        :key="page + 1"
        :src="api.reader.pageUrl(book.id, page + 1)"
        :alt="`第 ${page + 2} 页`"
        @load="loading = false"
        @error="loading = false"
      />
      <div v-if="loading" class="cc-loading">加载中…</div>
      <!-- RTL 视觉提示 -->
      <span class="cc-arrow left" :class="{ dim: cfg.dir === 'rtl' ? page <= 0 : page >= total - 1 }">{{ cfg.dir === 'rtl' ? '❯' : '❮' }}</span>
      <span class="cc-arrow right" :class="{ dim: cfg.dir === 'rtl' ? page >= total - 1 : page <= 0 }">{{ cfg.dir === 'rtl' ? '❮' : '❯' }}</span>
    </main>

    <footer class="cc-bar cc-bottom" :class="{ show: barsVisible }">
      <button class="tr-btn" :disabled="isWebtoon ? page <= 0 : page <= 0" @click="turn(-1)">上一{{ isWebtoon ? '页' : step === 2 ? '屏' : '页' }}</button>
      <div class="cc-progress">
        <span class="mono">{{ pageLabel }} / {{ total }}</span>
        <input
          class="cc-slider"
          type="range"
          min="0"
          :max="total - 1"
          :value="page"
          @input="jumpPage(Number($event.target.value))"
        />
      </div>
      <button class="tr-btn" :disabled="page >= total - 1" @click="turn(1)">下一{{ isWebtoon ? '页' : step === 2 ? '屏' : '页' }}</button>
    </footer>
  </div>
</template>

<style scoped>
.cc-reader { position: fixed; inset: 0; z-index: 150; background: #0b0c11; display: flex; flex-direction: column; }

/* 单页/双页画布 */
.cc-main { flex: 1; position: relative; overflow: auto; display: grid; place-items: center; cursor: pointer; grid-auto-flow: column; }
.cc-main.height img { max-height: 100vh; max-width: 50vw; object-fit: contain; }
.cc-main.width img { width: 100%; height: auto; }
.cc-main.double { gap: 2px; }
.cc-main.double.height img { max-height: 100vh; max-width: 49.5vw; }
.cc-loading { position: absolute; color: rgba(255, 255, 255, 0.5); font-size: 0.85rem; letter-spacing: 0.2em; }
.cc-arrow {
  position: absolute; top: 50%; transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.35); font-size: 2rem; padding: 20px 10px; user-select: none;
  transition: opacity 0.2s;
}
.cc-arrow.left { left: 6px; }
.cc-arrow.right { right: 6px; }
.cc-arrow.dim { opacity: 0.12; }

/* 条漫 */
.cc-webtoon { flex: 1; overflow-y: auto; cursor: pointer; display: flex; flex-direction: column; align-items: center; }
.cc-webtoon img { width: min(100%, 860px); height: auto; display: block; }
.cc-wt-space { height: 30vh; }

.cc-bar { position: absolute; left: 0; right: 0; z-index: 5; display: flex; align-items: center; gap: 14px;
  padding: 10px 18px; background: rgba(0, 0, 0, 0.6); color: #fff; backdrop-filter: blur(14px);
  opacity: 0; pointer-events: none; transition: opacity 0.25s, transform 0.25s; }
.cc-bar.show { opacity: 1; pointer-events: auto; }
.cc-top { top: 0; transform: translateY(-100%); }
.cc-top.show { transform: translateY(0); }
.cc-bottom { bottom: 0; transform: translateY(100%); justify-content: space-between; }
.cc-bottom.show { transform: translateY(0); }
.cc-titles { flex: 1; min-width: 0; }
.cc-titles strong { font-size: 0.92rem; }
.cc-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-progress { flex: 1; display: flex; align-items: center; gap: 12px; font-size: 0.76rem; opacity: 0.9; }
.cc-slider { flex: 1; max-width: 300px; accent-color: #a855f7; }

.tr-btn { background: rgba(255, 255, 255, 0.1); color: #fff; border: none; border-radius: 8px;
  padding: 7px 14px; font-size: 0.82rem; cursor: pointer; }
.tr-btn:hover { background: rgba(255, 255, 255, 0.2); }
.tr-btn:disabled { opacity: 0.35; cursor: default; }
</style>
