<script setup>
/**
 * 首页综合仪表盘 — 问候 + 天气 + 各模块统计 + 今日待办 + 快捷导航
 * 所有卡片骨架屏占位，锁定高度杜绝布局抖动
 */
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { ymd, greeting, hours, friendlyDate } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import CountUp from '@/components/common/CountUp.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import { modules } from '@/router/modules'

const toast = useToast()

/* ---------- 状态 ---------- */
const weather = ref(null)
const weatherError = ref('')
const gameStats = ref(null)
const movies = ref([])
const todos = ref([])
const todayEvents = ref([])
const traktEps = ref([])
const today = ymd()

/* ---------- 每日一句（本地语料按日期轮换）+ 今日进度 ---------- */
const QUOTES = [
  { text: '凡是过往，皆为序章。', author: '莎士比亚' },
  { text: '种一棵树最好的时间是十年前，其次是现在。', author: '非洲谚语' },
  { text: '慢慢来，比较快。', author: '生活禅' },
  { text: '你不必厉害了才开始，但开始了才会厉害。', author: '成长论' },
  { text: '知之者不如好之者，好之者不如乐之者。', author: '孔子' },
  { text: '把日子过成值得备份的样子。', author: 'Life OS' },
  { text: '万物皆有裂痕，那是光照进来的地方。', author: '莱昂纳德·科恩' },
  { text: '今天不想跑，所以才去跑，这才是长跑者的思维。', author: '村上春树' },
  { text: '山不来就我，我便去就山。', author: '穆罕默德' },
  { text: '所谓热爱，就是坚持到世界都觉得你无聊。', author: '探索者手册' },
]
const quote = computed(() => QUOTES[Number(today.replace(/-/g, '')) % QUOTES.length])

const now = ref(new Date())
setInterval(() => (now.value = new Date()), 60_000)
const dayPct = computed(() => {
  const d = now.value
  return Math.round(((d.getHours() * 60 + d.getMinutes()) / 1440) * 100)
})
const R = 34
const CIRC = 2 * Math.PI * R

/* ---------- 加载 ---------- */
async function loadWeather() {
  try {
    weather.value = await api.weather()
  } catch (e) {
    weatherError.value = e.message
  }
}

async function loadAll() {
  const [gs, mv, td] = await Promise.allSettled([api.games.stats(), api.movies.list(), api.todos.list()])
  if (gs.status === 'fulfilled') gameStats.value = gs.value
  if (mv.status === 'fulfilled') movies.value = mv.value
  if (td.status === 'fulfilled') todos.value = td.value

  // 今日 + 未来 3 天事件
  try {
    const to = ymd(new Date(Date.now() + 3 * 86400000))
    todayEvents.value = await api.events.list({ from: today, to })
  } catch {
    /* 静默 */
  }

  // Trakt 追剧更新（未授权/未配置时静默隐藏卡片）
  try {
    const r = await api.trakt.calendar(today, 7)
    traktEps.value = (r.episodes || []).slice(0, 6)
  } catch {
    /* 静默 */
  }
}

onMounted(() => {
  loadWeather()
  loadAll()
})

/* ---------- 派生 ---------- */
const wantCount = computed(() => movies.value.filter((m) => m.status === 'want').length)
const todayTodos = computed(() => todos.value.filter((t) => !t.done && t.dueDate && t.dueDate.slice(0, 10) <= today))
const upcomingEvents = computed(() => todayEvents.value.filter((e) => e.date >= today).slice(0, 6))

const WEATHER_THEME = {
  rain: { emoji: '🌧️', grad: 'linear-gradient(135deg, rgba(56,120,190,.22), rgba(30,50,90,.12))' },
  snow: { grad: 'linear-gradient(135deg, rgba(150,180,220,.2), rgba(60,80,120,.1))', emoji: '🌨️' },
  hot: { grad: 'linear-gradient(135deg, rgba(240,120,60,.18), rgba(160,60,30,.1))', emoji: '🔥' },
  cold: { grad: 'linear-gradient(135deg, rgba(80,160,220,.18), rgba(40,80,140,.1))', emoji: '🧊' },
  normal: { grad: 'linear-gradient(135deg, rgba(168,85,247,.16), rgba(99,102,241,.1))', emoji: '🌤️' },
}

async function toggleTodo(t) {
  try {
    const updated = await api.todos.toggle(t.id)
    const i = todos.value.findIndex((x) => x.id === t.id)
    if (i > -1) todos.value[i] = updated
    if (updated.done) toast.success('又完成一件事 ✨')
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div class="home">
    <!-- ============ 问候主卡（Bento 主角） ============ -->
    <header class="hero glass-card">
      <div class="hero-left">
        <h1 class="hero-title">{{ greeting() }}，探索者</h1>
        <p class="hero-sub">
          今天是 {{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}
          · 待看 <b>{{ wantCount }}</b> 部 · 待办 <b>{{ todayTodos.length }}</b> 件
        </p>
        <p class="hero-quote">「{{ quote.text }}」<span class="hero-quote-by">—— {{ quote.author }}</span></p>
      </div>
      <div class="hero-ring" title="今天已过的时间进度">
        <svg viewBox="0 0 84 84" width="96" height="96" aria-hidden="true">
          <circle cx="42" cy="42" :r="R" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="7" />
          <circle
            cx="42" cy="42" :r="R" fill="none" stroke="url(#day-grad)" stroke-width="7"
            stroke-linecap="round" :stroke-dasharray="CIRC"
            :stroke-dashoffset="CIRC * (1 - dayPct / 100)" transform="rotate(-90 42 42)"
          />
          <defs>
            <linearGradient id="day-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#c084fc" />
              <stop offset="100%" stop-color="#818cf8" />
            </linearGradient>
          </defs>
        </svg>
        <div class="hero-ring-txt">
          <b class="mono">{{ dayPct }}%</b>
          <span>今日进度</span>
        </div>
      </div>
    </header>

    <!-- ============ 顶排：天气 + 统计 ============ -->
    <div class="top-grid">
      <!-- 天气卡 -->
      <section class="weather glass-card" :style="weather ? { background: WEATHER_THEME[weather.theme]?.grad + ', var(--card)' } : {}">
        <div v-if="!weather && !weatherError" class="weather-skeleton">
          <div class="skeleton" style="width: 72px; height: 72px; border-radius: 18px"></div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 10px">
            <div class="skeleton" style="height: 26px; width: 60%"></div>
            <div class="skeleton" style="height: 16px; width: 40%"></div>
          </div>
        </div>
        <div v-else-if="weatherError" class="weather-err">
          <span>🌡️</span>
          <p>天气服务暂不可用</p>
        </div>
        <template v-else-if="weather">
          <div class="w-main">
            <span class="w-emoji">{{ weather.emoji }}</span>
            <div class="w-temp">
              <b class="mono">{{ weather.tempC }}°</b>
              <span>{{ weather.desc }}</span>
            </div>
          </div>
          <div class="w-facts">
            <span>体感 {{ weather.feelsLikeC }}°</span>
            <span>💧 {{ weather.humidity }}%</span>
            <span>🌬️ {{ weather.windKmph }} km/h</span>
          </div>
          <div class="w-astro">
            <span><IconSvg name="sunrise" :size="13" /> {{ weather.sunrise }}</span>
            <span><IconSvg name="sunset" :size="13" /> {{ weather.sunset }}</span>
            <span><IconSvg name="moon" :size="13" /> {{ weather.moonPhase }}</span>
          </div>
          <div class="w-forecast">
            <div v-for="f in weather.forecast" :key="f.date" class="w-day">
              <span class="wd-label">{{ friendlyDate(f.date) }}</span>
              <span>{{ f.emoji }}</span>
              <span class="mono wd-temp">{{ f.minC }}° / {{ f.maxC }}°</span>
            </div>
          </div>
        </template>
      </section>

      <!-- 统计卡组 -->
      <div class="stat-grid">
        <RouterLink to="/games" class="stat glass-card hoverable">
          <span class="st-emoji">🎮</span>
          <div class="st-body">
            <span class="st-val"><CountUp :value="gameStats?.total ?? 0" /></span>
            <span class="st-label">游戏库 · {{ hours(gameStats ? gameStats.totalHours * 60 : 0) }}</span>
          </div>
          <span class="st-badge" v-if="gameStats">🏆 {{ gameStats.perfectCount }}</span>
        </RouterLink>

        <RouterLink to="/movies" class="stat glass-card hoverable">
          <span class="st-emoji">🎬</span>
          <div class="st-body">
            <span class="st-val"><CountUp :value="movies.length" /></span>
            <span class="st-label">影视库 · 待看 {{ wantCount }}</span>
          </div>
        </RouterLink>

        <RouterLink to="/calendar" class="stat glass-card hoverable">
          <span class="st-emoji">📅</span>
          <div class="st-body">
            <span class="st-val"><CountUp :value="todos.filter((t) => !t.done).length" /></span>
            <span class="st-label">进行中待办</span>
          </div>
          <span class="st-badge danger" v-if="todayTodos.length">{{ todayTodos.length }} 今日</span>
        </RouterLink>

        <RouterLink to="/github" class="stat glass-card hoverable">
          <span class="st-emoji">🐙</span>
          <div class="st-body">
            <span class="st-label">追更仓 · 极客雷达</span>
            <span class="st-link">去看看 →</span>
          </div>
        </RouterLink>
      </div>
    </div>

    <!-- ============ 中排：今日待办 + 近期日程 + 追剧更新 ============ -->
    <div class="mid-grid" :class="{ 'with-trakt': traktEps.length }">
      <section class="panel glass-card">
        <header class="panel-head">
          <h2>📋 今日待办</h2>
          <RouterLink to="/calendar" class="panel-more">全部 →</RouterLink>
        </header>
        <div v-if="!todos.length" class="skeleton" style="height: 52px"></div>
        <ul v-else-if="todayTodos.length" class="ht-list">
          <li v-for="t in todayTodos.slice(0, 5)" :key="t.id" class="ht-item">
            <button class="todo-check" :aria-label="`完成 ${t.title}`" @click="toggleTodo(t)"></button>
            <span class="ht-title">{{ t.title }}</span>
            <span v-if="t.dueDate.slice(0, 10) < today" class="ht-late mono">逾期</span>
          </li>
        </ul>
        <div v-else class="panel-empty">
          <span>🌿</span>
          <p>今日无待办，尽情探索吧</p>
        </div>
      </section>

      <section class="panel glass-card">
        <header class="panel-head">
          <h2>🗓️ 近期日程</h2>
          <RouterLink to="/calendar" class="panel-more">日历 →</RouterLink>
        </header>
        <div v-if="!todayEvents.length && !todos.length" class="skeleton" style="height: 52px"></div>
        <ul v-else-if="upcomingEvents.length" class="ev-list">
          <li v-for="e in upcomingEvents" :key="e.id" class="ev-item">
            <span class="ev-dot" :class="e.source"></span>
            <span class="ev-date mono">{{ friendlyDate(e.date) }}</span>
            <span class="ev-time mono" v-if="e.time">{{ e.time }}</span>
            <span class="ev-title">{{ e.title }}</span>
          </li>
        </ul>
        <div v-else class="panel-empty">
          <span>🛋️</span>
          <p>近期没有安排</p>
        </div>
      </section>

      <section v-if="traktEps.length" class="panel glass-card">
        <header class="panel-head">
          <h2>📺 追剧更新</h2>
          <RouterLink to="/calendar" class="panel-more">日历 →</RouterLink>
        </header>
        <ul class="ev-list">
          <li v-for="e in traktEps" :key="e.id" class="ev-item">
            <span class="ev-dot trakt"></span>
            <span class="ev-date mono">{{ friendlyDate(e.date) }}</span>
            <span class="ev-time mono" v-if="e.time">{{ e.time }}</span>
            <span class="ev-title">{{ e.title }}</span>
          </li>
        </ul>
        <p class="panel-note">来自 Trakt · 追的剧 7 天内的更新</p>
      </section>
    </div>

    <!-- ============ 快捷导航 ============ -->
    <section class="quick glass-card">
      <header class="panel-head">
        <h2>⚡ 快捷入口</h2>
        <RouterLink to="/links" class="panel-more">导航仓 →</RouterLink>
      </header>
      <div class="quick-grid">
        <RouterLink v-for="m in modules.filter((x) => x.name !== 'home')" :key="m.path" :to="m.path" class="quick-item">
          <span class="qi-icon">{{ m.icon }}</span>
          <span class="qi-label">{{ m.label }}</span>
          <span class="qi-desc">{{ m.desc }}</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 问候主卡（Bento 主角：全页唯一彩色卡，右下角柔光） */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 30px;
  background:
    radial-gradient(420px 200px at 92% 110%, rgba(168, 85, 247, 0.22), transparent 70%),
    linear-gradient(120deg, rgba(124, 58, 237, 0.14), rgba(56, 189, 248, 0.06) 60%, var(--card) 90%);
  overflow: hidden;
}
.hero-left {
  min-width: 0;
}
.hero-title {
  font-size: 1.9rem;
  font-weight: 750;
  letter-spacing: 0.01em;
  background: linear-gradient(115deg, #f4f5fb 40%, #c9a6ff 85%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-sub {
  margin-top: 6px;
  font-size: 0.88rem;
  color: var(--text-2);
}
.hero-sub b {
  color: var(--t-accent);
  font-family: var(--mono);
}
.hero-quote {
  margin-top: 14px;
  font-size: 0.9rem;
  color: var(--text-1);
  opacity: 0.9;
  letter-spacing: 0.02em;
}
.hero-quote-by {
  margin-left: 10px;
  font-size: 0.76rem;
  color: var(--text-3);
}
.hero-ring {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 0 18px rgba(124, 58, 237, 0.3));
}
.hero-ring-txt {
  position: absolute;
  text-align: center;
  display: grid;
  gap: 1px;
}
.hero-ring-txt b {
  font-size: 1.05rem;
  color: var(--text-1);
}
.hero-ring-txt span {
  font-size: 0.62rem;
  color: var(--text-3);
  letter-spacing: 0.12em;
}

/* 顶排 */
.top-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  align-items: stretch;
}
@media (max-width: 1020px) {
  .top-grid {
    grid-template-columns: 1fr;
  }
}

/* 天气卡 */
.weather {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: background 0.8s ease;
}
.weather-skeleton {
  display: flex;
  gap: 16px;
  align-items: center;
  min-height: 210px;
}
.weather-err {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px 0;
  color: var(--text-3);
}
.w-main {
  display: flex;
  align-items: center;
  gap: 16px;
}
.w-emoji {
  font-size: 46px;
  filter: drop-shadow(0 4px 18px rgba(168, 85, 247, 0.35));
}
.w-temp {
  display: flex;
  flex-direction: column;
}
.w-temp b {
  font-size: 2.1rem;
  font-weight: 750;
  line-height: 1.1;
}
.w-temp span {
  font-size: 0.86rem;
  color: var(--text-2);
}
.w-facts,
.w-astro {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 16px;
  font-size: 0.76rem;
  color: var(--text-2);
}
.w-astro span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.w-forecast {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  border-radius: 10px;
  background: rgba(10, 11, 18, 0.35);
}
.wd-label {
  font-size: 0.68rem;
  color: var(--text-3);
}
.wd-temp {
  font-size: 0.68rem;
  color: var(--text-2);
}

/* 统计卡组 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
@media (max-width: 560px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
}
.stat {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  color: var(--text-1);
  position: relative;
}
.st-emoji {
  font-size: 27px;
  filter: drop-shadow(0 0 12px rgba(168, 85, 247, 0.3));
}
.st-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.st-val {
  font-size: 1.55rem;
  font-weight: 750;
  line-height: 1.1;
}
.st-label {
  font-size: 0.76rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.st-link {
  font-size: 0.8rem;
  color: var(--t-accent);
}
.st-badge {
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 0.72rem;
  font-family: var(--mono);
  background: var(--warning-soft);
  color: var(--warning);
  border: 1px solid rgba(251, 191, 36, 0.25);
}
.st-badge.danger {
  background: var(--danger-soft);
  color: var(--danger);
  border-color: rgba(248, 113, 113, 0.25);
}

/* 中排 */
.mid-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .mid-grid {
    grid-template-columns: 1fr;
  }
}
.mid-grid.with-trakt {
  grid-template-columns: 1fr 1fr 1fr;
}
@media (max-width: 1100px) {
  .mid-grid.with-trakt {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 900px) {
  .mid-grid.with-trakt {
    grid-template-columns: 1fr;
  }
}
.panel {
  padding: 17px 20px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}
.panel-head h2 {
  font-size: 1rem;
}
.panel-more {
  font-size: 0.78rem;
  color: var(--text-3);
}
.panel-more:hover {
  color: var(--t-accent);
}
.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 22px 0 14px;
  color: var(--text-3);
  font-size: 0.84rem;
}
.panel-empty span {
  font-size: 26px;
}

.ht-list,
.ev-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.ht-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid transparent;
  transition: border-color var(--dur-fast);
}
.ht-item:hover {
  border-color: var(--border);
}
.todo-check {
  width: 19px;
  height: 19px;
  border-radius: 7px;
  border: 1.5px solid var(--text-3);
  background: transparent;
  flex-shrink: 0;
  transition: all var(--dur-fast);
}
.todo-check:hover {
  border-color: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
}
.ht-title {
  flex: 1;
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ht-late {
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--danger-soft);
  color: var(--danger);
}

.ev-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}
.ev-dot {
  width: 7px;
  height: 7px;
  border-radius: 99px;
  flex-shrink: 0;
}
.ev-dot.todo {
  background: #a855f7;
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.6);
}
.ev-dot.movie {
  background: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
}
.ev-dot.manual {
  background: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.6);
}
.ev-dot.trakt {
  background: #fbbf24;
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}
.panel-note {
  margin-top: 10px;
  font-size: 0.72rem;
  color: var(--text-3);
  text-align: center;
}
.ev-date {
  font-size: 0.74rem;
  color: var(--text-2);
  min-width: 52px;
}
.ev-time {
  font-size: 0.72rem;
  color: var(--text-3);
  min-width: 40px;
}
.ev-title {
  flex: 1;
  font-size: 0.86rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 快捷入口 */
.quick {
  padding: 17px 20px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-1);
  transition: all var(--dur) var(--ease);
}
.quick-item:hover {
  border-color: var(--border-strong);
  background: var(--accent-soft);
  transform: translateY(-3px);
  box-shadow: 0 12px 34px -12px rgba(0, 0, 0, 0.6), 0 0 24px -8px var(--accent-glow);
}
.qi-icon {
  font-size: 24px;
}
.qi-label {
  font-weight: 650;
  font-size: 0.94rem;
}
.qi-desc {
  font-size: 0.7rem;
  color: var(--text-3);
}
</style>
