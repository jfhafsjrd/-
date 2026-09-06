<script setup>
/**
 * 数据中心 — 年度全维度统计洞察
 * 年份切换 · 大数字卡 · 月度柱状 · 类型分布 · Top 榜 · 同比增减
 */
import { computed, onMounted, ref, watch } from 'vue'
import { api, tmdbPoster } from '@/api'

const year = ref(new Date().getFullYear())
const data = ref(null)
const loading = ref(true)
const YEARS = [0, 1, 2, 3].map((i) => new Date().getFullYear() - i)

async function load() {
  loading.value = true
  try {
    data.value = await api.stats.insights(year.value)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(year, load)

const monthMax = computed(() => Math.max(1, ...(data.value?.cur.months || [])))
const diff = (cur, prev) => {
  if (!prev) return null
  const d = cur - prev
  return { dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', pct: prev ? Math.round((d / prev) * 100) : null }
}
const moviesDiff = computed(() => (data.value ? diff(data.value.cur.movies, data.value.prev.movies) : null))
const episodesDiff = computed(() => (data.value ? diff(data.value.cur.episodes, data.value.prev.episodes) : null))
const todosDiff = computed(() => (data.value ? diff(data.value.cur.todosDone, data.value.prev.todosDone) : null))

const typeMax = computed(() => Math.max(1, ...Object.values(data.value?.cur.byType || {})))
const typeTotal = computed(() => Object.values(data.value?.cur.byType || {}).reduce((a, b) => a + b, 0))
</script>

<template>
  <div class="ins-root">
    <div class="page-head">
      <div>
        <h1 class="page-title">📊 数据中心</h1>
        <p class="page-sub">你的数字生活，一屏尽览</p>
      </div>
      <div class="pill-tabs">
        <span class="pill-slider"></span>
        <button v-for="y in YEARS" :key="y" class="pill-tab" :class="{ active: year === y }" @click="year = y">{{ y }}</button>
      </div>
    </div>

    <div v-if="loading" class="ins-loading glass-card"><div class="skeleton" style="height: 200px"></div></div>

    <template v-else-if="data">
      <!-- 大数字卡 -->
      <div class="big-grid">
        <div class="big-card glass-card">
          <span class="bc-emoji">🎬</span>
          <b class="bc-num mono">{{ data.cur.movies }}</b>
          <span class="bc-label">部看完<template v-if="moviesDiff?.pct !== null"> · <i class="bc-diff" :class="moviesDiff.dir">{{ moviesDiff.dir === 'up' ? '↑' : moviesDiff.dir === 'down' ? '↓' : '→' }} {{ Math.abs(moviesDiff.pct || 0) }}%</i></template></span>
          <span class="bc-sub">去年 {{ data.prev.movies }} 部</span>
        </div>
        <div class="big-card glass-card">
          <span class="bc-emoji">📺</span>
          <b class="bc-num mono">{{ data.cur.episodes }}</b>
          <span class="bc-label">集追剧<template v-if="episodesDiff?.pct !== null"> · <i class="bc-diff" :class="episodesDiff.dir">{{ episodesDiff.dir === 'up' ? '↑' : episodesDiff.dir === 'down' ? '↓' : '→' }} {{ Math.abs(episodesDiff.pct || 0) }}%</i></template></span>
          <span class="bc-sub">去年 {{ data.prev.episodes }} 集</span>
        </div>
        <div class="big-card glass-card">
          <span class="bc-emoji">🎮</span>
          <b class="bc-num mono">{{ data.games.hours }}</b>
          <span class="bc-label">小时游戏（Steam 累计）</span>
          <span class="bc-sub">库藏 {{ data.games.total }} 款</span>
        </div>
        <div class="big-card glass-card">
          <span class="bc-emoji">✅</span>
          <b class="bc-num mono">{{ data.cur.todosDone }}</b>
          <span class="bc-label">件待办完成<template v-if="todosDiff?.pct !== null"> · <i class="bc-diff" :class="todosDiff.dir">{{ todosDiff.dir === 'up' ? '↑' : todosDiff.dir === 'down' ? '↓' : '→' }} {{ Math.abs(todosDiff.pct || 0) }}%</i></template></span>
          <span class="bc-sub">去年 {{ data.prev.todosDone }} 件</span>
        </div>
      </div>

      <!-- 月度柱状 -->
      <section class="ins-panel glass-card">
        <header class="ip-head"><h2>📈 {{ year }} 年月度看完</h2><span class="mono text-3">全年 {{ data.cur.movies }} 部</span></header>
        <div class="months-chart">
          <div v-for="(n, i) in data.cur.months" :key="i" class="mc-col">
            <em v-if="n" class="mono">{{ n }}</em>
            <i :style="{ height: Math.max(4, (n / monthMax) * 120) + 'px' }" :class="{ peak: n === monthMax }"></i>
            <em class="mc-label">{{ i + 1 }}</em>
          </div>
        </div>
      </section>

      <div class="ins-two">
        <!-- 类型分布 -->
        <section class="ins-panel glass-card">
          <header class="ip-head"><h2>🍩 类型分布</h2><span class="mono text-3">{{ typeTotal }} 部</span></header>
          <div class="type-rows">
            <div v-for="(n, label) in data.cur.byType" :key="label" class="tr-row">
              <span class="tr-label">{{ label }}</span>
              <div class="tr-track"><i :style="{ width: (n / typeMax) * 100 + '%' }"></i></div>
              <span class="mono tr-num">{{ n }}</span>
            </div>
            <p v-if="!typeTotal" class="text-3" style="font-size: 0.8rem">今年还没有看完的记录</p>
          </div>
        </section>

        <!-- 阅读 + 平均分 -->
        <section class="ins-panel glass-card">
          <header class="ip-head"><h2>📖 阅读 · 评分</h2></header>
          <div class="read-grid">
            <div class="rg-item"><b class="mono">{{ data.reading.streak }}</b><span>连续阅读天数</span></div>
            <div class="rg-item"><b class="mono">{{ data.reading.books }}</b><span>书架藏本</span></div>
            <div class="rg-item"><b class="mono">{{ data.avgRating || '—' }}</b><span>年度均分</span></div>
          </div>
          <div v-if="data.games.top?.length" class="top-games">
            <span class="text-3" style="font-size: 0.72rem">最玩游戏</span>
            <div v-for="(g, i) in data.games.top" :key="g.name" class="tg-row">
              <span class="mono tg-rank">#{{ i + 1 }}</span>
              <span class="tg-name">{{ g.name }}</span>
              <span class="mono tg-hrs">{{ g.hours }}h</span>
            </div>
          </div>
        </section>
      </div>

      <!-- 年度 Top 评分 -->
      <section class="ins-panel glass-card" v-if="data.cur.topRated.length">
        <header class="ip-head"><h2>🏆 {{ year }} 年度评分榜</h2></header>
        <div class="rated-row">
          <div v-for="m in data.cur.topRated" :key="m.title" class="rt-card">
            <img v-if="m.cover" :src="m.cover.startsWith('http') ? m.cover : tmdbPoster(m.cover, 'w185')" :alt="m.title" loading="lazy" />
            <div class="rt-fallback">🎞️</div>
            <b class="mono rt-rate">{{ m.rating }}</b>
            <span class="rt-name">{{ m.title }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ins-root { display: flex; flex-direction: column; gap: 18px; }
.ins-loading { padding: 20px; }

.big-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.big-card { padding: 18px 20px; display: grid; gap: 4px; }
.bc-emoji { font-size: 1.4rem; }
.bc-num { font-size: 2.2rem; font-weight: 800; background: var(--accent-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.bc-label { font-size: 0.84rem; color: var(--text-2); }
.bc-diff { font-style: normal; font-size: 0.72rem; }
.bc-diff.up { color: var(--success); }
.bc-diff.down { color: var(--danger); }
.bc-sub { font-size: 0.7rem; color: var(--text-3); }

.ins-panel { padding: 18px 20px; }
.ip-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.ip-head h2 { font-size: 1rem; }

.months-chart { display: flex; align-items: flex-end; gap: 8px; height: 150px; padding-top: 18px; }
.mc-col { flex: 1; display: grid; justify-items: center; gap: 5px; align-items: end; }
.mc-col i { display: block; width: 100%; max-width: 38px; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #a855f7, #6366f1); transition: height 0.4s var(--ease); }
.mc-col i.peak { background: linear-gradient(180deg, #f59e0b, #ef4444); box-shadow: 0 0 18px rgba(245, 158, 11, 0.4); }
.mc-col em { font-size: 0.62rem; font-style: normal; color: var(--text-3); }
.mc-col em.mc-label { opacity: 0.8; }

.ins-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 900px) { .ins-two { grid-template-columns: 1fr; } }

.type-rows { display: grid; gap: 10px; }
.tr-row { display: flex; align-items: center; gap: 10px; }
.tr-label { width: 48px; font-size: 0.8rem; color: var(--text-2); flex-shrink: 0; }
.tr-track { flex: 1; height: 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.06); overflow: hidden; }
.tr-track i { display: block; height: 100%; border-radius: 99px; background: var(--accent-grad); }
.tr-num { font-size: 0.74rem; color: var(--text-3); width: 28px; text-align: right; }
html[data-theme='light'] .tr-track { background: rgba(30, 32, 72, 0.07); }

.read-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
.rg-item { display: grid; gap: 2px; text-align: center; padding: 12px 6px; border-radius: 10px; background: rgba(255, 255, 255, 0.03); }
html[data-theme='light'] .rg-item { background: rgba(30, 32, 72, 0.04); }
.rg-item b { font-size: 1.4rem; color: var(--t-accent); }
.rg-item span { font-size: 0.66rem; color: var(--text-3); }

.top-games { display: grid; gap: 6px; }
.tg-row { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; }
.tg-rank { color: var(--warning); font-size: 0.7rem; width: 22px; }
.tg-name { flex: 1; color: var(--text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-hrs { color: var(--text-3); font-size: 0.72rem; }

.rated-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px; }
.rt-card { position: relative; display: flex; flex-direction: column; gap: 4px; }
.rt-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); }
.rt-fallback { display: none; }
.rt-rate { position: absolute; top: 8px; right: 8px; font-size: 0.74rem; font-weight: 700; color: #fde047; background: rgba(0, 0, 0, 0.6); padding: 2px 8px; border-radius: 99px; }
.rt-name { font-size: 0.76rem; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
</style>
