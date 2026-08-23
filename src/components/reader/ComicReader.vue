<script setup>
/**
 * 漫画沉浸阅读器 — 逐页浏览 · 适宽/适高切换 · 预加载 · 进度记忆
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'

const props = defineProps({ book: { type: Object, required: true } })
const emit = defineEmits(['close'])

const page = ref(props.book.progress?.page || 0)
const total = computed(() => props.book.pages || 1)
const fit = ref(localStorage.getItem('lifeos_comic_fit') || 'height') // height | width
const barsVisible = ref(false)
const loading = ref(true)
const preload = ref([])

function turn(dir) {
  const next = page.value + dir
  if (next < 0 || next >= total.value) return
  page.value = next
  loading.value = true
  scheduleSave()
  warm()
}

/* 预加载后两页，翻页零等待 */
function warm() {
  preload.value = [1, 2]
    .map((d) => page.value + d)
    .filter((n) => n < total.value)
    .map((n) => {
      const img = new Image()
      img.src = api.reader.pageUrl(props.book.id, n)
      return img
    })
}

function onBodyClick(e) {
  const x = e.clientX / window.innerWidth
  if (x < 0.28) turn(-1)
  else if (x > 0.72) turn(1)
  else barsVisible.value = !barsVisible.value
}
function onKey(e) {
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1)
  else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); turn(1) }
  else if (e.key === 'Escape') emit('close')
}
let touchX = 0
let touchY = 0
function onTouchStart(e) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY }
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1)
}

const pct = computed(() => (total.value > 1 ? (page.value / (total.value - 1)) * 100 : 100))

let saveTimer = 0
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.reader.saveProgress(props.book.id, { page: page.value }, pct.value).catch(() => {})
  }, 1500)
}

function toggleFit() {
  fit.value = fit.value === 'height' ? 'width' : 'height'
  localStorage.setItem('lifeos_comic_fit', fit.value)
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
        <button class="tr-btn" @click="toggleFit">{{ fit === 'height' ? '适高' : '适宽' }}</button>
      </div>
    </header>

    <main class="cc-main" :class="fit" @click="onBodyClick" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <img
        :key="page"
        :src="api.reader.pageUrl(book.id, page)"
        :alt="`第 ${page + 1} 页`"
        @load="loading = false"
        @error="loading = false"
      />
      <div v-if="loading" class="cc-loading">加载中…</div>
    </main>

    <footer class="cc-bar cc-bottom" :class="{ show: barsVisible }">
      <button class="tr-btn" :disabled="page <= 0" @click="turn(-1)">上一页</button>
      <div class="cc-progress">
        <span class="mono">{{ page + 1 }} / {{ total }}</span>
        <div class="cc-track"><i :style="{ width: pct + '%' }"></i></div>
      </div>
      <button class="tr-btn" :disabled="page >= total - 1" @click="turn(1)">下一页</button>
    </footer>
  </div>
</template>

<style scoped>
.cc-reader { position: fixed; inset: 0; z-index: 150; background: #0b0c11; display: flex; flex-direction: column; }
.cc-main { flex: 1; position: relative; overflow: auto; display: grid; place-items: center; cursor: pointer; }
.cc-main.height img { max-height: 100vh; max-width: 100vw; object-fit: contain; }
.cc-main.width img { width: 100%; height: auto; }
.cc-loading { position: absolute; color: rgba(255, 255, 255, 0.5); font-size: 0.85rem; letter-spacing: 0.2em; }

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
.cc-actions { display: flex; gap: 8px; }
.cc-progress { flex: 1; display: flex; align-items: center; gap: 12px; font-size: 0.76rem; opacity: 0.85; }
.cc-track { flex: 1; max-width: 320px; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.2); overflow: hidden; }
.cc-track i { display: block; height: 100%; background: linear-gradient(90deg, #a855f7, #6366f1); }

.tr-btn { background: rgba(255, 255, 255, 0.1); color: #fff; border: none; border-radius: 8px;
  padding: 7px 14px; font-size: 0.82rem; cursor: pointer; }
.tr-btn:hover { background: rgba(255, 255, 255, 0.2); }
.tr-btn:disabled { opacity: 0.35; cursor: default; }
</style>
