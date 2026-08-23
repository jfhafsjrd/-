<script setup>
/**
 * 影视大本营 — TMDB 混搜 + 趋势海报墙 + 待看/已看完双池
 * 预约看剧时间 → 后端自动联动日历事件
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, img as imgProxy, tmdbPoster } from '@/api'
import { debounce } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { confetti } from '@/composables/useConfetti'
import StateShell from '@/components/common/StateShell.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import Modal from '@/components/common/Modal.vue'
import PosterWall from './PosterWall.vue'
import HeroWall from './HeroWall.vue'
import MovieDetailModal from './MovieDetailModal.vue'
import WatchedModal from './WatchedModal.vue'

const toast = useToast()

/** 封面统一出口：Trakt 存完整 URL，TMDB 存 path */
function coverUrl(c, size = 'w185') {
  if (!c) return ''
  return c.startsWith('http') ? imgProxy(c) : tmdbPoster(c, size)
}

/** 斜向背景海报带数据：趋势优先，TMDB 不可达时降级用本地库封面 */
const heroItems = computed(() =>
  trending.value.length
    ? trending.value.slice(0, 14)
    : library.value.filter((m) => m.cover).slice(0, 14),
)

/* ---------- 状态 ---------- */
const searchQ = ref('')
const searching = ref(false)
const searchRes = ref(null) // { local, tmdb, tmdbError }
const trending = ref([])
const trendingError = ref('')
const library = ref([])
const libLoading = ref(true)
const libError = ref('')
const tab = ref('want') // want | done

const detailShow = ref(false)
const detailItem = ref(null)
const adding = ref(false)
const watchedShow = ref(false)
const watchedMovie = ref(null)
const reservationEdit = ref(null) // { id, time }
const resSaving = ref(false)

/* ---------- 数据加载 ---------- */
async function loadLibrary() {
  libLoading.value = true
  libError.value = ''
  try {
    library.value = await api.movies.list()
  } catch (e) {
    libError.value = e.message
  } finally {
    libLoading.value = false
  }
}

async function loadTrending() {
  trendingError.value = ''
  try {
    trending.value = await api.movies.trending()
  } catch (e) {
    trendingError.value = e.message
  }
}

onMounted(() => {
  loadLibrary()
  loadTrending()
  api.trakt.status().then((s) => (traktConfigured.value = s.configured)).catch(() => {})
})

/* ---------- 搜索（防抖 450ms） ---------- */
const doSearch = debounce(async (q) => {
  if (!q.trim()) {
    searchRes.value = null
    return
  }
  searching.value = true
  try {
    searchRes.value = await api.movies.search(q.trim())
  } catch (e) {
    searchRes.value = { local: [], tmdb: [], tmdbError: e.message }
  } finally {
    searching.value = false
  }
}, 450)
watch(searchQ, (q) => doSearch(q))

/* ---------- 双池 ---------- */
const wantList = computed(() => library.value.filter((m) => m.status === 'want'))
const doneList = computed(() => library.value.filter((m) => m.status === 'done'))
const currentList = computed(() => (tab.value === 'want' ? wantList.value : doneList.value))

function moveSlider() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.pill-tab.active')
    const slider = document.querySelector('.pill-slider')
    if (el && slider) {
      slider.style.left = `${el.offsetLeft}px`
      slider.style.width = `${el.offsetWidth}px`
    }
  })
}
watch([tab, library], moveSlider, { flush: 'post' })
onMounted(() => setTimeout(moveSlider, 100))

/* ---------- 操作 ---------- */
function openDetail(item) {
  detailItem.value = item
  detailShow.value = true
}

const TYPE_BY_LABEL = { 电影: 'movie', 剧集: 'tv', 动漫: 'anime', 纪录片: 'doc' }

async function addToLibrary(item) {
  adding.value = true
  try {
    await api.movies.add({
      tmdbId: item.tmdbId,
      title: item.title,
      type: TYPE_BY_LABEL[item.typeLabel] || item.mediaType || 'movie',
      cover: item.poster,
      backdrop: item.backdrop || '',
      tmdbRating: item.tmdbRating,
      year: item.year,
      overview: item.overview || '',
      status: 'want',
    })
    toast.success(`《${item.title}》已加入待看`)
    detailShow.value = false
    trending.value = trending.value.filter((t) => t.tmdbId !== item.tmdbId)
    await loadLibrary()
  } catch (e) {
    toast.error(e.message)
  } finally {
    adding.value = false
  }
}

function openWatched(movie) {
  watchedMovie.value = movie
  watchedShow.value = true
}

async function submitWatched({ personalRating, comment }) {
  const m = watchedMovie.value
  await api.movies.update(m.id, { status: 'done', personalRating, comment, reservationTime: '' })
  toast.success(`《${m.title}》归档完成`)
  await loadLibrary()
}

async function removeMovie(movie) {
  try {
    await api.movies.remove(movie.id)
    library.value = library.value.filter((m) => m.id !== movie.id)
    toast.info(`已移除《${movie.title}》`)
    confetti({ count: 26 })
  } catch (e) {
    toast.error(e.message)
  }
}

async function saveReservation() {
  if (!reservationEdit.value) return
  resSaving.value = true
  try {
    const updated = await api.movies.update(reservationEdit.value.id, {
      reservationTime: reservationEdit.value.time || '',
    })
    const i = library.value.findIndex((m) => m.id === updated.id)
    if (i > -1) library.value[i] = updated
    toast.success(updated.reservationTime ? '已预约，日历见 📅' : '预约已取消')
    reservationEdit.value = null
  } catch (e) {
    toast.error(e.message)
  } finally {
    resSaving.value = false
  }
}

function startReservation(movie) {
  reservationEdit.value = { id: movie.id, time: (movie.reservationTime || '').replace(' ', 'T') }
}

/* ---------- Trakt（未配置 API 密钥时提供网页抓取导入通道，绕过会员墙） ---------- */
const traktShow = ref(false)
const traktConfigured = ref(false)
const traktUserCode = ref('')
const traktVerifyUrl = ref('')
const traktPolling = ref(false)
const traktSyncing = ref(false)
const traktAuthorized = ref(false)
let traktTimer = 0

/* ---------- 网页抓取导入 ---------- */
const importShow = ref(false)
const importText = ref('')
const importMode = ref('done') // done | want
const importRunning = ref(false)
const importProgress = ref({ done: 0, total: 0, imported: 0, skipped: 0, failed: 0 })

/* ---------- zip 上传导入（Trakt 官方导出文件，推荐） ---------- */
const zipItems = ref(null) // 解析出的条目
const zipPreview = ref(null)
const zipParsing = ref(false)
const zipError = ref('')

async function onZipFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  await parseZipFile(file)
}

async function onZipDrop(e) {
  e.preventDefault()
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  await parseZipFile(file)
}
const dragOver = ref(false)

async function parseZipFile(file) {
  if (!/\.zip$/i.test(file.name)) {
    zipError.value = '请上传 Trakt 导出的 .zip 文件'
    return
  }
  zipParsing.value = true
  zipError.value = ''
  zipItems.value = null
  zipPreview.value = null
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // 分块转 base64，避免大文件展开超栈
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const r = await api.trakt.importZipParse(btoa(binary))
    zipItems.value = r.items
    zipPreview.value = r.preview
    if (!r.items.length) zipError.value = 'zip 里没有识别到条目（请确认是 Trakt 的数据导出文件）'
  } catch (err) {
    zipError.value = err.message
  } finally {
    zipParsing.value = false
  }
}

async function runZipImport() {
  if (!zipItems.value?.length) return
  importRunning.value = true
  importProgress.value = { done: 0, total: zipItems.value.length, imported: 0, skipped: 0, failed: 0 }
  const items = zipItems.value
  const batches = []
  for (let i = 0; i < items.length; i += 20) batches.push(items.slice(i, i + 20))
  for (const batch of batches) {
    try {
      const r = await api.trakt.import(batch, importMode.value)
      importProgress.value.imported += r.imported
      importProgress.value.skipped += r.skipped
      importProgress.value.failed += r.failed.length
    } catch (err) {
      toast.error(`批次失败：${err.message}`)
      break
    }
    importProgress.value.done = Math.min(importProgress.value.done + batch.length, items.length)
  }
  importRunning.value = false
  const p = importProgress.value
  toast.success(`同步完成：新增 ${p.imported} 部，已有 ${p.skipped} 部` + (p.failed ? `，失败 ${p.failed} 条` : ''))
  zipItems.value = null
  zipPreview.value = null
  importShow.value = false
  await loadLibrary()
}

/** 用户在 trakt.tv 列表页的浏览器控制台里运行这段脚本 */
const IMPORT_SCRIPT = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = 0;
  while (document.body.scrollHeight !== last) {
    last = document.body.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(800);
  }
  window.scrollTo(0, 0);
  const items = new Map();
  document.querySelectorAll('a[href]').forEach((a) => {
    const m = (a.getAttribute('href') || '').match(/^\\/(movies|shows)\\/([\\w-]+?)-(19\\d{2}|20\\d{2})$/);
    if (!m) return;
    const key = m[1] + '/' + m[2];
    if (!items.has(key)) items.set(key, { type: m[1], slug: m[2], year: m[3] });
  });
  const data = [...items.values()];
  console.log('LifeOS 抓取完成，共 ' + data.length + ' 个条目');
  try {
    copy(JSON.stringify(data));
    console.log('已复制到剪贴板，回 Life OS 粘贴即可');
  } catch (e) {
    console.log(JSON.stringify(data));
  }
})();`

async function copyScript() {
  try {
    await navigator.clipboard.writeText(IMPORT_SCRIPT)
    toast.success('脚本已复制，去 Trakt 页面 F12 → Console 粘贴回车')
  } catch {
    // 剪贴板被拒时退化：选中 textarea 让用户手动 Ctrl+C
    const el = document.querySelector('.import-script-area')
    el?.select()
    toast.info('请手动 Ctrl+C 复制脚本')
  }
}

async function runImport() {
  let items
  try {
    items = JSON.parse(importText.value)
    if (!Array.isArray(items) || !items.length) throw new Error('空列表')
  } catch {
    toast.error('粘贴的内容不是有效的 JSON（应为脚本输出的一坨 [{type,slug,year}...]）')
    return
  }
  importRunning.value = true
  importProgress.value = { done: 0, total: items.length, imported: 0, skipped: 0, failed: 0 }

  // 分批（每批 20 条），避免单次请求超时
  const batches = []
  for (let i = 0; i < items.length; i += 20) batches.push(items.slice(i, i + 20))

  for (const batch of batches) {
    try {
      const r = await api.trakt.import(batch, importMode.value)
      importProgress.value.imported += r.imported
      importProgress.value.skipped += r.skipped
      importProgress.value.failed += r.failed.length
    } catch (e) {
      toast.error(`批次失败：${e.message}`)
      break
    }
    importProgress.value.done = Math.min(importProgress.value.done + batch.length, items.length)
  }

  importRunning.value = false
  const p = importProgress.value
  toast.success(`导入完成：新入库 ${p.imported} 部，已有 ${p.skipped} 部` + (p.failed ? `，失败 ${p.failed} 条` : ''))
  await loadLibrary()
}

async function onTraktClick() {
  try {
    const st = await api.trakt.status()
    if (!st.configured) {
      toast.error('Trakt 未配置：先在 .env 填入 TRAKT_CLIENT_ID / SECRET（见 README 的 2 分钟教程）')
      return
    }
    if (st.authorized) {
      traktAuthorized.value = true
      await doTraktSync()
      return
    }
    traktAuthorized.value = false
    await startTraktAuth()
  } catch (e) {
    toast.error(e.message)
  }
}

async function startTraktAuth() {
  try {
    const d = await api.trakt.deviceStart()
    traktUserCode.value = d.userCode
    traktVerifyUrl.value = d.verificationUrl
    traktShow.value = true
    startPoll()
  } catch (e) {
    toast.error(e.message)
  }
}

function startPoll() {
  stopPoll()
  traktPolling.value = true
  traktTimer = setInterval(async () => {
    try {
      const r = await api.trakt.devicePoll()
      if (r.status === 'ok') {
        stopPoll()
        traktUserCode.value = ''
        traktShow.value = false
        toast.success('Trakt 授权成功，开始同步…')
        await doTraktSync()
      } else if (r.status === 'expired') {
        stopPoll()
        toast.error('授权码已过期，请重新发起')
        traktUserCode.value = ''
      }
    } catch {
      /* 网络抖动静默，下轮再试 */
    }
  }, 5000)
}
function stopPoll() {
  traktPolling.value = false
  clearInterval(traktTimer)
}
onBeforeUnmount(stopPoll)

async function doTraktSync() {
  traktSyncing.value = true
  try {
    const r = await api.trakt.sync()
    toast.success(`同步完成：新进待看 ${r.wantAdded} 部、已看完 ${r.doneAdded} 部，已存在 ${r.skipped} 部` +
      (r.rated ? `，补入评分 ${r.rated} 条` : ''))
    await loadLibrary()
  } catch (e) {
    toast.error(e.message)
  } finally {
    traktSyncing.value = false
  }
}
</script>

<template>
  <div class="mv-root">
    <HeroWall :items="heroItems" />
    <div class="page-head page-head-hero">
      <div>
        <h1 class="page-title">🎬 影视大本营</h1>
        <p class="page-sub">全品类混搜 · 待看 {{ wantList.length }} 部 · 已看完 {{ doneList.length }} 部</p>
      </div>
      <div class="head-right">
        <button v-if="traktConfigured" class="btn trakt-btn" :disabled="traktSyncing" @click="onTraktClick" title="从 Trakt.tv 同步我的观看记录">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 4.6 18.85l-1.6-2.6A7 7 0 1 1 19 12v1h-3l3.5 5L23 13h-2a9 9 0 0 0-9-9z"/>
            <path d="m10.5 7.5h2.8v9l3-1.7v2.3L10.5 20z" fill="#0d0f16"/>
          </svg>
          {{ traktSyncing ? '同步中…' : 'Trakt 同步' }}
        </button>
        <button v-else class="btn" @click="importShow = true" title="从 Trakt 网页抓取观看记录（无需会员）">
          📥 导入 Trakt 记录
        </button>
        <div class="search-box">
        <IconSvg name="search" :size="16" />
        <input
          v-model="searchQ"
          class="search-input"
          type="text"
          placeholder="搜电影 / 剧集 / 动漫…"
          aria-label="搜索影视"
        />
        <button v-if="searchQ" class="icon-btn" aria-label="清空搜索" @click="searchQ = ''">
          <IconSvg name="close" :size="14" />
        </button>
        <span v-else-if="searching" class="searching-dot"></span>
        </div>
      </div>
    </div>

    <!-- ============ Trakt 授权弹窗 ============ -->
    <Modal :show="traktShow" title="连接 Trakt.tv" width="420px" @close="traktShow = false; stopPoll()">
      <div class="trakt-auth">
        <p class="text-2" style="font-size: 0.88rem">打开 Trakt 授权页，输入下方激活码：</p>
        <div class="ta-code mono">{{ traktUserCode }}</div>
        <a :href="traktVerifyUrl" target="_blank" rel="noopener" class="btn primary" style="width: 100%">
          <IconSvg name="external" :size="14" /> 打开 {{ traktVerifyUrl.replace('https://', '') }}
        </a>
        <p class="ta-waiting">
          <span v-if="traktPolling" class="searching-dot"></span>
          {{ traktPolling ? '等待你在 Trakt 页面确认…（本页自动检测，确认后立即同步）' : '' }}
        </p>
      </div>
    </Modal>

    <!-- ============ Trakt 导入弹窗（zip 上传 / 网页抓取双通道） ============ -->
    <Modal :show="importShow" title="📥 导入 Trakt 记录" width="600px" @close="importShow = false">
      <div class="import-box">
        <!-- 方式一：zip 上传（推荐） -->
        <section class="im-zone">
          <header class="im-zone-head">
            <h4>方式一 · 上传 Trakt 导出文件<span class="tag">推荐</span></h4>
            <a class="panel-more" href="https://trakt.tv/users/me/settings/data" target="_blank" rel="noopener">去 Trakt 导出 →</a>
          </header>

          <label
            class="im-drop"
            :class="{ over: dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop="onZipDrop"
          >
            <input type="file" accept=".zip" hidden @change="onZipFile" />
            <span class="im-drop-icon">{{ zipParsing ? '⏳' : '🗜️' }}</span>
            <span class="im-drop-main">{{ zipParsing ? '解析中…' : '点击选择 或 拖入 .zip 文件' }}</span>
            <span class="im-drop-sub">Trakt → 设置 → 数据 → 导出，得到的 zip 直接拖进来</span>
          </label>

          <p v-if="zipError" class="im-err">⚠️ {{ zipError }}</p>

          <div v-if="zipPreview" class="im-zp-preview">
            <span class="tag success">已看完 {{ zipPreview.done }}</span>
            <span class="tag">待看 {{ zipPreview.want }}</span>
            <span v-if="zipPreview.rated" class="tag warning">带评分 {{ zipPreview.rated }}</span>
            <span class="tag plain">TMDB 精确匹配 {{ zipPreview.withTmdbId }}/{{ zipPreview.done + zipPreview.want }}</span>
          </div>

          <div v-if="importRunning" class="im-progress">
            <div class="im-bar"><div class="im-fill" :style="{ width: (importProgress.done / importProgress.total) * 100 + '%' }"></div></div>
            <span class="mono im-ptext">{{ importProgress.done }} / {{ importProgress.total }}（新增 {{ importProgress.imported }}）</span>
          </div>

          <button
            v-if="zipItems?.length"
            class="btn primary"
            style="width: 100%"
            :disabled="importRunning"
            @click="runZipImport"
          >
            {{ importRunning ? '同步中…' : `开始同步（${zipItems.length} 个条目，已有的自动跳过）` }}
          </button>
        </section>

        <div class="im-divider"><span>或</span></div>

        <!-- 方式二：网页抓取 -->
        <section class="im-zone">
          <header class="im-zone-head">
            <h4>方式二 · 网页抓取（无需导出）</h4>
          </header>
          <ol class="im-steps">
            <li>打开你自己的 <a href="https://trakt.tv/users/me/history" target="_blank" rel="noopener">观看历史</a> 或 <a href="https://trakt.tv/users/me/watchlist" target="_blank" rel="noopener">待看列表</a>（保持登录）</li>
            <li>按 <kbd>F12</kbd> → Console → 粘贴脚本回车（自动滚动加载全部并复制结果）：</li>
          </ol>
          <button class="btn" style="width: 100%" @click="copyScript">📋 一键复制抓取脚本</button>
          <textarea class="textarea import-script-area" rows="3" readonly :value="IMPORT_SCRIPT" aria-label="抓取脚本"></textarea>
          <textarea
            v-model="importText"
            class="textarea"
            rows="3"
            placeholder='[{"type":"movies","slug":"interstellar-2014","year":"2014"}, …] 粘贴脚本输出后，点下方开始'
            aria-label="粘贴抓取结果"
          ></textarea>
          <div class="im-mode">
            <label class="im-radio">
              <input v-model="importMode" type="radio" value="done" />
              标记为 <b>已看完</b>
            </label>
            <label class="im-radio">
              <input v-model="importMode" type="radio" value="want" />
              标记为 <b>待看</b>
            </label>
          </div>
          <button class="btn" style="width: 100%" :disabled="importRunning || !importText.trim()" @click="runImport">
            开始导入（粘贴内容）
          </button>
        </section>

        <p class="im-note">两种方式都支持重复执行 —— 已在库中的条目自动跳过，缺海报/评分的自动补全。同步 = Trakt 导出 zip + 拖进来，两次点击的事。</p>
      </div>
    </Modal>

    <!-- ============ 搜索结果 ============ -->
    <section v-if="searchQ.trim()" class="search-zone">
      <div v-if="searching" class="sr-skeletons">
        <div v-for="i in 4" :key="i" class="skeleton" style="height: 108px; border-radius: 14px"></div>
      </div>
      <template v-else-if="searchRes">
        <div v-if="searchRes.local.length" class="sec">
          <h3 class="sec-title">📚 我的库中</h3>
          <div class="local-hits">
            <span v-for="m in searchRes.local" :key="m.id" class="local-hit tag" :class="m.status === 'done' ? 'success' : ''">
              {{ m.title }} · {{ m.status === 'done' ? '已看完' : '待看' }}
            </span>
          </div>
        </div>
        <div class="sec">
          <h3 class="sec-title">🌐 TMDB 云端结果</h3>
          <p v-if="searchRes.tmdbError" class="tmdb-err">
            ⚠️ TMDB 暂不可达（{{ searchRes.tmdbError }}）<br />
            <span class="text-3">大陆网络受限时会出现，部署海外服务器即恢复</span>
          </p>
          <div v-else-if="searchRes.tmdb.length" class="sr-grid">
            <button v-for="r in searchRes.tmdb" :key="r.tmdbId" class="sr-card glass-card hoverable" @click="openDetail(r)">
              <img :src="tmdbPoster(r.poster, 'w185')" :alt="r.title" loading="lazy" />
              <div class="sr-info">
                <strong class="sr-title">{{ r.title }}</strong>
                <span class="sr-meta"><i class="tag">{{ r.typeLabel }}</i> <b class="mono">{{ r.year }}</b></span>
                <span class="sr-rate mono">★ {{ r.tmdbRating.toFixed(1) }}</span>
              </div>
            </button>
          </div>
          <p v-else class="text-3" style="padding: 12px 0">云端没有匹配结果</p>
        </div>
      </template>
    </section>

    <!-- ============ 海报墙 + 双池 ============ -->
    <template v-else>
      <div v-if="trendingError" class="tmdb-err" style="margin-bottom: 18px">
        ⚠️ 趋势获取失败（{{ trendingError }}），海报墙暂不可用，下方本地库正常
      </div>
      <PosterWall v-else :items="trending" @pick="openDetail" />

      <StateShell :loading="libLoading" :error="libError" :empty="!library.length"
        empty-emoji="🍿" empty-text="待看录还是空的" empty-sub="从上方趋势海报墙挑一部，或搜索片名入库"
        :rows="3" @retry="loadLibrary">
        <div class="pool">
          <div class="pool-head">
            <div class="pill-tabs" role="tablist">
              <span class="pill-slider"></span>
              <button class="pill-tab" :class="{ active: tab === 'want' }" role="tab" @click="tab = 'want'">
                🕒 待看 <b class="mono">{{ wantList.length }}</b>
              </button>
              <button class="pill-tab" :class="{ active: tab === 'done' }" role="tab" @click="tab = 'done'">
                ✅ 已看完 <b class="mono">{{ doneList.length }}</b>
              </button>
            </div>
          </div>

          <div v-if="currentList.length" class="mv-grid">
            <article
              v-for="(m, idx) in currentList"
              :key="m.id"
              class="mv-card glass-card stagger-item"
              :style="{ animationDelay: `${Math.min(idx * 0.04, 0.4)}s` }"
            >
              <div class="mv-cover">
                <img v-if="m.cover" :src="coverUrl(m.cover)" :alt="m.title" loading="lazy" />
                <div v-else class="mv-cover-fallback">🎞️</div>
              </div>
              <div class="mv-body">
                <div class="mv-line1">
                  <h3 class="mv-title">{{ m.title }}</h3>
                  <span class="tag">{{ { movie: '电影', tv: '剧集', anime: '动漫', doc: '纪录片' }[m.type] || '电影' }}</span>
                </div>
                <p class="mv-rate mono">
                  <span class="r-tmdb">TMDB <b>{{ m.tmdbRating ? m.tmdbRating.toFixed(1) : '—' }}</b></span>
                  <span class="r-sep">|</span>
                  <span class="r-mine">个人 <b>{{ m.personalRating ? m.personalRating.toFixed(1) : '—' }}</b></span>
                </p>
                <div v-if="m.airedEps > 0" class="mv-progress" :class="{ over: (m.watchedEps || 0) >= m.airedEps }">
                  <span class="mv-eps mono">📺 {{ m.watchedEps || 0 }}/{{ m.airedEps }} 集</span>
                  <span class="mv-bar"><i :style="{ width: Math.min(100, Math.round(((m.watchedEps || 0) / m.airedEps) * 100)) + '%' }"></i></span>
                </div>
                <p v-if="m.comment" class="mv-comment">“{{ m.comment }}”</p>
                <p v-if="m.reservationTime" class="mv-reserve">
                  📅 预约 {{ m.reservationTime.replace('T', ' ') }}
                </p>
                <div class="mv-actions">
                  <template v-if="m.status === 'want'">
                    <button class="btn sm primary" @click="openWatched(m)">✓ 看完了</button>
                    <button class="btn sm" @click="startReservation(m)">
                      {{ m.reservationTime ? '改预约' : '📅 预约' }}
                    </button>
                  </template>
                  <span v-else class="tag success">已归档</span>
                  <button class="icon-btn danger" aria-label="删除" @click="removeMovie(m)">
                    <IconSvg name="trash" :size="15" />
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="state-box glass-card">
            <span class="emoji">{{ tab === 'want' ? '🕒' : '✅' }}</span>
            <span class="msg">{{ tab === 'want' ? '待看录空空如也' : '还没有归档的影片' }}</span>
          </div>
        </div>
      </StateShell>
    </template>

    <!-- ============ 弹窗 ============ -->
    <MovieDetailModal :show="detailShow" :item="detailItem" :adding="adding" @close="detailShow = false" @add="addToLibrary" />
    <WatchedModal :show="watchedShow" :movie="watchedMovie" @close="watchedShow = false" @submit="submitWatched" />

    <Modal :show="!!reservationEdit" title="预约看剧时间" width="400px" @close="reservationEdit = null">
      <div v-if="reservationEdit" style="display: flex; flex-direction: column; gap: 14px">
        <p class="text-2" style="font-size: 0.88rem">设定时间后会自动在日历上生成日程提醒</p>
        <input v-model="reservationEdit.time" type="datetime-local" class="input" aria-label="预约时间" />
        <p class="text-3" style="font-size: 0.78rem">留空并保存 = 取消预约</p>
      </div>
      <template #footer>
        <button class="btn" @click="reservationEdit = null">取消</button>
        <button class="btn primary" :disabled="resSaving" @click="saveReservation">
          {{ resSaving ? '保存中…' : '保存预约' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
/* ---------- 页面根与 hero 层叠 ---------- */
.mv-root {
  position: relative;
}
.page-head-hero {
  position: relative;
  z-index: 1;
  padding-top: 30px;
}

/* ---------- 页头右侧 ---------- */
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.trakt-btn {
  color: #ea2b2f;
  border-color: rgba(234, 43, 47, 0.35);
}
.trakt-btn:hover {
  background: rgba(234, 43, 47, 0.1);
  border-color: rgba(234, 43, 47, 0.55);
}

/* ---------- Trakt 授权弹窗 ---------- */
.trakt-auth {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ta-code {
  text-align: center;
  font-size: 1.9rem;
  font-weight: 750;
  letter-spacing: 0.32em;
  padding: 16px;
  border-radius: 12px;
  background: rgba(234, 43, 47, 0.08);
  border: 1px dashed rgba(234, 43, 47, 0.4);
  color: #ff6b6e;
  user-select: all;
}
.ta-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 20px;
  font-size: 0.78rem;
  color: var(--text-3);
  text-align: center;
}

/* ---------- 导入弹窗 ---------- */
.import-box {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.im-zone {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.im-zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.im-zone-head h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  font-weight: 650;
}
.im-zone-head .tag {
  font-size: 0.64rem;
}
.im-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 22px 16px;
  border-radius: 12px;
  border: 1.5px dashed rgba(168, 85, 247, 0.4);
  background: rgba(168, 85, 247, 0.05);
  cursor: pointer;
  transition: all var(--dur-fast);
  text-align: center;
}
.im-drop:hover,
.im-drop.over {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 24px -8px var(--accent-glow);
}
.im-drop-icon {
  font-size: 26px;
}
.im-drop-main {
  font-size: 0.92rem;
  font-weight: 600;
}
.im-drop-sub {
  font-size: 0.74rem;
  color: var(--text-3);
}
.im-err {
  font-size: 0.8rem;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  padding: 8px 12px;
}
.im-zp-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.im-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
  font-size: 0.76rem;
}
.im-divider::before,
.im-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.im-steps {
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.84rem;
  color: var(--text-2);
  line-height: 1.65;
}
.im-steps b {
  color: var(--text-1);
}
.import-script-area {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--text-3);
  white-space: pre;
  overflow-x: auto;
  cursor: text;
}
kbd {
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 0.78rem;
}
.im-mode {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.im-radio {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.86rem;
  color: var(--text-2);
  cursor: pointer;
}
.im-radio b {
  color: var(--text-1);
}
.im-radio input {
  accent-color: var(--accent);
}
.im-progress {
  display: flex;
  align-items: center;
  gap: 12px;
}
.im-bar {
  flex: 1;
  height: 7px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.im-fill {
  height: 100%;
  background: var(--accent-grad);
  box-shadow: 0 0 10px var(--accent-glow);
  transition: width 0.4s var(--ease);
}
.im-ptext {
  font-size: 0.76rem;
  color: var(--text-2);
  white-space: nowrap;
}
.im-note {
  font-size: 0.74rem;
  color: var(--text-3);
  line-height: 1.6;
}

/* ---------- 搜索框 ---------- */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(360px, 100%);
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(10, 11, 18, 0.55);
  color: var(--text-3);
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
}
.search-input {
  flex: 1;
  padding: 11px 0;
  border: none;
  background: transparent;
  color: var(--text-1);
  font-size: 0.92rem;
  outline: none;
}
.searching-dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--accent);
  animation: breathe 1s infinite;
}

/* ---------- 搜索结果 ---------- */
.sec {
  margin-bottom: 22px;
}
.sec-title {
  font-size: 0.95rem;
  color: var(--text-2);
  margin-bottom: 12px;
  font-weight: 600;
}
.local-hits {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.local-hit {
  font-size: 0.8rem;
  cursor: default;
}
.tmdb-err {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--warning-soft);
  border: 1px solid rgba(251, 191, 36, 0.25);
  color: var(--warning);
  font-size: 0.86rem;
  line-height: 1.6;
}
.sr-skeletons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.sr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.sr-card {
  display: flex;
  gap: 14px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--text-1);
}
.sr-card img {
  width: 72px;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: #1a1c2a;
}
.sr-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.sr-title {
  font-size: 0.94rem;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sr-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sr-meta .tag {
  font-size: 0.66rem;
}
.sr-rate {
  color: var(--warning);
  font-size: 0.82rem;
}

/* ---------- 双池 ---------- */
.pool-head {
  display: flex;
  justify-content: center;
  margin-bottom: 18px;
}
.mv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 14px;
}
.mv-card {
  display: flex;
  gap: 14px;
  padding: 14px;
}
.mv-cover {
  flex: 0 0 92px;
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(160deg, #23203a, #141625);
  border: 1px solid var(--border);
}
.mv-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mv-cover-fallback {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 28px;
  opacity: 0.5;
}
.mv-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mv-line1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mv-title {
  font-size: 1rem;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mv-rate {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-3);
}
.mv-rate b {
  font-size: 1.05rem;
  font-weight: 700;
}
.r-tmdb b {
  color: var(--warning);
}
.r-mine b {
  background: var(--accent-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.r-sep {
  opacity: 0.4;
}
/* 追剧进度：Trakt 同步的剧集卡片显示 已看/已播 集数 + 微进度条 */
.mv-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.78rem;
  color: var(--text-2);
}
.mv-eps {
  white-space: nowrap;
}
.mv-bar {
  flex: 1;
  height: 5px;
  border-radius: 4px;
  background: rgba(251, 191, 36, 0.16);
  overflow: hidden;
}
.mv-bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
  transition: width 0.6s ease;
}
.mv-progress.over .mv-bar {
  background: rgba(52, 211, 153, 0.14);
}
.mv-progress.over .mv-bar i {
  background: linear-gradient(90deg, #10b981, #34d399);
}
.mv-comment {
  font-size: 0.8rem;
  color: var(--text-2);
  font-style: italic;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mv-reserve {
  font-size: 0.78rem;
  color: var(--info);
}
.mv-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

@media (max-width: 640px) {
  .search-box {
    width: 100%;
  }
  .mv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
