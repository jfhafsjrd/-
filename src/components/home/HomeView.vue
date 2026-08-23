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
const today = ymd()

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
    <!-- ============ 问候区 ============ -->
    <header class="hero">
      <div>
        <h1 class="hero-title">{{ greeting() }}，探索者</h1>
        <p class="hero-sub">
          今天是 {{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}
          · 待看 <b>{{ wantCount }}</b> 部 · 待办 <b>{{ todayTodos.length }}</b> 件
        </p>
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

    <!-- ============ 中排：今日待办 + 近期日程 ============ -->
    <div class="mid-grid">
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

/* 问候 */
.hero {
  padding: 6px 2px 0;
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
  margin-top: 5px;
  font-size: 0.88rem;
  color: var(--text-2);
}
.hero-sub b {
  color: #c98bff;
  font-family: var(--mono);
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
  color: #c98bff;
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
  color: #c98bff;
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
