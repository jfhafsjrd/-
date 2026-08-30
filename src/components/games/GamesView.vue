<script setup>
/**
 * 游戏成就仓 — Steam 档案 + 统计 + 满成就荣誉墙 + 游戏库网格
 */
import { computed, onMounted, ref } from 'vue'
import { api, steamCover } from '@/api'
import { hours } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import StateShell from '@/components/common/StateShell.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import Modal from '@/components/common/Modal.vue'
import CountUp from '@/components/common/CountUp.vue'
import HonorsWall from './HonorsWall.vue'
import AchievementsModal from './AchievementsModal.vue'

const toast = useToast()

/* ---------- 状态 ---------- */
const profile = ref(null)
const stats = ref(null)
const honors = ref([])
const games = ref([])
const loading = ref(true)
const error = ref('')
const keyword = ref('')
const statusFilter = ref('')

const syncState = ref(null)
const achShow = ref(false)
const achGame = ref(null)
const editGame = ref(null) // { id, status, notes, platform }
const editSaving = ref(false)
const addShow = ref(false)
const addForm = ref({ name: '', platform: 'pc', status: 'want' })
const addSaving = ref(false)

/* ---------- 最近在玩：近两周有游玩记录的前 2 款（Steam 展示柜风） ---------- */
const recentGames = computed(() =>
  games.value
    .filter((g) => (g.playtime2weeks || 0) > 0)
    .sort((a, b) => (b.playtime2weeks || 0) - (a.playtime2weeks || 0))
    .slice(0, 2),
)
const headerImg = (g) => (g.steamAppId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.steamAppId}/header.jpg` : '')

/* ---------- 加载 ---------- */
async function load() {
  loading.value = true
  error.value = ''
  try {
    const [s, h, g] = await Promise.all([api.games.stats(), api.games.honors(), api.games.list()])
    stats.value = s
    honors.value = h
    games.value = g
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadProfile() {
  try {
    profile.value = await api.steam.profile()
  } catch {
    profile.value = null
  }
}

async function pollSync() {
  try {
    syncState.value = await api.steam.syncStatus()
  } catch {
    /* 静默 */
  }
}

onMounted(() => {
  load()
  loadProfile()
  pollSync()
})

/* ---------- 过滤 ---------- */
const filtered = computed(() => {
  let list = games.value
  if (statusFilter.value) list = list.filter((g) => g.status === statusFilter.value)
  if (keyword.value.trim()) {
    const q = keyword.value.trim().toLowerCase()
    list = list.filter((g) => g.name.toLowerCase().includes(q))
  }
  return list
})

const STATUS_META = {
  playing: { label: '在玩', cls: 'info' },
  done: { label: '通关', cls: 'success' },
  dropped: { label: '搁置', cls: 'plain' },
  want: { label: '想玩', cls: 'warning' },
}

/* ---------- 操作 ---------- */
function openAch(game) {
  achGame.value = game
  achShow.value = true
}

async function saveEdit() {
  editSaving.value = true
  try {
    const updated = await api.games.update(editGame.value.id, {
      status: editGame.value.status,
      notes: editGame.value.notes,
      platform: editGame.value.platform,
    })
    const i = games.value.findIndex((g) => g.id === updated.id)
    if (i > -1) games.value[i] = updated
    toast.success('已保存')
    editGame.value = null
    load() // 荣誉墙可能变化
  } catch (e) {
    toast.error(e.message)
  } finally {
    editSaving.value = false
  }
}

async function removeGame(g) {
  try {
    await api.games.remove(g.id)
    games.value = games.value.filter((x) => x.id !== g.id)
    toast.info(`已删除《${g.name}》`)
    load()
  } catch (e) {
    toast.error(e.message)
  }
}

async function addGame() {
  if (!addForm.value.name.trim()) {
    toast.error('游戏名不能为空')
    return
  }
  addSaving.value = true
  try {
    await api.games.add({ ...addForm.value })
    toast.success('已添加')
    addShow.value = false
    addForm.value = { name: '', platform: 'pc', status: 'want' }
    load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    addSaving.value = false
  }
}

async function triggerSync() {
  try {
    await api.steam.triggerSync()
    toast.success('Steam 同步已启动（后台进行，约 2-3 分钟）')
    pollSync()
    setInterval(pollSync, 10000)
  } catch (e) {
    toast.error(e.message)
  }
}

const syncPct = computed(() =>
  syncState.value && syncState.value.total ? Math.round((syncState.value.done / syncState.value.total) * 100) : 0,
)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">🎮 游戏成就仓</h1>
        <p class="page-sub">Steam 静默同步 · {{ games.length }} 款游戏</p>
      </div>
      <div class="head-actions">
        <button class="btn" @click="addShow = true"><IconSvg name="plus" :size="15" /> 手动添加</button>
        <button class="btn primary" :disabled="syncState?.running" @click="triggerSync">
          <IconSvg name="refresh" :size="15" />
          {{ syncState?.running ? `同步中 ${syncPct}%` : '同步 Steam' }}
        </button>
      </div>
    </div>

    <!-- 最近在玩（展示柜：header 大图压暗 + 胶囊图 + 近两周时长） -->
    <div v-if="recentGames.length" class="recent-grid" :class="{ single: recentGames.length === 1 }">
      <div v-for="g in recentGames" :key="g.id" class="recent-card glass-card" @click="openAch(g)">
        <img
          v-if="headerImg(g)"
          class="rc-bg"
          :src="steamCover(headerImg(g))"
          alt=""
          loading="lazy"
          @error="$event.target.style.display = 'none'"
        />
        <div class="rc-shade"></div>
        <img v-if="g.cover" :src="steamCover(g.cover)" :alt="g.name" class="rc-capsule" loading="lazy" />
        <div class="rc-info">
          <span class="rc-tag">🕹️ 最近在玩</span>
          <strong class="rc-name">{{ g.name }}</strong>
          <span class="rc-meta mono">近两周 {{ hours(g.playtime2weeks) }} · 总时长 {{ hours(g.playtime) }}</span>
        </div>
      </div>
    </div>

    <!-- Steam 档案条 -->
    <div v-if="profile" class="profile-bar glass-card">
      <img v-if="profile.avatar" :src="steamCover(profile.avatar)" :alt="profile.personaName" class="avatar" />
      <div v-else class="avatar avatar-fallback">🎮</div>
      <div class="p-info">
        <strong class="p-name">
          {{ profile.personaName }}
          <span class="pulse-dot" :class="{ offline: !profile.state }"></span>
        </strong>
        <span class="p-sub text-3">
          {{ syncState?.running ? `正在同步成就 ${syncState.done}/${syncState.total}…` : syncState?.lastUpdate ? `上次同步 ${new Date(syncState.lastUpdate).toLocaleString('zh-CN')}` : '尚未同步' }}
        </span>
      </div>
      <div v-if="syncState?.running" class="sync-bar">
        <div class="sync-fill" :style="{ width: syncPct + '%' }"></div>
      </div>
    </div>

    <StateShell :loading="loading" :error="error" :rows="4" @retry="load">
      <!-- 统计卡 -->
      <div v-if="stats" class="stat-row">
        <div class="stat-card glass-card">
          <span class="s-val"><CountUp :value="stats.total" /></span>
          <span class="s-label">游戏总数</span>
        </div>
        <div class="stat-card glass-card accent">
          <span class="s-val"><CountUp :value="stats.totalHours" /></span>
          <span class="s-label">总时长（小时）</span>
        </div>
        <div class="stat-card glass-card gold">
          <span class="s-val"><CountUp :value="stats.perfectCount" /></span>
          <span class="s-label">🏆 满成就</span>
        </div>
        <div class="stat-card glass-card">
          <span class="s-val"><CountUp :value="stats.statusDist.playing" /></span>
          <span class="s-label">在玩中</span>
        </div>
      </div>

      <!-- 荣誉墙 -->
      <HonorsWall :games="honors" @inspect="openAch" />

      <!-- 游戏库 -->
      <div class="lib-head">
        <div class="lib-filter">
          <button class="chip" :class="{ on: !statusFilter }" @click="statusFilter = ''">全部 {{ games.length }}</button>
          <button v-for="(m, k) in STATUS_META" :key="k" class="chip" :class="{ on: statusFilter === k }" @click="statusFilter = k">
            {{ m.label }}
          </button>
        </div>
        <div class="search-box">
          <IconSvg name="search" :size="15" />
          <input v-model="keyword" type="text" class="si" placeholder="搜游戏名…" aria-label="搜索游戏" />
        </div>
      </div>

      <div v-if="filtered.length" class="g-grid">
        <article v-for="(g, i) in filtered" :key="g.id" class="g-card glass-card hoverable stagger-item" :style="{ animationDelay: `${Math.min(i * 0.03, 0.36)}s` }">
          <img v-if="g.cover" :src="steamCover(g.cover)" :alt="g.name" loading="lazy" class="g-cover" @click="openAch(g)" />
          <div v-else class="g-cover g-fallback" @click="openAch(g)">🎮</div>
          <div class="g-body">
            <div class="g-line1">
              <h3 class="g-name" @click="openAch(g)">{{ g.name }}</h3>
              <span class="tag" :class="STATUS_META[g.status]?.cls">{{ STATUS_META[g.status]?.label || g.status }}</span>
            </div>
            <div class="g-facts mono">
              <span>⏱ {{ hours(g.playtime) }}</span>
              <span v-if="g.achTotal > 0" class="g-ach" :class="{ perfect: g.achEarned === g.achTotal }">
                🏆 {{ g.achEarned }}/{{ g.achTotal }}
              </span>
            </div>
            <div v-if="g.achTotal > 0" class="g-bar">
              <div class="g-fill" :class="{ perfect: g.achEarned === g.achTotal }" :style="{ width: (g.achEarned / g.achTotal) * 100 + '%' }"></div>
            </div>
            <div class="g-actions">
              <button class="btn sm" @click="openAch(g)">成就</button>
              <button class="btn sm" @click="editGame = { id: g.id, status: g.status, notes: g.notes || '', platform: g.platform || 'steam' }">编辑</button>
              <button v-if="!g.steamAppId" class="icon-btn danger" aria-label="删除" @click="removeGame(g)">
                <IconSvg name="trash" :size="14" />
              </button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="state-box glass-card">
        <span class="emoji">🔍</span>
        <span class="msg">没有匹配的游戏</span>
      </div>
    </StateShell>

    <AchievementsModal :show="achShow" :game="achGame" @close="achShow = false" />

    <!-- 编辑弹窗 -->
    <Modal :show="!!editGame" title="编辑游戏" width="400px" @close="editGame = null">
      <div v-if="editGame" style="display: flex; flex-direction: column; gap: 14px">
        <label class="f-label">状态
          <select v-model="editGame.status" class="select">
            <option value="playing">在玩</option>
            <option value="done">通关</option>
            <option value="dropped">搁置</option>
            <option value="want">想玩</option>
          </select>
        </label>
        <label class="f-label">平台
          <select v-model="editGame.platform" class="select">
            <option value="steam">Steam</option>
            <option value="pc">PC</option>
            <option value="mobile">手机</option>
            <option value="console">主机</option>
          </select>
        </label>
        <label class="f-label">备注
          <textarea v-model="editGame.notes" class="textarea" rows="3" maxlength="300" placeholder="随手记点什么…"></textarea>
        </label>
      </div>
      <template #footer>
        <button class="btn" @click="editGame = null">取消</button>
        <button class="btn primary" :disabled="editSaving" @click="saveEdit">{{ editSaving ? '保存中…' : '保存' }}</button>
      </template>
    </Modal>

    <!-- 手动添加 -->
    <Modal :show="addShow" title="手动添加游戏" width="400px" @close="addShow = false">
      <div style="display: flex; flex-direction: column; gap: 14px">
        <label class="f-label">游戏名
          <input v-model="addForm.name" class="input" placeholder="例如：塞尔达传说 王国之泪" @keyup.enter="addGame" />
        </label>
        <label class="f-label">平台
          <select v-model="addForm.platform" class="select">
            <option value="pc">PC</option>
            <option value="mobile">手机</option>
            <option value="console">主机</option>
          </select>
        </label>
        <label class="f-label">状态
          <select v-model="addForm.status" class="select">
            <option value="want">想玩</option>
            <option value="playing">在玩</option>
            <option value="done">通关</option>
            <option value="dropped">搁置</option>
          </select>
        </label>
      </div>
      <template #footer>
        <button class="btn" @click="addShow = false">取消</button>
        <button class="btn primary" :disabled="addSaving" @click="addGame">{{ addSaving ? '添加中…' : '添加' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 10px;
}

/* 档案条 */
.profile-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 18px;
  margin-bottom: 18px;
  position: relative;
  overflow: hidden;
}
.avatar {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  border: 2px solid var(--border-strong);
}
.avatar-fallback {
  display: grid;
  place-items: center;
  font-size: 22px;
  background: #1a1c2a;
}
.p-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.p-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.98rem;
}
.p-sub {
  font-size: 0.76rem;
}
.sync-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
}
.sync-fill {
  height: 100%;
  background: var(--accent-grad);
  box-shadow: 0 0 10px var(--accent-glow);
  transition: width 0.6s var(--ease);
}

/* 统计卡 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}
.stat-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.s-val {
  font-size: 1.7rem;
  font-weight: 750;
  line-height: 1.1;
}
.stat-card.accent .s-val {
  background: var(--accent-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.stat-card.gold .s-val {
  color: var(--warning);
  text-shadow: 0 0 18px rgba(251, 191, 36, 0.35);
}
.s-label {
  font-size: 0.76rem;
  color: var(--text-3);
}

/* 库头部 */
.lib-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.lib-filter {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 6px 15px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: rgba(10, 11, 18, 0.5);
  color: var(--text-2);
  font-size: 0.82rem;
  transition: all var(--dur-fast);
}
.chip:hover {
  color: var(--text-1);
  border-color: rgba(255, 255, 255, 0.18);
}
.chip.on {
  color: #fff;
  background: var(--accent-grad);
  border-color: transparent;
  box-shadow: 0 2px 14px -2px var(--accent-glow);
}
.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(10, 11, 18, 0.5);
  color: var(--text-3);
  width: 220px;
}
.si {
  padding: 8px 0;
  border: none;
  background: transparent;
  color: var(--text-1);
  outline: none;
  font-size: 0.86rem;
  flex: 1;
}

/* 游戏网格 */
.g-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.g-card {
  display: flex;
  gap: 13px;
  padding: 12px;
}
.g-cover {
  width: 124px;
  aspect-ratio: 460 / 215;
  object-fit: cover;
  border-radius: 9px;
  cursor: pointer;
  flex-shrink: 0;
  background: #1a1c2a;
  border: 1px solid var(--border);
  transition: border-color var(--dur-fast);
}
.g-cover:hover {
  border-color: var(--border-strong);
}
.g-fallback {
  display: grid;
  place-items: center;
  font-size: 26px;
}
.g-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.g-line1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.g-name {
  font-size: 0.92rem;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.g-name:hover {
  color: var(--t-accent);
}
.g-facts {
  display: flex;
  justify-content: space-between;
  font-size: 0.74rem;
  color: var(--text-3);
}
.g-ach.perfect {
  color: var(--warning);
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.4);
}
.g-bar {
  height: 5px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.g-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #6366f1, #a855f7);
}
.g-fill.perfect {
  background: linear-gradient(90deg, #fbbf24, #f97316);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}
.g-actions {
  display: flex;
  gap: 7px;
  margin-top: auto;
}

.f-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.84rem;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .head-actions {
    width: 100%;
  }
  .search-box {
    width: 100%;
  }
}
/* 最近在玩展示柜 */
.recent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
}
.recent-grid.single {
  grid-template-columns: 1fr;
}
.recent-card {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 14px;
  aspect-ratio: 460 / 215; /* 与 Steam header 原生比例一致，背景完整不裁剪 */
  padding: 14px 18px;
  cursor: pointer;
  overflow: hidden;
}
.rc-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(1.05);
  transition: transform 0.5s var(--ease);
}
.recent-card:hover .rc-bg {
  transform: scale(1.05);
}
.rc-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(8, 9, 14, 0.88) 22%, rgba(8, 9, 14, 0.45) 60%, rgba(8, 9, 14, 0.25));
}
.recent-card > :not(.rc-bg):not(.rc-shade) {
  position: relative;
  z-index: 1;
}
.rc-capsule {
  width: 92px;
  border-radius: 8px;
  flex-shrink: 0;
  box-shadow: 0 8px 22px -8px rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.rc-info {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: #fff;
}
.rc-tag {
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  color: #d8b4fe;
}
.rc-name {
  font-size: 1.06rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
.rc-meta {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.75);
}
@media (max-width: 760px) {
  .recent-grid {
    grid-template-columns: 1fr;
  }
}
</style>
