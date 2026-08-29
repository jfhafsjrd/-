<script setup>
/**
 * 日历 + 待办 — 自绘 CSS Grid 月历（事件三色来源）+ 待办工作台
 * 联动：待办有截止日 → 自动出现在日历；影视预约 → 自动出现在日历
 */
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import { ymd, friendlyDate } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import Modal from '@/components/common/Modal.vue'
import IconSvg from '@/components/common/IconSvg.vue'

const toast = useToast()

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const CATS = {
  work: { label: '工作', emoji: '💼', cls: '' },
  study: { label: '学习', emoji: '📚', cls: 'info' },
  life: { label: '生活', emoji: '🌿', cls: 'success' },
  health: { label: '健康', emoji: '💪', cls: 'warning' },
}
const SOURCE_META = {
  todo: { label: '待办', cls: 'todo' },
  movie: { label: '影视', cls: 'movie' },
  manual: { label: '日程', cls: 'manual' },
  trakt: { label: '追剧', cls: 'trakt' },
}

/* ---------- 状态 ---------- */
const today = ymd() // 今日聚焦与逾期判断共用的今天
const cursor = ref(new Date()) // 当前月游标
const eventsByDate = ref({})
const eventsLoading = ref(true)
const eventsError = ref('')
const todos = ref([])
const todosLoading = ref(true)
const todoFilter = ref('active') // all | active | done
const view = ref('month') // month | week

const selectedDate = ref(ymd())
const dayModal = ref(false)
const eventForm = ref({ title: '', time: '' })
const eventSaving = ref(false)
const quickAdd = ref({ title: '', category: 'life', dueDate: '' })
const quickSaving = ref(false)

/* ---------- 日历格子 ---------- */
const cells = computed(() => {
  const y = cursor.value.getFullYear()
  const m = cursor.value.getMonth()
  const first = new Date(y, m, 1)
  const startOffset = (first.getDay() + 6) % 7 // 周一为首
  const start = new Date(y, m, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return {
      date: ymd(d),
      day: d.getDate(),
      inMonth: d.getMonth() === m,
      isToday: ymd(d) === ymd(),
      isWeekend: [0, 6].includes(d.getDay()),
    }
  })
})

const weekCells = computed(() => {
  const base = new Date(selectedDate.value + 'T00:00:00')
  const offset = (base.getDay() + 6) % 7
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return {
      date: ymd(d),
      day: d.getDate(),
      weekday: WEEK[i],
      isToday: ymd(d) === ymd(),
    }
  })
})

const monthLabel = computed(() => `${cursor.value.getFullYear()} 年 ${cursor.value.getMonth() + 1} 月`)

/* ---------- 数据加载 ---------- */
const DAY = 86400_000

/** Trakt 追剧日历：跨月窗口最长约 55 天，API 单次上限 33 天，分两窗拉取 */
async function loadTraktCalendar(from, to) {
  const fromDate = new Date(from + 'T00:00:00')
  const spanDays = Math.ceil((new Date(to + 'T00:00:00') - fromDate) / DAY) + 1
  if (spanDays <= 0) return []
  const windows = []
  for (let offset = 0; offset < spanDays; offset += 33) {
    const start = ymd(new Date(fromDate.getTime() + offset * DAY))
    windows.push(api.trakt.calendar(start, Math.min(33, spanDays - offset)))
  }
  const results = await Promise.all(windows.map((p) => p.catch(() => ({ episodes: [] }))))
  return results.flatMap((r) => r.episodes || [])
}

async function loadEvents() {
  eventsLoading.value = true
  eventsError.value = ''
  try {
    const y = cursor.value.getFullYear()
    const m = cursor.value.getMonth()
    const from = ymd(new Date(y, m, -7))
    const to = ymd(new Date(y, m + 1, 14))
    const [list, episodes] = await Promise.all([api.events.list({ from, to }), loadTraktCalendar(from, to)])
    const map = {}
    for (const ev of [...list, ...episodes]) (map[ev.date] ||= []).push(ev)
    eventsByDate.value = map
  } catch (e) {
    eventsError.value = e.message
  } finally {
    eventsLoading.value = false
  }
}

async function loadTodos() {
  todosLoading.value = true
  try {
    todos.value = await api.todos.list()
  } catch {
    /* 首页也有提示 */
  } finally {
    todosLoading.value = false
  }
}

onMounted(() => {
  loadEvents()
  loadTodos()
  setTimeout(moveSlider, 80)
})
watch(cursor, loadEvents, { deep: true })
watch(view, moveSlider)

function moveSlider() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.cal-view-tabs .pill-tab.active')
    const slider = document.querySelector('.cal-view-tabs .pill-slider')
    if (el && slider) {
      slider.style.left = `${el.offsetLeft}px`
      slider.style.width = `${el.offsetWidth}px`
    }
  })
}

/* ---------- 导航 ---------- */
function shiftMonth(n) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + n, 1)
}
function goToday() {
  cursor.value = new Date()
  selectedDate.value = ymd()
}

/* ---------- 待办 ---------- */
const filteredTodos = computed(() => {
  let list = todos.value
  if (todoFilter.value === 'active') list = list.filter((t) => !t.done)
  else if (todoFilter.value === 'done') list = list.filter((t) => t.done)
  return list
})

async function addTodo() {
  const t = quickAdd.value
  if (!t.title.trim()) {
    toast.error('待办内容不能为空')
    return
  }
  quickSaving.value = true
  try {
    await api.todos.add({
      title: t.title.trim(),
      category: t.category,
      dueDate: t.dueDate ? `${t.dueDate} 09:00` : '',
    })
    quickAdd.value = { title: '', category: t.category, dueDate: t.dueDate }
    toast.success('待办已添加' + (t.dueDate ? '，日历同步 📅' : ''))
    await Promise.all([loadTodos(), loadEvents()])
  } catch (e) {
    toast.error(e.message)
  } finally {
    quickSaving.value = false
  }
}

async function toggleTodo(t) {
  try {
    const updated = await api.todos.toggle(t.id)
    const i = todos.value.findIndex((x) => x.id === t.id)
    if (i > -1) todos.value[i] = updated
    if (updated.done) loadEvents()
  } catch (e) {
    toast.error(e.message)
  }
}

async function removeTodo(t) {
  try {
    await api.todos.remove(t.id)
    todos.value = todos.value.filter((x) => x.id !== t.id)
    loadEvents()
  } catch (e) {
    toast.error(e.message)
  }
}

function isOverdue(t) {
  return !t.done && t.dueDate && t.dueDate.slice(0, 10) < ymd()
}

/* ---------- 日程 ---------- */
function openDay(date) {
  selectedDate.value = date
  dayModal.value = true
}

const dayEvents = computed(() => eventsByDate.value[selectedDate.value] || [])

/* ---------- 今日聚焦：今天的事项按时间排序，已过时间灰化 ---------- */
const nowHM = computed(() => new Date().toTimeString().slice(0, 5))
const todayFocus = computed(() => {
  const evs = (eventsByDate.value[today] || []).slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
  const todoItems = todos.value
    .filter((t) => !t.done && t.dueDate && t.dueDate.slice(0, 10) === today)
    .map((t) => ({ id: `ft-${t.id}`, title: t.title, time: (t.dueDate || '').slice(11, 16), source: 'todo' }))
  return { items: [...todoItems, ...evs].slice(0, 8), now: nowHM.value }
})

async function addEvent() {
  const f = eventForm.value
  if (!f.title.trim()) {
    toast.error('日程标题不能为空')
    return
  }
  eventSaving.value = true
  try {
    await api.events.add({ title: f.title.trim(), date: selectedDate.value, time: f.time })
    eventForm.value = { title: '', time: '' }
    toast.success('日程已添加')
    await loadEvents()
  } catch (e) {
    toast.error(e.message)
  } finally {
    eventSaving.value = false
  }
}

async function removeEvent(ev) {
  try {
    await api.events.remove(ev.id)
    await loadEvents()
    toast.info('已删除')
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">📅 日历 · 待办</h1>
        <p class="page-sub">待办截止、影视预约、日程安排 一屏聚合</p>
      </div>
      <div class="pill-tabs cal-view-tabs">
        <span class="pill-slider"></span>
        <button class="pill-tab" :class="{ active: view === 'month' }" @click="view = 'month'">月视图</button>
        <button class="pill-tab" :class="{ active: view === 'week' }" @click="view = 'week'">周视图</button>
      </div>
    </div>

    <!-- ============ 今日聚焦条 ============ -->
    <section v-if="todayFocus.items.length" class="focus-bar glass-card">
      <span class="fb-date mono">{{ today.slice(5) }}</span>
      <span class="fb-label">今天</span>
      <div class="fb-items">
        <span
          v-for="ev in todayFocus.items"
          :key="ev.id"
          class="fb-item"
          :class="[SOURCE_META[ev.source]?.cls, { past: ev.time && ev.time < new Date().toTimeString().slice(0, 5) }]"
        >
          <i v-if="ev.time" class="mono">{{ ev.time }}</i>
          {{ ev.title }}
        </span>
      </div>
    </section>

    <div class="layout">
      <!-- ============ 日历 ============ -->
      <section class="cal glass-card">
        <header class="cal-head">
          <button class="icon-btn" aria-label="上个月" @click="shiftMonth(-1)">
            <IconSvg name="chevronLeft" :size="18" />
          </button>
          <div class="cal-title">
            <h2>{{ monthLabel }}</h2>
            <button class="btn sm today-btn" @click="goToday">今天</button>
          </div>
          <button class="icon-btn" aria-label="下个月" @click="shiftMonth(1)">
            <IconSvg name="chevronRight" :size="18" />
          </button>
        </header>

        <div v-if="eventsLoading" class="cal-skeleton">
          <div v-for="i in 42" :key="i" class="skeleton cal-sk-cell"></div>
        </div>

        <!-- 月视图 -->
        <template v-else>
          <div class="cal-week">
            <span v-for="w in WEEK" :key="w" class="cal-week-name">{{ w }}</span>
          </div>
          <div class="cal-grid">
            <button
              v-for="c in cells"
              :key="c.date"
              class="cal-cell"
              :class="{ out: !c.inMonth, today: c.isToday, selected: c.date === selectedDate && view === 'month' }"
              @click="openDay(c.date)"
            >
              <span class="cal-day" :class="{ weekend: c.isWeekend }">
                {{ c.day }}
                <i v-if="c.isToday" class="today-dot"></i>
              </span>
              <span class="cal-events">
                <i
                  v-for="ev in (eventsByDate[c.date] || []).slice(0, 3)"
                  :key="ev.id"
                  class="cal-ev"
                  :class="SOURCE_META[ev.source]?.cls"
                >
                  {{ ev.time ? ev.time + ' ' : '' }}{{ ev.title }}
                </i>
                <i v-if="(eventsByDate[c.date] || []).length > 3" class="cal-ev more">
                  +{{ eventsByDate[c.date].length - 3 }} 更多
                </i>
              </span>
            </button>
          </div>

          <!-- 周视图 -->
          <div v-if="view === 'week'" class="week-panel">
            <div v-for="w in weekCells" :key="w.date" class="week-col" :class="{ today: w.isToday }">
              <header class="wk-head">
                <b>{{ w.day }}</b>
                <span class="wk-name">{{ w.weekday }}</span>
              </header>
              <div class="wk-events">
                <span v-for="ev in eventsByDate[w.date] || []" :key="ev.id" class="wk-ev" :class="SOURCE_META[ev.source]?.cls">
                  {{ ev.time ? ev.time : '全天' }} · {{ ev.title }}
                </span>
                <span v-if="!(eventsByDate[w.date] || []).length" class="wk-empty">—</span>
              </div>
            </div>
          </div>
        </template>

        <footer class="cal-legend">
          <span class="lg"><i class="lg-dot todo"></i>待办</span>
          <span class="lg"><i class="lg-dot movie"></i>影视预约</span>
          <span class="lg"><i class="lg-dot manual"></i>自定义日程</span>
          <span class="lg"><i class="lg-dot trakt"></i>Trakt 追剧</span>
        </footer>
      </section>

      <!-- ============ 待办面板 ============ -->
      <aside class="todo-panel glass-card">
        <header class="tp-head">
          <h2>✅ 待办</h2>
          <div class="tp-filter">
            <button class="chip" :class="{ on: todoFilter === 'active' }" @click="todoFilter = 'active'">进行中</button>
            <button class="chip" :class="{ on: todoFilter === 'done' }" @click="todoFilter = 'done'">已完成</button>
            <button class="chip" :class="{ on: todoFilter === 'all' }" @click="todoFilter = 'all'">全部</button>
          </div>
        </header>

        <div class="qa">
          <input
            v-model="quickAdd.title"
            class="input qa-title"
            placeholder="添加待办，如：看完三体第3集…"
            aria-label="待办内容"
            @keyup.enter="addTodo"
          />
          <div class="qa-row">
            <div class="qa-cats">
              <button
                v-for="(c, k) in CATS"
                :key="k"
                class="chip sm"
                :class="{ on: quickAdd.category === k }"
                @click="quickAdd.category = k"
              >
                {{ c.emoji }} {{ c.label }}
              </button>
            </div>
            <input v-model="quickAdd.dueDate" type="date" class="input qa-date" aria-label="截止日期" />
          </div>
          <button class="btn primary qa-btn" :disabled="quickSaving" @click="addTodo">
            {{ quickSaving ? '添加中…' : '＋ 添加待办' }}
          </button>
        </div>

        <div v-if="todosLoading" style="display: flex; flex-direction: column; gap: 10px; margin-top: 14px">
          <div v-for="i in 4" :key="i" class="skeleton" style="height: 58px"></div>
        </div>

        <ul v-else-if="filteredTodos.length" class="todo-list">
          <li
            v-for="t in filteredTodos"
            :key="t.id"
            class="todo-item"
            :class="{ done: t.done, overdue: isOverdue(t) }"
          >
            <button class="todo-check" :class="{ checked: t.done }" :aria-label="t.done ? '标记未完成' : '标记完成'" @click="toggleTodo(t)">
              <IconSvg v-if="t.done" name="check" :size="12" />
            </button>
            <div class="todo-main">
              <span class="todo-title">{{ t.title }}</span>
              <span class="todo-meta">
                <i class="tag" :class="CATS[t.category]?.cls">{{ CATS[t.category]?.label || t.category }}</i>
                <span v-if="t.dueDate" class="todo-due mono" :class="{ late: isOverdue(t) }">
                  {{ isOverdue(t) ? '逾期 ' : '' }}{{ friendlyDate(t.dueDate) }}
                </span>
              </span>
            </div>
            <button class="icon-btn danger" aria-label="删除待办" @click="removeTodo(t)">
              <IconSvg name="trash" :size="14" />
            </button>
          </li>
        </ul>

        <div v-else class="tp-empty">
          <span>🌿</span>
          <p>{{ todoFilter === 'done' ? '还没有完成记录' : '清爽，没有待办' }}</p>
        </div>
      </aside>
    </div>

    <!-- ============ 当日详情弹窗 ============ -->
    <Modal :show="dayModal" :title="`${selectedDate} 的安排`" width="460px" @close="dayModal = false">
      <div class="dm">
        <div class="dm-list">
          <div v-if="!dayEvents.length" class="dm-none">这一天暂无安排</div>
          <div v-for="ev in dayEvents" :key="ev.id" class="dm-ev" :class="SOURCE_META[ev.source]?.cls">
            <span class="dm-time mono">{{ ev.time || '全天' }}</span>
            <span class="dm-title">{{ ev.title }}</span>
            <span class="tag plain">{{ SOURCE_META[ev.source]?.label }}</span>
            <button
              v-if="ev.source === 'manual'"
              class="icon-btn danger"
              aria-label="删除日程"
              @click="removeEvent(ev)"
            >
              <IconSvg name="trash" :size="13" />
            </button>
          </div>
        </div>
        <div class="dm-add">
          <input v-model="eventForm.title" class="input" placeholder="新增日程标题…" aria-label="日程标题" @keyup.enter="addEvent" />
          <input v-model="eventForm.time" type="time" class="input dm-time-input" aria-label="时间" />
          <button class="btn primary" :disabled="eventSaving" @click="addEvent">添加</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 18px;
  align-items: start;
}
@media (max-width: 1020px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

/* ---------- 日历 ---------- */
.cal {
  padding: 18px 20px;
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.cal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cal-title h2 {
  font-size: 1.12rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin-bottom: 6px;
}
.cal-week-name {
  text-align: center;
  font-size: 0.76rem;
  color: var(--text-3);
  padding: 4px 0;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.cal-cell {
  position: relative;
  min-height: 86px;
  padding: 7px 8px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.022);
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  color: var(--text-1);
  transition: all var(--dur-fast);
  overflow: hidden;
}
.cal-cell:hover {
  background: rgba(255, 255, 255, 0.055);
  border-color: var(--border);
}
.cal-cell.out {
  opacity: 0.38;
}
.cal-cell.today {
  border-color: var(--border-strong);
  background: var(--accent-soft);
}
.cal-cell.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.18);
}
.cal-day {
  font-size: 0.84rem;
  font-family: var(--mono);
  display: flex;
  align-items: center;
  gap: 5px;
}
.cal-day.weekend {
  color: var(--danger);
}
.today-dot {
  width: 5px;
  height: 5px;
  border-radius: 99px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}
.cal-events {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cal-ev {
  font-size: 0.66rem;
  line-height: 1.35;
  padding: 2px 6px;
  border-radius: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-left: 2px solid transparent;
}
.cal-ev.todo {
  background: rgba(168, 85, 247, 0.12);
  border-left-color: #a855f7;
  color: var(--t-lavender);
}
.cal-ev.movie {
  background: rgba(56, 189, 248, 0.12);
  border-left-color: #38bdf8;
  color: var(--info);
}
.cal-ev.manual {
  background: rgba(52, 211, 153, 0.12);
  border-left-color: #34d399;
  color: var(--success);
}
.cal-ev.trakt {
  background: rgba(251, 191, 36, 0.12);
  border-left-color: #fbbf24;
  color: var(--warning);
}
.cal-ev.more {
  color: var(--text-3);
}
.cal-skeleton {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.cal-sk-cell {
  min-height: 86px;
  border-radius: 10px;
}

/* 周视图 */
.week-panel {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.week-col {
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
  min-height: 150px;
}
.week-col.today {
  background: var(--accent-soft);
}
.wk-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}
.wk-head b {
  font-size: 1.15rem;
  font-family: var(--mono);
}
.wk-name {
  font-size: 0.7rem;
  color: var(--text-3);
}
.wk-events {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.wk-ev {
  font-size: 0.7rem;
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}
.wk-ev.todo {
  background: rgba(168, 85, 247, 0.14);
}
.wk-ev.movie {
  background: rgba(56, 189, 248, 0.14);
}
.wk-ev.manual {
  background: rgba(52, 211, 153, 0.14);
}
.wk-ev.trakt {
  background: rgba(251, 191, 36, 0.14);
  border-left-color: #fbbf24;
}
.wk-empty {
  font-size: 0.7rem;
  color: var(--text-3);
  text-align: center;
  padding: 8px 0;
}

.cal-legend {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.lg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  color: var(--text-3);
}
.lg-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}
.lg-dot.todo {
  background: #a855f7;
}
.lg-dot.movie {
  background: #38bdf8;
}
.lg-dot.manual {
  background: #34d399;
}
.lg-dot.trakt {
  background: #fbbf24;
}

/* ---------- 待办面板 ---------- */
.todo-panel {
  padding: 18px;
  position: sticky;
  top: 20px;
}
.tp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.tp-head h2 {
  font-size: 1.02rem;
}
.tp-filter {
  display: flex;
  gap: 6px;
}
.chip {
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  font-size: 0.76rem;
  transition: all var(--dur-fast);
}
.chip.sm {
  padding: 3px 10px;
  font-size: 0.72rem;
}
.chip.on {
  color: #fff;
  background: var(--accent-grad);
  border-color: transparent;
}
.qa {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(10, 11, 18, 0.45);
  border: 1px solid var(--border);
}
.qa-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.qa-cats {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.qa-date {
  width: 138px;
  padding: 5px 10px;
  font-size: 0.8rem;
}
.qa-btn {
  width: 100%;
}

.todo-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  transition: all var(--dur-fast);
}
.todo-item:hover {
  border-color: rgba(255, 255, 255, 0.14);
}
.todo-item.done {
  opacity: 0.5;
}
.todo-item.done .todo-title {
  text-decoration: line-through;
}
.todo-item.overdue {
  border-color: rgba(248, 113, 113, 0.3);
}
.todo-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border-radius: 7px;
  border: 1.5px solid var(--text-3);
  background: transparent;
  display: grid;
  place-items: center;
  color: #fff;
  transition: all var(--dur-fast);
}
.todo-check:hover {
  border-color: var(--accent);
}
.todo-check.checked {
  background: var(--accent-grad);
  border-color: transparent;
  box-shadow: 0 0 10px var(--accent-glow);
}
.todo-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.todo-title {
  font-size: 0.88rem;
  line-height: 1.4;
  word-break: break-all;
}
.todo-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.todo-meta .tag {
  font-size: 0.64rem;
}
.todo-due {
  font-size: 0.7rem;
  color: var(--text-3);
}
.todo-due.late {
  color: var(--danger);
}
.tp-empty {
  text-align: center;
  padding: 30px 0 20px;
  color: var(--text-3);
}
.tp-empty span {
  font-size: 30px;
  display: block;
  margin-bottom: 6px;
}
.tp-empty p {
  font-size: 0.84rem;
}

/* ---------- 当日弹窗 ---------- */
.dm {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dm-none {
  text-align: center;
  color: var(--text-3);
  padding: 14px 0;
  font-size: 0.88rem;
}
.dm-ev {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 2.5px solid transparent;
}
.dm-ev.todo {
  border-left-color: #a855f7;
}
.dm-ev.movie {
  border-left-color: #38bdf8;
}
.dm-ev.manual {
  border-left-color: #34d399;
}
.dm-ev.trakt {
  border-left-color: #fbbf24;
}
.dm-time {
  font-size: 0.74rem;
  color: var(--text-3);
  min-width: 42px;
}
.dm-title {
  flex: 1;
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dm-add {
  display: flex;
  gap: 8px;
}
.dm-time-input {
  width: 108px;
}
/* 今日聚焦条 */
.focus-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  margin-bottom: 16px;
  overflow-x: auto;
}
.fb-date {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--t-accent);
}
.fb-label {
  font-size: 0.7rem;
  color: var(--text-3);
  border: 1px solid var(--border-strong);
  border-radius: 99px;
  padding: 2px 10px;
  flex-shrink: 0;
}
.fb-items {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.fb-item {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.8rem;
  padding: 6px 12px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.04);
  border-left: 2px solid transparent;
  white-space: nowrap;
}
.fb-item i {
  font-size: 0.7rem;
  color: var(--text-3);
  font-style: normal;
}
.fb-item.past {
  opacity: 0.42;
  text-decoration: line-through;
}
.fb-item.todo {
  border-left-color: #a855f7;
}
.fb-item.movie {
  border-left-color: #38bdf8;
}
.fb-item.manual {
  border-left-color: #34d399;
}
.fb-item.trakt {
  border-left-color: #fbbf24;
}
</style>
