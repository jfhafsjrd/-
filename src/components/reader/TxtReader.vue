<script setup>
/**
 * TXT 沉浸阅读器 — CSS 多栏分页（电子书式左右翻页）
 * 专业设置：字号/行距/字体/纸张·护眼·夜间主题 · 章节目录 · 键盘/触屏翻页 · 进度记忆
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import Modal from '@/components/common/Modal.vue'

const props = defineProps({ book: { type: Object, required: true } })
const emit = defineEmits(['close'])

/* ---------- 阅读设置（localStorage 持久） ---------- */
const LS = 'lifeos_reader_cfg'
const cfg = ref(Object.assign(
  { fontSize: 19, lineHeight: 1.9, family: 'sans', theme: 'paper' },
  JSON.parse(localStorage.getItem(LS) || '{}'),
))
watch(cfg, () => localStorage.setItem(LS, JSON.stringify(cfg.value)), { deep: true })

const THEMES = {
  paper: { bg: '#f5efe1', fg: '#3d3427', name: '纸张' },
  green: { bg: '#cde6d0', fg: '#2c3a30', name: '护眼' },
  dark: { bg: '#15171d', fg: '#b9bdc9', name: '夜间' },
}
const FAMILIES = {
  sans: { stack: 'var(--font)', name: '黑体' },
  serif: { stack: "Georgia, 'Songti SC', SimSun, serif", name: '宋体' },
  kai: { stack: "'Kaiti SC', KaiTi, STKaiti, serif", name: '楷体' },
}
const theme = computed(() => THEMES[cfg.value.theme] || THEMES.paper)

/* ---------- 数据 ---------- */
const chapters = ref([])
const chapterIdx = ref(0)
const chapterTitle = ref('')
const text = ref('')
const loading = ref(true)

const GAP = 56
const page = ref(0)
const pageCount = ref(1)
const viewW = ref(0)
const bodyEl = ref(null)
const barsVisible = ref(false)
const tocShow = ref(false)
const setShow = ref(false)

const progress = ref(props.book.progress || {})
let saveTimer = 0

async function loadChapter(i, keepPage = 0) {
  loading.value = true
  try {
    const r = await api.reader.text(props.book.id, i)
    chapterIdx.value = r.index
    chapterTitle.value = r.title
    text.value = r.text
    await nextTick()
    await nextTick()
    repaginate(keepPage)
  } finally {
    loading.value = false
  }
}

/* ---------- 分页：多栏内容总宽 → 页数 ---------- */
function repaginate(targetPage) {
  const el = bodyEl.value
  if (!el) return
  const w = el.clientWidth
  if (w <= 0) return
  viewW.value = w
  pageCount.value = Math.max(1, Math.round((el.scrollWidth + GAP) / (w + GAP)))
  page.value = Math.max(0, Math.min(targetPage ?? page.value, pageCount.value - 1))
}

function turn(dir) {
  const next = page.value + dir
  if (next < 0) {
    if (chapterIdx.value > 0) return loadChapter(chapterIdx.value - 1, 9999)
    return
  }
  if (next >= pageCount.value) {
    if (chapterIdx.value < chapters.value.length - 1) return loadChapter(chapterIdx.value + 1, 0)
    return
  }
  page.value = next
  scheduleSave()
}

const pct = computed(() => {
  if (!chapters.value.length) return 0
  const within = pageCount.value > 1 ? page.value / (pageCount.value - 1) : 0
  return Math.min(100, ((chapterIdx.value + within) / chapters.value.length) * 100)
})

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.reader.saveProgress(props.book.id, { chapter: chapterIdx.value, page: page.value }, pct.value).catch(() => {})
  }, 1500)
}

/* ---------- 交互 ---------- */
function onBodyClick(e) {
  const x = e.clientX / window.innerWidth
  if (x < 0.28) turn(-1)
  else if (x > 0.72) turn(1)
  else barsVisible.value = !barsVisible.value
}
function onKey(e) {
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1)
  else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); turn(1) }
  else if (e.key === 'Escape') { emit('close') }
}
let touchX = 0
let touchY = 0
function onTouchStart(e) {
  touchX = e.touches[0].clientX
  touchY = e.touches[0].clientY
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1)
}

const onResize = () => repaginate()
watch(() => [cfg.value.fontSize, cfg.value.lineHeight, cfg.value.family], async () => {
  await nextTick()
  await nextTick()
  repaginate()
})

/* ---------- 启动 ---------- */
onMounted(async () => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  try {
    chapters.value = await api.reader.chapters(props.book.id)
  } catch {
    chapters.value = [{ index: 0, title: '全文' }]
  }
  const start = Math.min(progress.value.chapter || 0, chapters.value.length - 1)
  await loadChapter(start, progress.value.page || 0)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  clearTimeout(saveTimer)
  api.reader.saveProgress(props.book.id, { chapter: chapterIdx.value, page: page.value }, pct.value).catch(() => {})
})

async function jumpChapter(i) {
  tocShow.value = false
  if (i !== chapterIdx.value) await loadChapter(i, 0)
}
</script>

<template>
  <div class="txt-reader" :style="{ background: theme.bg, color: theme.fg }">
    <!-- 顶栏 -->
    <header class="tr-bar tr-top" :class="{ show: barsVisible }">
      <button class="tr-btn" aria-label="返回书架" @click="emit('close')">← 书架</button>
      <div class="tr-titles">
        <strong>{{ book.title }}</strong>
        <span>{{ chapterTitle }}</span>
      </div>
      <div class="tr-actions">
        <button class="tr-btn" @click="tocShow = true">目录</button>
        <button class="tr-btn" @click="setShow = true">Aa</button>
      </div>
    </header>

    <!-- 正文：多栏横向分页 -->
    <main class="tr-main" @click="onBodyClick" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <div v-if="loading" class="tr-loading">正在翻到这一章…</div>
      <div
        v-else
        ref="bodyEl"
        class="tr-body"
        :style="{
          fontSize: cfg.fontSize + 'px',
          lineHeight: cfg.lineHeight,
          fontFamily: FAMILIES[cfg.family].stack,
          columnGap: GAP + 'px',
          transform: `translateX(-${page * (viewW + GAP)}px)`,
        }"
      >{{ text }}</div>
    </main>

    <!-- 底栏 -->
    <footer class="tr-bar tr-bottom" :class="{ show: barsVisible }">
      <button class="tr-btn" :disabled="chapterIdx <= 0" @click="jumpChapter(chapterIdx - 1)">上一章</button>
      <div class="tr-progress">
        <span class="mono">{{ chapterIdx + 1 }}/{{ chapters.length }} 章 · {{ page + 1 }}/{{ pageCount }} 页</span>
        <div class="tr-track"><i :style="{ width: pct + '%' }"></i></div>
      </div>
      <button class="tr-btn" :disabled="chapterIdx >= chapters.length - 1" @click="jumpChapter(chapterIdx + 1)">下一章</button>
    </footer>

    <!-- 章节目录 -->
    <Modal :show="tocShow" :title="`目录 · ${chapters.length} 章`" width="420px" @close="tocShow = false">
      <ul class="tr-toc">
        <li
          v-for="(c, i) in chapters"
          :key="i"
          :class="{ cur: i === chapterIdx }"
          @click="jumpChapter(i)"
        >{{ c.title }}</li>
      </ul>
    </Modal>

    <!-- 阅读设置 -->
    <Modal :show="setShow" title="阅读设置" width="380px" @close="setShow = false">
      <div class="tr-set">
        <label class="ts-row">
          <span>字号</span>
          <input v-model.number="cfg.fontSize" type="range" min="14" max="30" step="1" />
          <b class="mono">{{ cfg.fontSize }}</b>
        </label>
        <label class="ts-row">
          <span>行距</span>
          <input v-model.number="cfg.lineHeight" type="range" min="1.4" max="2.6" step="0.1" />
          <b class="mono">{{ cfg.lineHeight.toFixed(1) }}</b>
        </label>
        <div class="ts-row">
          <span>字体</span>
          <div class="ts-chips">
            <button v-for="(f, k) in FAMILIES" :key="k" class="chip" :class="{ on: cfg.family === k }" @click="cfg.family = k">{{ f.name }}</button>
          </div>
        </div>
        <div class="ts-row">
          <span>背景</span>
          <div class="ts-chips">
            <button
              v-for="(t, k) in THEMES" :key="k" class="chip theme-chip"
              :class="{ on: cfg.theme === k }" :style="{ background: t.bg, color: t.fg }"
              @click="cfg.theme = k"
            >{{ t.name }}</button>
          </div>
        </div>
        <p class="ts-tip">点击屏幕左右两侧翻页，中间呼出菜单；支持 ← → 键与左右滑动</p>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.txt-reader { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; transition: background 0.3s; }

.tr-main { flex: 1; overflow: hidden; position: relative; padding: 34px 30px; cursor: pointer; user-select: none; }
.tr-body {
  height: 100%;
  column-fill: auto;
  white-space: pre-wrap;
  word-break: break-word;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  text-align: justify;
}
.tr-loading { height: 100%; display: grid; place-items: center; opacity: 0.5; font-size: 0.9rem; }

.tr-bar { position: absolute; left: 0; right: 0; z-index: 5; display: flex; align-items: center; gap: 14px;
  padding: 10px 18px; background: rgba(0, 0, 0, 0.55); color: #fff; backdrop-filter: blur(14px);
  opacity: 0; pointer-events: none; transition: opacity 0.25s, transform 0.25s; }
.tr-bar.show { opacity: 1; pointer-events: auto; }
.tr-top { top: 0; transform: translateY(-100%); }
.tr-top.show { transform: translateY(0); }
.tr-bottom { bottom: 0; transform: translateY(100%); justify-content: space-between; }
.tr-bottom.show { transform: translateY(0); }

.tr-btn { background: rgba(255, 255, 255, 0.1); color: #fff; border: none; border-radius: 8px;
  padding: 7px 14px; font-size: 0.82rem; cursor: pointer; transition: background 0.15s; }
.tr-btn:hover { background: rgba(255, 255, 255, 0.2); }
.tr-btn:disabled { opacity: 0.35; cursor: default; }
.tr-titles { flex: 1; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.tr-titles strong { font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-titles span { font-size: 0.76rem; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-actions { display: flex; gap: 8px; }
.tr-progress { flex: 1; display: flex; align-items: center; gap: 12px; font-size: 0.72rem; opacity: 0.85; }
.tr-track { flex: 1; max-width: 320px; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.2); overflow: hidden; }
.tr-track i { display: block; height: 100%; background: linear-gradient(90deg, #a855f7, #6366f1); }

.tr-toc { list-style: none; max-height: 56vh; overflow-y: auto; display: grid; gap: 2px; }
.tr-toc li { padding: 9px 12px; border-radius: 8px; font-size: 0.86rem; cursor: pointer; color: var(--text-2); }
.tr-toc li:hover { background: var(--accent-soft); color: var(--text-1); }
.tr-toc li.cur { background: var(--accent-soft); color: var(--t-accent); font-weight: 600; }

.tr-set { display: grid; gap: 18px; }
.ts-row { display: flex; align-items: center; gap: 12px; font-size: 0.86rem; color: var(--text-2); }
.ts-row > span { width: 42px; flex-shrink: 0; }
.ts-row input[type='range'] { flex: 1; accent-color: var(--accent); }
.ts-row b { width: 36px; text-align: right; font-size: 0.8rem; }
.ts-chips { display: flex; gap: 6px; flex: 1; flex-wrap: wrap; }
.ts-chips .chip { border: 1px solid var(--border); background: transparent; color: var(--text-2);
  padding: 5px 13px; border-radius: 99px; font-size: 0.78rem; cursor: pointer; }
.ts-chips .chip.on { background: var(--accent-soft); color: var(--t-accent); border-color: var(--border-strong); }
.theme-chip { border: 2px solid transparent; }
.theme-chip.on { border-color: var(--accent); }
.ts-tip { font-size: 0.72rem; color: var(--text-3); line-height: 1.7; }
</style>
