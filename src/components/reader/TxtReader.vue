<script setup>
/**
 * TXT 沉浸阅读器 — CSS 多栏分页（电子书式左右翻页）
 * 专业能力：中文排版(首行缩进/段距) · 章节目录 + 全文搜索 · 书签 · 自动翻页
 *           字号/行距/字体 · 纸张/护眼/夜间主题 · 键盘/触屏/点区翻页 · 进度记忆
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import Modal from '@/components/common/Modal.vue'

const props = defineProps({ book: { type: Object, required: true } })
const emit = defineEmits(['close'])

/* ---------- 阅读设置（localStorage 持久） ---------- */
const LS = 'lifeos_reader_cfg'
const cfg = ref(Object.assign(
  { fontSize: 19, lineHeight: 1.9, family: 'sans', theme: 'paper', autoSec: 8, mode: 'paged' },
  JSON.parse(localStorage.getItem(LS) || '{}'),
))
watch(cfg, () => localStorage.setItem(LS, JSON.stringify(cfg.value)), { deep: true })

/** 阅读模式：paged 电子书分栏左右翻 / scroll 上下滚动（微信读书式） */
const isScroll = computed(() => cfg.value.mode === 'scroll')
function toggleMode() {
  cfg.value.mode = isScroll.value ? 'paged' : 'scroll'
  if (isScroll.value) {
    nextTick(() => scrollEl.value?.scrollTo({ top: 0 }))
  } else {
    nextTick(() => nextTick(() => repaginate(page.value)))
  }
}

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
const bookmarks = ref([])
const chapterIdx = ref(0)
const chapterTitle = ref('')
const text = ref('')
const loading = ref(true)

const GAP = 56
const page = ref(0)
const pageCount = ref(1)
const viewW = ref(0)
const bodyEl = ref(null)
const scrollEl = ref(null)
const scrollWithin = ref(0) // 滚动模式：本章内滚动进度 0~1
const barsVisible = ref(false)
const tocShow = ref(false)
const setShow = ref(false)

/** 正文样式：翻页模式多栏+位移；滚动模式限宽居中自然流 */
const bodyStyle = computed(() => {
  const base = {
    fontSize: cfg.value.fontSize + 'px',
    lineHeight: cfg.value.lineHeight,
    fontFamily: FAMILIES[cfg.value.family].stack,
  }
  if (isScroll.value) return { ...base, maxWidth: '720px', margin: '0 auto' }
  return { ...base, columnGap: GAP + 'px', transform: `translateX(-${page.value * (viewW.value + GAP)}px)` }
})

const progress = ref(props.book.progress || {})
let saveTimer = 0

/** 正文 → 段落数组（中文排版：空行分段、首行缩进由 CSS 负责） */
const paragraphs = computed(() => text.value.split('\n').map((t) => t.trim()).filter(Boolean))

async function loadChapter(i, keepPage = 0) {
  loading.value = true
  try {
    const r = await api.reader.text(props.book.id, i)
    chapterIdx.value = r.index
    chapterTitle.value = r.title
    text.value = r.text
    await nextTick()
    await nextTick()
    if (isScroll.value) {
      scrollWithin.value = 0
      scrollEl.value?.scrollTo({ top: 0 })
    } else {
      repaginate(keepPage)
    }
  } finally {
    loading.value = false
  }
}

/* ---------- 分页：多栏内容总宽 → 页数 ---------- */
function repaginate(targetPage) {
  const el = bodyEl.value
  if (!el || isScroll.value) return
  const w = el.clientWidth
  if (w <= 0) return
  viewW.value = w
  pageCount.value = Math.max(1, Math.round((el.scrollWidth + GAP) / (w + GAP)))
  page.value = Math.max(0, Math.min(targetPage ?? page.value, pageCount.value - 1))
}

function turn(dir) {
  if (isScroll.value) return
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
  const within = isScroll.value ? scrollWithin.value : pageCount.value > 1 ? page.value / (pageCount.value - 1) : 0
  return Math.min(100, ((chapterIdx.value + within) / chapters.value.length) * 100)
})

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.reader.saveProgress(props.book.id, { chapter: chapterIdx.value, page: page.value }, pct.value).catch(() => {})
  }, 1500)
}

/* ---------- 自动翻页（Moon+ Reader 风格） ---------- */
const autoOn = ref(false)
let autoTimer = 0
function stopAuto() {
  autoOn.value = false
  clearInterval(autoTimer)
  autoTimer = 0
}
function toggleAuto() {
  if (autoOn.value) return stopAuto()
  autoOn.value = true
  autoTimer = setInterval(() => {
    if (chapterIdx.value >= chapters.value.length - 1 && page.value >= pageCount.value - 1) return stopAuto()
    turn(1)
  }, Math.max(2, cfg.value.autoSec) * 1000)
}
watch(() => cfg.value.autoSec, () => { if (autoOn.value) { stopAuto(); toggleAuto() } })

/* ---------- 书签 ---------- */
async function addBookmark() {
  try {
    const r = await api.reader.addBookmark(props.book.id, {
      chapter: chapterIdx.value, page: page.value, pct: pct.value,
      label: `${chapterTitle.value} · 第${page.value + 1}页`,
    })
    bookmarks.value = r.bookmarks
    toastMsg('已加书签 🔖')
  } catch {
    toastMsg('书签保存失败')
  }
}
async function delBookmark(idx) {
  try {
    const r = await api.reader.removeBookmark(props.book.id, idx)
    bookmarks.value = r.bookmarks
  } catch { /* 静默 */ }
}
async function loadBookmarks() {
  try {
    const list = await api.reader.list()
    bookmarks.value = list.find((b) => b.id === props.book.id)?.bookmarks || []
  } catch { /* 静默 */ }
}

/* ---------- 目录 + 全文搜索 ---------- */
const searchQ = ref('')
const searchHits = ref([])
const searching = ref(false)
let searchTimer = 0
watch(searchQ, (q) => {
  clearTimeout(searchTimer)
  if (!q.trim()) {
    searchHits.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const r = await api.reader.search(props.book.id, q.trim())
      searchHits.value = r.hits || []
    } catch {
      searchHits.value = []
    } finally {
      searching.value = false
    }
  }, 450)
})

/* ---------- 交互 ---------- */
function toastMsg(text) {
  /* 轻量提示：复用底部进度位置闪烁 */
  hint.value = text
  setTimeout(() => (hint.value = ''), 1600)
}
const hint = ref('')

function onBodyClick(e) {
  if (autoOn.value) stopAuto()
  if (isScroll.value) {
    /* 滚动模式：点击只唤出/收起菜单 */
    barsVisible.value = !barsVisible.value
    return
  }
  const x = e.clientX / window.innerWidth
  if (x < 0.28) turn(-1)
  else if (x > 0.72) turn(1)
  else barsVisible.value = !barsVisible.value
}
function onKey(e) {
  if (tocShow.value || setShow.value) return
  if (e.key === 'Escape') return emit('close')
  if (isScroll.value) return /* 滚动模式：方向键/空格交给原生滚动 */
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { stopAuto(); turn(-1) }
  else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); stopAuto(); turn(1) }
  else if (e.key.toLowerCase() === 'a') toggleAuto()
  else if (e.key.toLowerCase() === 'b') addBookmark()
}
/* 滚动模式：滚动节流存进度 */
let scrollTimer = 0
function onScroll() {
  if (!isScroll.value) return
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const el = scrollEl.value
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    scrollWithin.value = max > 0 ? Math.min(1, el.scrollTop / max) : 0
    scheduleSave()
  }, 250)
}
let touchX = 0
let touchY = 0
function onTouchStart(e) {
  touchX = e.touches[0].clientX
  touchY = e.touches[0].clientY
}
function onTouchEnd(e) {
  if (isScroll.value) return /* 滚动模式交给原生滑动 */
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    stopAuto()
    turn(dx < 0 ? 1 : -1)
  }
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
  loadBookmarks()
  const start = Math.min(progress.value.chapter || 0, chapters.value.length - 1)
  await loadChapter(start, progress.value.page || 0)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  stopAuto()
  clearTimeout(saveTimer)
  clearTimeout(searchTimer)
  clearTimeout(scrollTimer)
  api.reader.saveProgress(props.book.id, { chapter: chapterIdx.value, page: isScroll.value ? 0 : page.value }, pct.value).catch(() => {})
})

async function jumpChapter(i) {
  tocShow.value = false
  stopAuto()
  if (i !== chapterIdx.value) await loadChapter(i, 0)
}
async function jumpBookmark(b) {
  tocShow.value = false
  stopAuto()
  if (b.chapter !== chapterIdx.value) await loadChapter(b.chapter, b.page || 0)
  else repaginate(b.page || 0)
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
        <button class="tr-btn" :class="{ glow: isScroll }" :title="'切换翻页/滚动模式'" @click="toggleMode">{{ isScroll ? '📜 滚动' : '📖 翻页' }}</button>
        <button class="tr-btn" title="添加书签 (B)" @click="addBookmark">🔖</button>
        <button class="tr-btn" @click="tocShow = true">目录</button>
        <button class="tr-btn" @click="setShow = true">Aa</button>
      </div>
    </header>

    <!-- 正文：翻页=多栏横向分页 / 滚动=限宽自然流 -->
    <main
      ref="scrollEl"
      class="tr-main"
      :class="{ scroll: isScroll }"
      @click="onBodyClick"
      @scroll.passive="onScroll"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <div v-if="loading" class="tr-loading">正在翻到这一章…</div>
      <div v-else ref="bodyEl" class="tr-body" :style="bodyStyle">
        <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
      </div>
      <div v-if="hint" class="tr-hint">{{ hint }}</div>
      <div v-if="autoOn" class="tr-auto" title="自动翻页中 · 点按任意处停止">▶ 自动翻页 {{ cfg.autoSec }}s</div>
    </main>

    <!-- 底栏 -->
    <footer class="tr-bar tr-bottom" :class="{ show: barsVisible }">
      <button class="tr-btn" :disabled="chapterIdx <= 0" @click="jumpChapter(chapterIdx - 1)">上一章</button>
      <div class="tr-progress">
        <span class="mono">{{ chapterIdx + 1 }}/{{ chapters.length }} 章 · {{ page + 1 }}/{{ pageCount }} 页</span>
        <div class="tr-track"><i :style="{ width: pct + '%' }"></i></div>
      </div>
      <button class="tr-btn" :class="{ glow: autoOn }" :title="'自动翻页 (A)'" @click="toggleAuto">{{ autoOn ? '⏸' : '▶' }}</button>
      <button class="tr-btn" :disabled="chapterIdx >= chapters.length - 1" @click="jumpChapter(chapterIdx + 1)">下一章</button>
    </footer>

    <!-- 目录 + 搜索 + 书签 -->
    <Modal :show="tocShow" :title="`目录 · ${chapters.length} 章`" width="440px" @close="tocShow = false">
      <div class="tr-toc-wrap">
        <input v-model="searchQ" class="input tr-search" placeholder="🔍 全文搜索：输入关键词回车出现结果" />
        <!-- 搜索结果 -->
        <ul v-if="searchQ.trim()" class="tr-toc">
          <li v-if="searching" class="tr-toc-empty">搜索中…</li>
          <li v-else-if="!searchHits.length" class="tr-toc-empty">没有找到「{{ searchQ }}」</li>
          <li v-for="h in searchHits" :key="h.index" @click="jumpChapter(h.index); searchQ = ''">
            <b>{{ h.title }}</b>
            <span class="tr-hit-count mono">{{ h.count }} 处</span>
            <small class="tr-excerpt">…{{ h.excerpt }}…</small>
          </li>
        </ul>
        <!-- 目录 + 书签 -->
        <template v-else>
          <ul v-if="bookmarks.length" class="tr-marks">
            <li v-for="(b, i) in bookmarks" :key="i" @click="jumpBookmark(b)">
              <span class="tr-mark-ico">🔖</span>
              <span class="tr-mark-label">{{ b.label }}</span>
              <button class="tr-mark-del" aria-label="删除书签" @click.stop="delBookmark(i)">✕</button>
            </li>
          </ul>
          <ul class="tr-toc">
            <li
              v-for="(c, i) in chapters"
              :key="i"
              :class="{ cur: i === chapterIdx }"
              @click="jumpChapter(i)"
            >{{ c.title }}</li>
          </ul>
        </template>
      </div>
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
        <label class="ts-row">
          <span>自动翻页</span>
          <input v-model.number="cfg.autoSec" type="range" min="2" max="30" step="1" />
          <b class="mono">{{ cfg.autoSec }}s</b>
        </label>
        <p class="ts-tip">
          点屏幕左右翻页 / 中间呼出菜单 · 快捷键：← → 翻页 · A 自动翻页 · B 加书签 · 段落已按中文习惯首行缩进
        </p>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.txt-reader { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; transition: background 0.3s; }

.tr-main { flex: 1; overflow: hidden; position: relative; padding: 34px 30px; cursor: pointer; user-select: none; }
.tr-main.scroll { overflow-y: auto; cursor: default; }
.tr-main.scroll .tr-body {
  height: auto;
  padding-bottom: 12vh;
}
.tr-body {
  height: 100%;
  column-fill: auto;
  word-break: break-word;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  text-align: justify;
}
.tr-body p {
  text-indent: 2em;
  margin: 0 0 0.55em;
}
.tr-loading { height: 100%; display: grid; place-items: center; opacity: 0.5; font-size: 0.9rem; }
.tr-hint {
  position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 0.78rem;
  padding: 6px 16px; border-radius: 99px; backdrop-filter: blur(8px);
}
.tr-auto {
  position: absolute; top: 18px; right: 22px;
  background: rgba(0, 0, 0, 0.4); color: rgba(255, 255, 255, 0.9);
  font-size: 0.7rem; padding: 4px 12px; border-radius: 99px; backdrop-filter: blur(6px);
}

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
.tr-btn.glow { background: linear-gradient(90deg, rgba(168, 85, 247, 0.55), rgba(99, 102, 241, 0.55)); }
.tr-titles { flex: 1; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.tr-titles strong { font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-titles span { font-size: 0.76rem; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-actions { display: flex; gap: 8px; }
.tr-progress { flex: 1; display: flex; align-items: center; gap: 12px; font-size: 0.72rem; opacity: 0.85; }
.tr-track { flex: 1; max-width: 320px; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.2); overflow: hidden; }
.tr-track i { display: block; height: 100%; background: linear-gradient(90deg, #a855f7, #6366f1); }

.tr-toc-wrap { display: grid; gap: 10px; }
.tr-search { width: 100%; }
.tr-toc { list-style: none; max-height: 46vh; overflow-y: auto; display: grid; gap: 2px; }
.tr-toc li { padding: 9px 12px; border-radius: 8px; font-size: 0.86rem; cursor: pointer; color: var(--text-2); }
.tr-toc li:hover { background: var(--accent-soft); color: var(--text-1); }
.tr-toc li.cur { background: var(--accent-soft); color: var(--t-accent); font-weight: 600; }
.tr-toc li b { display: inline; }
.tr-toc-empty { cursor: default; opacity: 0.6; }
.tr-hit-count { font-size: 0.66rem; color: var(--t-accent); margin-left: 8px; }
.tr-excerpt { display: block; font-size: 0.74rem; color: var(--text-3); margin-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-marks { list-style: none; display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--border); margin-bottom: 6px; }
.tr-marks li { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 8px;
  font-size: 0.82rem; cursor: pointer; color: var(--text-2); background: var(--accent-soft); }
.tr-marks li:hover { color: var(--text-1); }
.tr-mark-ico { flex-shrink: 0; }
.tr-mark-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-mark-del { border: none; background: none; color: var(--text-3); cursor: pointer; padding: 2px 6px; }
.tr-mark-del:hover { color: var(--danger); }

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
