<script setup>
/**
 * TXT/EPUB 沉浸阅读器 v3 — 对标主流阅读软件
 * 阅读方式三选：→ 右开翻页 · ← 左开翻页(日轻向) · ↕ 上下无缝滚动(跨章连读)
 * 排版自由：8 预设主题 + 自定义背景/文字色 · 6 种字体 · 字号/行距
 * 全功能：章节目录 + 全文搜索 · 书签 · 自动翻页 · 点区/键盘/触屏翻页 · 文字可选中复制 · 进度记忆
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import Modal from '@/components/common/Modal.vue'

const props = defineProps({ book: { type: Object, required: true } })
const emit = defineEmits(['close'])

/* ================= 阅读设置（localStorage 持久） ================= */
const LS = 'lifeos_reader_cfg'
const cfg = ref(Object.assign(
  { fontSize: 19, lineHeight: 1.9, family: 'sans', theme: 'paper', customBg: '#f5efe1', customFg: '#3d3427', autoSec: 8, mode: 'ltr' },
  migrate(JSON.parse(localStorage.getItem(LS) || '{}')),
))
function migrate(c) {
  if (c.mode === 'paged') c.mode = 'ltr'
  if (c.mode === 'scroll') c.mode = 'scroll'
  return c
}
watch(cfg, () => localStorage.setItem(LS, JSON.stringify(cfg.value)), { deep: true })

const THEMES = [
  { key: 'paper', name: '纸张', bg: '#f5efe1', fg: '#3d3427' },
  { key: 'sepia', name: '羊皮', bg: '#e8d8b8', fg: '#4a3a28' },
  { key: 'green', name: '护眼', bg: '#cde6d0', fg: '#2c3a30' },
  { key: 'sky', name: '天青', bg: '#dce8f0', fg: '#26343e' },
  { key: 'pink', name: '樱粉', bg: '#f0e0e4', fg: '#4a3038' },
  { key: 'dark', name: '夜间', bg: '#15171d', fg: '#b9bdc9' },
  { key: 'ink', name: '墨黑', bg: '#0a0a0a', fg: '#8f8f8f' },
  { key: 'sea', name: '深海', bg: '#10202e', fg: '#a8c0d0' },
]
const FAMILIES = [
  { key: 'sans', name: '黑体', stack: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { key: 'serif', name: '宋体', stack: "Georgia, 'Songti SC', SimSun, serif" },
  { key: 'kai', name: '楷体', stack: "'Kaiti SC', KaiTi, STKaiti, serif" },
  { key: 'fang', name: '仿宋', stack: "'Fangsong SC', FangSong, STFangsong, serif" },
  { key: 'yuan', name: '圆体', stack: "'Yuanti SC', 'Hiragino Maru Gothic ProN', Quicksand, sans-serif" },
]
const theme = computed(() => {
  if (cfg.value.theme === 'custom') return { bg: cfg.value.customBg, fg: cfg.value.customFg }
  return THEMES.find((t) => t.key === cfg.value.theme) || THEMES[0]
})
const isScroll = computed(() => cfg.value.mode === 'scroll')
const isRTL = computed(() => cfg.value.mode === 'rtl')

/* ================= 数据：loaded 支撑跨章连读 ================= */
const chapters = ref([])
const bookmarks = ref([])
/** 已加载章节序列（滚动模式向下无缝追加；翻页模式恒为当前 1 章） */
const loaded = ref([])
const chapterIdx = ref(0)
const chapterTitle = ref('')
const loading = ref(true)
const loadingMore = ref(false)

const GAP = 56
const page = ref(0)
const pageCount = ref(1)
const viewW = ref(0)
const bodyEl = ref(null)
const scrollEl = ref(null)
const scrollWithin = ref(0)
const sectionEls = new Map()
const barsVisible = ref(false)
const tocShow = ref(false)
const setShow = ref(false)

const progress = ref(props.book.progress || {})
let saveTimer = 0

const hint = ref('')
function toastMsg(t) {
  hint.value = t
  setTimeout(() => (hint.value = ''), 1600)
}

const setSectionRef = (idx, el) => {
  if (el) sectionEls.set(idx, el)
  else sectionEls.delete(idx)
}

async function fetchChapter(i) {
  return api.reader.text(props.book.id, i)
}

/** 打开指定章节：翻页模式单章替换；滚动模式重置序列（到底部自动续） */
async function loadChapter(i, keepPage = 0) {
  loading.value = true
  try {
    const r = await fetchChapter(i)
    chapterIdx.value = r.index
    chapterTitle.value = r.title
    loaded.value = [{ index: r.index, title: r.title, text: r.text }]
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

/** 无缝滚动：距底 600px 自动衔接下一章 */
async function appendNext() {
  const nextIdx = loaded.value.length ? loaded.value[loaded.value.length - 1].index + 1 : chapterIdx.value + 1
  if (loadingMore.value || nextIdx >= chapters.value.length) return
  loadingMore.value = true
  try {
    const r = await fetchChapter(nextIdx)
    if (!loaded.value.some((c) => c.index === r.index)) loaded.value.push({ index: r.index, title: r.title, text: r.text })
  } catch {
    /* 静默：下次滚动再试 */
  } finally {
    loadingMore.value = false
  }
}

/* 翻页模式正文 = 序列第一章 */
const text = computed(() => loaded.value[0]?.text || '')
const paragraphs = computed(() => text.value.split('\n').map((t) => t.trim()).filter(Boolean))
const scrollBlocks = computed(() =>
  loaded.value.map((c) => ({ index: c.index, title: c.title, paras: c.text.split('\n').map((t) => t.trim()).filter(Boolean) })),
)

/* ================= 翻页引擎（方向感知） ================= */
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
const advance = () => turn(1)
const retreat = () => turn(-1)

const pct = computed(() => {
  if (!chapters.value.length) return 0
  const within = isScroll.value ? scrollWithin.value : pageCount.value > 1 ? page.value / (pageCount.value - 1) : 0
  return Math.min(100, ((chapterIdx.value + within) / chapters.value.length) * 100)
})

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.reader.saveProgress(props.book.id, { chapter: chapterIdx.value, page: isScroll.value ? 0 : page.value }, pct.value).catch(() => {})
  }, 1500)
}

/* ================= 自动翻页 ================= */
const autoOn = ref(false)
let autoTimer = 0
function stopAuto() {
  autoOn.value = false
  clearInterval(autoTimer)
  autoTimer = 0
}
function toggleAuto() {
  if (autoOn.value) return stopAuto()
  if (isScroll.value) {
    toastMsg('滚动模式下请手动滚动；切到翻页模式可用自动翻页')
    return
  }
  autoOn.value = true
  autoTimer = setInterval(() => {
    if (chapterIdx.value >= chapters.value.length - 1 && page.value >= pageCount.value - 1) return stopAuto()
    advance()
  }, Math.max(2, cfg.value.autoSec) * 1000)
}
watch(() => cfg.value.autoSec, () => { if (autoOn.value) { stopAuto(); toggleAuto() } })

/* ================= 书签 ================= */
async function addBookmark() {
  try {
    const r = await api.reader.addBookmark(props.book.id, {
      chapter: chapterIdx.value, page: isScroll.value ? 0 : page.value, pct: pct.value,
      label: `${chapterTitle.value} · ${isScroll.value ? '滚动' : `第${page.value + 1}页`}`,
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

/* ================= 目录 + 全文搜索 ================= */
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

/* ================= 交互（方向感知 + 选中文字不翻页） ================= */
let downX = 0
let downY = 0
let lastClickX = 0
function onPointerDown(e) {
  downX = e.clientX
  downY = e.clientY
}
function onClickCapture(e) {
  lastClickX = e.clientX
}
function onBodyClick() {
  if (autoOn.value) stopAuto()
  /* 当前有选中文字（用户在复制）→ 不翻页不弹菜单 */
  const sel = String(window.getSelection() || '')
  if (sel.length) return
  const x = lastClickX / window.innerWidth
  if (isScroll.value) {
    barsVisible.value = !barsVisible.value
    return
  }
  if (isRTL.value) {
    if (x > 0.72) advance()
    else if (x < 0.28) retreat()
    else barsVisible.value = !barsVisible.value
  } else {
    if (x < 0.28) retreat()
    else if (x > 0.72) advance()
    else barsVisible.value = !barsVisible.value
  }
}

function onKey(e) {
  if (tocShow.value || setShow.value) return
  if (e.key === 'Escape') return emit('close')
  if (isScroll.value) return /* 方向键/空格交给原生滚动 */
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { stopAuto(); isRTL.value ? advance() : retreat() }
  else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); stopAuto(); isRTL.value ? retreat() : advance() }
  else if (e.key.toLowerCase() === 'a') toggleAuto()
  else if (e.key.toLowerCase() === 'b') addBookmark()
}
let touchX = 0
let touchY = 0
function onTouchStart(e) {
  touchX = e.touches[0].clientX
  touchY = e.touches[0].clientY
}
function onTouchEnd(e) {
  if (isScroll.value) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    stopAuto()
    const forward = isRTL.value ? dx > 0 : dx < 0
    turn(forward ? 1 : -1)
  }
}

/* ================= 滚动模式：进度追踪 + 无缝续章 ================= */
let scrollTimer = 0
function onScroll() {
  if (!isScroll.value) return
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const el = scrollEl.value
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    scrollWithin.value = max > 0 ? Math.min(1, el.scrollTop / max) : 0
    const line = el.scrollTop + el.clientHeight * 0.35
    let cur = chapterIdx.value
    for (const [idx, node] of sectionEls) {
      if (node.offsetTop <= line) cur = idx
    }
    if (cur !== chapterIdx.value) {
      chapterIdx.value = cur
      const hit = loaded.value.find((c) => c.index === cur)
      if (hit) chapterTitle.value = hit.title
    }
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 600) appendNext()
    scheduleSave()
  }, 200)
}

const onResize = () => repaginate()
watch(() => [cfg.value.fontSize, cfg.value.lineHeight, cfg.value.family], async () => {
  await nextTick()
  await nextTick()
  repaginate()
})

/* ================= 启动 ================= */
onMounted(async () => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  window.addEventListener('click', onClickCapture, true)
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
  window.removeEventListener('click', onClickCapture, true)
  stopAuto()
  clearTimeout(saveTimer)
  clearTimeout(searchTimer)
  clearTimeout(scrollTimer)
  api.reader.saveProgress(props.book.id, { chapter: chapterIdx.value, page: isScroll.value ? 0 : page.value }, pct.value).catch(() => {})
})

async function jumpChapter(i) {
  tocShow.value = false
  stopAuto()
  if (i !== chapterIdx.value || isScroll.value) await loadChapter(i, 0)
}
async function jumpBookmark(b) {
  tocShow.value = false
  stopAuto()
  if (b.chapter !== chapterIdx.value || isScroll.value) await loadChapter(b.chapter, isScroll.value ? 0 : b.page || 0)
  else repaginate(b.page || 0)
}

/* 阅读方式三选 */
const MODES = [
  { key: 'ltr', label: '→ 右开翻页', desc: '点右侧/→键下一页，网文常用' },
  { key: 'rtl', label: '← 左开翻页', desc: '点左侧/←键下一页，日轻漫画向' },
  { key: 'scroll', label: '↕ 上下滚动', desc: '滑动连读，自动衔接下一章' },
]

/** 正文样式：翻页=多栏+位移；滚动=限宽自然流 */
const bodyStyle = computed(() => {
  const f = FAMILIES.find((x) => x.key === cfg.value.family) || FAMILIES[0]
  const base = {
    fontSize: cfg.value.fontSize + 'px',
    lineHeight: cfg.value.lineHeight,
    fontFamily: f.stack,
    fontWeight: f.weight || 'normal',
  }
  if (isScroll.value) return { ...base, maxWidth: '720px', margin: '0 auto' }
  return { ...base, columnGap: GAP + 'px', transform: `translateX(-${page.value * (viewW.value + GAP)}px)` }
})
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
        <button class="tr-btn" title="阅读方式与排版" @click="setShow = true">{{ { ltr: '→ 右开', rtl: '← 左开', scroll: '↕ 滚动' }[cfg.mode] }}</button>
        <button class="tr-btn" title="添加书签 (B)" @click="addBookmark">🔖</button>
        <button class="tr-btn" @click="tocShow = true">目录</button>
        <button class="tr-btn" @click="setShow = true">Aa</button>
      </div>
    </header>

    <!-- 正文 -->
    <main
      ref="scrollEl"
      class="tr-main"
      :class="{ scroll: isScroll }"
      @click="onBodyClick"
      @pointerdown="onPointerDown"
      @scroll.passive="onScroll"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <div v-if="loading" class="tr-loading">正在翻到这一章…</div>

      <!-- 滚动模式：跨章无缝连读 -->
      <div v-else-if="isScroll" ref="bodyEl" class="tr-body" :style="bodyStyle">
        <section
          v-for="c in scrollBlocks"
          :key="c.index"
          :ref="(el) => setSectionRef(c.index, el)"
          class="tr-section"
        >
          <h2 class="tr-ch-title">{{ c.title }}</h2>
          <p v-for="(p, i) in c.paras" :key="i">{{ p }}</p>
        </section>
        <div class="tr-sentinel">
          {{ loadingMore ? '正在衔接下一章…' : loaded[loaded.length - 1]?.index >= chapters.length - 1 ? '— 全书完 —' : '' }}
        </div>
      </div>

      <!-- 翻页模式：当前章多栏分页 -->
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
        <span class="mono">{{ chapterIdx + 1 }}/{{ chapters.length }} 章<template v-if="!isScroll"> · {{ page + 1 }}/{{ pageCount }} 页</template></span>
        <div class="tr-track"><i :style="{ width: pct + '%' }"></i></div>
      </div>
      <button class="tr-btn" :class="{ glow: autoOn }" title="自动翻页 (A)" @click="toggleAuto">{{ autoOn ? '⏸' : '▶' }}</button>
      <button class="tr-btn" :disabled="chapterIdx >= chapters.length - 1" @click="jumpChapter(chapterIdx + 1)">下一章</button>
    </footer>

    <!-- 目录 + 搜索 + 书签 -->
    <Modal :show="tocShow" :title="`目录 · ${chapters.length} 章`" width="440px" @close="tocShow = false">
      <div class="tr-toc-wrap">
        <input v-model="searchQ" class="input tr-search" placeholder="🔍 全文搜索：输入关键词自动出结果" />
        <ul v-if="searchQ.trim()" class="tr-toc">
          <li v-if="searching" class="tr-toc-empty">搜索中…</li>
          <li v-else-if="!searchHits.length" class="tr-toc-empty">没有找到「{{ searchQ }}」</li>
          <li v-for="h in searchHits" :key="h.index" @click="jumpChapter(h.index); searchQ = ''">
            <b>{{ h.title }}</b>
            <span class="tr-hit-count mono">{{ h.count }} 处</span>
            <small class="tr-excerpt">…{{ h.excerpt }}…</small>
          </li>
        </ul>
        <template v-else>
          <ul v-if="bookmarks.length" class="tr-marks">
            <li v-for="(b, i) in bookmarks" :key="i" @click="jumpBookmark(b)">
              <span class="tr-mark-ico">🔖</span>
              <span class="tr-mark-label">{{ b.label }}</span>
              <button class="tr-mark-del" aria-label="删除书签" @click.stop="delBookmark(i)">✕</button>
            </li>
          </ul>
          <ul class="tr-toc">
            <li v-for="(c, i) in chapters" :key="i" :class="{ cur: i === chapterIdx }" @click="jumpChapter(i)">{{ c.title }}</li>
          </ul>
        </template>
      </div>
    </Modal>

    <!-- 阅读设置：全选择式 -->
    <Modal :show="setShow" title="阅读设置" width="480px" @close="setShow = false">
      <div class="tr-set">
        <div class="ts-block">
          <span class="ts-name">阅读方式</span>
          <div class="ts-modes">
            <button
              v-for="m in MODES" :key="m.key" class="ts-mode" :class="{ on: cfg.mode === m.key }"
              @click="cfg.mode = m.key"
            >
              <b>{{ m.label }}</b>
              <small>{{ m.desc }}</small>
            </button>
          </div>
        </div>

        <div class="ts-row">
          <span class="ts-name">字号</span>
          <input v-model.number="cfg.fontSize" type="range" min="14" max="30" step="1" />
          <b class="mono">{{ cfg.fontSize }}</b>
        </div>
        <div class="ts-row">
          <span class="ts-name">行距</span>
          <input v-model.number="cfg.lineHeight" type="range" min="1.4" max="2.6" step="0.1" />
          <b class="mono">{{ cfg.lineHeight.toFixed(1) }}</b>
        </div>

        <div class="ts-block">
          <span class="ts-name">字体</span>
          <div class="ts-chips">
            <button
              v-for="f in FAMILIES" :key="f.key" class="chip"
              :class="{ on: cfg.family === f.key }" :style="{ fontFamily: f.stack }"
              @click="cfg.family = f.key"
            >{{ f.name }}</button>
          </div>
        </div>

        <div class="ts-block">
          <span class="ts-name">背景</span>
          <div class="ts-chips">
            <button
              v-for="t in THEMES" :key="t.key" class="chip theme-chip"
              :class="{ on: cfg.theme === t.key }" :style="{ background: t.bg, color: t.fg }"
              @click="cfg.theme = t.key"
            >{{ t.name }}</button>
            <button
              class="chip theme-chip custom" :class="{ on: cfg.theme === 'custom' }"
              :style="{ background: cfg.customBg, color: cfg.customFg }"
              @click="cfg.theme = 'custom'"
            >
              自定义
              <input v-model="cfg.customBg" type="color" class="ts-color" title="背景颜色" @click.stop />
              <input v-model="cfg.customFg" type="color" class="ts-color" title="文字颜色" @click.stop />
            </button>
          </div>
        </div>

        <div class="ts-row">
          <span class="ts-name">自动翻页</span>
          <input v-model.number="cfg.autoSec" type="range" min="2" max="30" step="1" />
          <b class="mono">{{ cfg.autoSec }}s</b>
        </div>

        <p class="ts-tip">
          翻页模式：点屏幕两侧翻页 / 中间呼出菜单 · 快捷键 ← → 翻页 · A 自动翻页 · B 加书签 ·
          正文可长按选择复制，选中时不会误触翻页
        </p>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.txt-reader { position: fixed; inset: 0; z-index: 90; display: flex; flex-direction: column; transition: background 0.3s; }

.tr-main { flex: 1; overflow: hidden; position: relative; padding: 34px 30px; cursor: pointer; }
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
.tr-main.scroll .tr-body {
  transition: none;
}
.tr-body p {
  text-indent: 2em;
  margin: 0 0 0.55em;
}
.tr-section { margin-bottom: 3.5em; }
.tr-ch-title {
  font-size: 1.15em;
  font-weight: 700;
  text-align: center;
  margin: 0 0 1.4em;
  opacity: 0.75;
}
.tr-sentinel {
  text-align: center;
  opacity: 0.5;
  font-size: 0.85rem;
  padding: 20px 0;
  letter-spacing: 0.2em;
}
.tr-loading { height: 100%; display: grid; place-items: center; opacity: 0.5; font-size: 0.9rem; }
.tr-hint {
  position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 0.78rem;
  padding: 6px 16px; border-radius: 99px; backdrop-filter: blur(8px);
  z-index: 6;
}
.tr-auto {
  position: absolute; top: 18px; right: 22px;
  background: rgba(0, 0, 0, 0.4); color: rgba(255, 255, 255, 0.9);
  font-size: 0.7rem; padding: 4px 12px; border-radius: 99px; backdrop-filter: blur(6px);
  z-index: 6;
}

.tr-bar { position: absolute; left: 0; right: 0; z-index: 7; display: flex; align-items: center; gap: 14px;
  padding: 10px 18px; background: rgba(0, 0, 0, 0.55); color: #fff; backdrop-filter: blur(14px);
  opacity: 0; pointer-events: none; transition: opacity 0.25s, transform 0.25s; }
.tr-bar.show { opacity: 1; pointer-events: auto; }
.tr-top { top: 0; transform: translateY(-100%); }
.tr-top.show { transform: translateY(0); }
.tr-bottom { bottom: 0; transform: translateY(100%); justify-content: space-between; }
.tr-bottom.show { transform: translateY(0); }

.tr-btn { background: rgba(255, 255, 255, 0.1); color: #fff; border: none; border-radius: 8px;
  padding: 7px 14px; font-size: 0.82rem; cursor: pointer; transition: background 0.15s; white-space: nowrap; }
.tr-btn:hover { background: rgba(255, 255, 255, 0.2); }
.tr-btn:disabled { opacity: 0.35; cursor: default; }
.tr-btn.glow { background: linear-gradient(90deg, rgba(168, 85, 247, 0.55), rgba(99, 102, 241, 0.55)); }
.tr-titles { flex: 1; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.tr-titles strong { font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-titles span { font-size: 0.76rem; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
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

.tr-set { display: grid; gap: 16px; }
.ts-block { display: grid; gap: 8px; }
.ts-name { font-size: 0.8rem; color: var(--text-3); letter-spacing: 0.08em; }
.ts-row { display: flex; align-items: center; gap: 12px; font-size: 0.86rem; color: var(--text-2); }
.ts-row .ts-name { width: 60px; flex-shrink: 0; }
.ts-row input[type='range'] { flex: 1; accent-color: var(--accent); }
.ts-row b { width: 36px; text-align: right; font-size: 0.8rem; }
.ts-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ts-chips .chip { border: 1px solid var(--border); background: transparent; color: var(--text-2);
  padding: 5px 13px; border-radius: 99px; font-size: 0.78rem; cursor: pointer; }
.ts-chips .chip.on { background: var(--accent-soft); color: var(--t-accent); border-color: var(--border-strong); }
.theme-chip { border: 2px solid transparent; }
.theme-chip.on { border-color: var(--accent); }
.theme-chip.custom { display: inline-flex; align-items: center; gap: 6px; }
.ts-color {
  width: 18px; height: 18px; padding: 0; border: 1px solid rgba(128,128,128,0.5);
  border-radius: 4px; background: none; cursor: pointer;
}
/* 阅读方式三选卡 */
.ts-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ts-mode {
  display: grid; gap: 4px; text-align: left;
  border: 1px solid var(--border); border-radius: 12px; background: rgba(255,255,255,0.03);
  padding: 10px 12px; cursor: pointer; color: var(--text-2);
  transition: all var(--dur-fast);
}
.ts-mode b { font-size: 0.86rem; }
.ts-mode small { font-size: 0.68rem; color: var(--text-3); line-height: 1.5; }
.ts-mode.on { border-color: var(--accent); background: var(--accent-soft); color: var(--text-1); }
.ts-mode.on small { color: var(--text-2); }
.ts-tip { font-size: 0.72rem; color: var(--text-3); line-height: 1.7; }
@media (max-width: 520px) {
  .ts-modes { grid-template-columns: 1fr; }
}
</style>
