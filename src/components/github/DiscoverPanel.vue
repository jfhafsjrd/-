<script setup>
/**
 * 🌌 库 — 每日推荐 + 主题/语言/Stars 筛选的项目发现页
 * 每个项目可 ⭐ 收藏进藏书阁
 */
import { onMounted, ref, watch } from 'vue'
import { api, img } from '@/api'
import { compactNum, friendlyDate } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import IconSvg from '@/components/common/IconSvg.vue'
import StateShell from '@/components/common/StateShell.vue'

const emit = defineEmits(['tracked'])

const toast = useToast()

/* 主题分类（topic 查询） */
const TOPIC_CATS = [
  { v: '', label: '全部', emoji: '🌐' },
  { v: 'ai', label: 'AI 机器学习', emoji: '🤖' },
  { v: 'self-hosted', label: '自托管', emoji: '🗄️' },
  { v: 'developer-tools', label: '开发工具', emoji: '🛠️' },
  { v: 'cli', label: '命令行', emoji: '⌨️' },
  { v: 'frontend', label: '前端', emoji: '🎨' },
  { v: 'privacy', label: '隐私安全', emoji: '🔒' },
  { v: 'automation', label: '自动化', emoji: '⚙️' },
  { v: 'music', label: '音乐', emoji: '🎵' },
  { v: 'game', label: '游戏', emoji: '🎮' },
]
const LANGUAGES = ['', 'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C++', 'Vue', 'Dart', 'Shell']
const STAR_LEVELS = [
  { v: '0', label: '不限' },
  { v: '100', label: '100+' },
  { v: '1000', label: '1k+' },
  { v: '5000', label: '5k+' },
  { v: '10000', label: '10k+' },
]
const RANGES = [
  { v: '', label: '全部' },
  { v: 'day', label: '今日' },
  { v: 'week', label: '本周' },
  { v: 'month', label: '本月' },
]
const SORTS = [
  { v: 'stars', label: '最多星' },
  { v: 'forks', label: '最多叉' },
  { v: 'updated', label: '最近更新' },
]
const HOT_TAGS = ['awesome', 'neovim', 'terminal', 'dashboard', 'download-manager', 'reader']

const q = ref('')
const topic = ref('')
const language = ref('')
const minStars = ref('0')
const sort = ref('stars')
const range = ref('week')
const results = ref([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const cached = ref(false)
const tracking = ref('')

/* 每日推荐 */
const daily = ref(null)
const dailyLoading = ref(true)

async function loadDaily() {
  dailyLoading.value = true
  try {
    daily.value = await api.github.daily()
  } catch {
    daily.value = null
  } finally {
    dailyLoading.value = false
  }
}

async function load(refresh = false) {
  loading.value = true
  error.value = ''
  try {
    const r = await api.github.discover({
      q: q.value,
      topic: topic.value,
      language: language.value,
      minStars: minStars.value,
      sort: sort.value,
      range: range.value,
      ...(refresh ? { refresh: '1' } : {}),
    })
    results.value = r.repos
    total.value = r.total
    cached.value = r.cached
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

let qTimer = 0
watch(q, () => {
  clearTimeout(qTimer)
  qTimer = setTimeout(load, 500)
})
watch([topic, language, minStars, sort, range], load)
onMounted(() => {
  load()
  loadDaily()
})

async function track(r) {
  tracking.value = r.fullName
  try {
    const map = { 'self-hosted': 'selfhost', cli: 'pc', 'developer-tools': 'pc', frontend: 'pc', privacy: 'pc', automation: 'pc', music: 'pc', game: 'pc', ai: 'pc' }
    const catGuess = map[topic.value] || 'pc'
    await api.github.addRepo(r.fullName, catGuess, '')
    toast.success(`已收藏 ${r.fullName} 进藏书阁`)
    emit('tracked')
  } catch (e) {
    toast.error(e.message)
  } finally {
    tracking.value = ''
  }
}

function searchTag(t) {
  q.value = t
}
</script>

<template>
  <div>
    <!-- ============ 每日推荐 ============ -->
    <section class="daily glass-card">
      <header class="daily-head">
        <h2>📅 今日推荐 <span v-if="daily" class="tag">{{ daily.theme }}</span></h2>
        <button class="btn sm" :disabled="dailyLoading" @click="loadDaily">换一批主题</button>
      </header>
      <div v-if="dailyLoading" class="daily-grid">
        <div v-for="i in 4" :key="i" class="skeleton" style="height: 108px"></div>
      </div>
      <div v-else-if="daily?.repos?.length" class="daily-grid">
        <article v-for="r in daily.repos.slice(0, 6)" :key="r.fullName" class="dc-card glass-card hoverable daily-card">
          <header class="dc-head">
            <img v-if="r.avatar" :src="img(r.avatar)" :alt="r.owner" class="dc-avatar" loading="lazy" />
            <span v-else class="dc-avatar dc-avatar-fb">📦</span>
            <a :href="`https://github.com/${r.fullName}`" target="_blank" rel="noopener" class="dc-name">{{ r.fullName }}</a>
            <button class="btn sm primary dc-track" :disabled="tracking === r.fullName" @click="track(r)">
              {{ tracking === r.fullName ? '…' : '⭐ 收藏' }}
            </button>
          </header>
          <p class="dc-desc">{{ r.description || '暂无描述' }}</p>
          <div class="dc-facts mono">
            <span class="dc-stars">★ {{ compactNum(r.stars) }}</span>
            <span v-if="r.language" class="dc-lang"><i class="lang-dot"></i>{{ r.language }}</span>
            <span class="dc-upd">{{ friendlyDate(r.updatedAt) }}</span>
          </div>
        </article>
      </div>
      <p v-else class="text-3" style="padding: 8px 0 2px; font-size: 0.84rem">今日推荐暂时不可用（GitHub 限流时可稍后再试）</p>
    </section>

    <!-- ============ 筛选与结果 ============ -->
    <div class="dc-toolbar glass-card">
      <div class="dc-search">
        <IconSvg name="search" :size="16" />
        <input v-model="q" class="dc-input" type="text" placeholder="搜仓库关键词，如：rust cli / 音乐播放器…" aria-label="搜索仓库" />
        <span v-if="cached" class="tag plain dc-cache" title="数据来自缓存，10 分钟内不重复请求 GitHub">缓存命中</span>
      </div>
      <div class="dc-cat-row">
        <button
          v-for="c in TOPIC_CATS"
          :key="c.v"
          class="chip cat"
          :class="{ on: topic === c.v }"
          @click="topic = c.v"
        >
          {{ c.emoji }} {{ c.label }}
        </button>
      </div>
      <div class="dc-filters">
        <div class="dc-chips">
          <button v-for="r in RANGES" :key="r.v" class="chip" :class="{ on: range === r.v }" @click="range = r.v">
            {{ r.label }}
          </button>
        </div>
        <select v-model="language" class="select dc-select" aria-label="语言">
          <option v-for="l in LANGUAGES" :key="l" :value="l">{{ l || '全部语言' }}</option>
        </select>
        <select v-model="minStars" class="select dc-select" aria-label="星数门槛">
          <option v-for="s in STAR_LEVELS" :key="s.v" :value="s.v">★ {{ s.label }}</option>
        </select>
        <select v-model="sort" class="select dc-select" aria-label="排序">
          <option v-for="s in SORTS" :key="s.v" :value="s.v">{{ s.label }}</option>
        </select>
      </div>
      <div class="dc-hottags">
        <span class="dc-ht-label">热门搜索</span>
        <button v-for="t in HOT_TAGS" :key="t" class="chip sm" @click="searchTag(t)"># {{ t }}</button>
      </div>
    </div>

    <StateShell :loading="loading && !results.length" :error="error" :empty="!results.length"
      empty-emoji="🔭" empty-text="没有匹配的仓库，换个筛选试试" :rows="4" @retry="load">
      <p class="dc-count text-3">
        共 <b class="mono">{{ total.toLocaleString() }}</b> 个结果{{ cached ? ' · 缓存' : '' }}
        <button class="chip sm refresh-btn" :disabled="loading" @click="load(true)" title="绕过缓存随机翻页">
          {{ loading ? '加载中…' : '🎲 换一批' }}
        </button>
      </p>
      <div class="dc-grid">
        <article v-for="r in results" :key="r.fullName" class="dc-card glass-card hoverable">
          <header class="dc-head">
            <img v-if="r.avatar" :src="img(r.avatar)" :alt="r.owner" class="dc-avatar" loading="lazy" />
            <span v-else class="dc-avatar dc-avatar-fb">📦</span>
            <a :href="`https://github.com/${r.fullName}`" target="_blank" rel="noopener" class="dc-name">
              {{ r.fullName }}
            </a>
            <button class="btn sm primary dc-track" :disabled="tracking === r.fullName" @click="track(r)">
              {{ tracking === r.fullName ? '…' : '⭐ 收藏' }}
            </button>
          </header>
          <p class="dc-desc">{{ r.description || '暂无描述' }}</p>
          <div class="dc-topics">
            <span v-for="t in r.topics" :key="t" class="tag plain">#{{ t }}</span>
          </div>
          <div class="dc-facts mono">
            <span class="dc-stars">★ {{ compactNum(r.stars) }}</span>
            <span>⑂ {{ compactNum(r.forks) }}</span>
            <span v-if="r.language" class="dc-lang"><i class="lang-dot"></i>{{ r.language }}</span>
            <span class="dc-upd">推送 {{ friendlyDate(r.updatedAt) }}</span>
          </div>
        </article>
      </div>
    </StateShell>
  </div>
</template>

<style scoped>
/* 每日推荐 */
.daily {
  padding: 16px 18px;
  margin-bottom: 16px;
  background:
    radial-gradient(500px 140px at 15% 0%, rgba(168, 85, 247, 0.08), transparent),
    var(--card);
}
.daily-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}
.daily-head h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.02rem;
}
.daily-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.daily-card {
  background: rgba(255, 255, 255, 0.02);
}

/* 工具栏 */
.dc-toolbar {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.dc-search {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-3);
}
.dc-input {
  flex: 1;
  padding: 8px 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-1);
  font-size: 0.94rem;
  min-width: 0;
}
.dc-cache {
  font-size: 0.64rem;
  flex-shrink: 0;
}
.dc-cat-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.chip.cat {
  font-size: 0.8rem;
  padding: 5px 13px;
}
.dc-filters {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.dc-chips {
  display: flex;
  gap: 6px;
}
.chip {
  padding: 4px 13px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  font-size: 0.78rem;
  transition: all var(--dur-fast);
}
.chip.on {
  color: #fff;
  background: var(--accent-grad);
  border-color: transparent;
}
.chip.sm {
  padding: 3px 10px;
  font-size: 0.72rem;
}
.dc-select {
  width: auto;
  padding: 6px 30px 6px 12px;
  font-size: 0.8rem;
}
.dc-hottags {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.dc-ht-label {
  font-size: 0.72rem;
  color: var(--text-3);
}

/* 结果 */
.dc-count {
  font-size: 0.78rem;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.refresh-btn {
  cursor: pointer;
}
.refresh-btn:hover {
  color: #c98bff;
  border-color: var(--border-strong);
}
.dc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.dc-card {
  padding: 15px 17px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.dc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.dc-avatar {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.dc-avatar-fb {
  display: grid;
  place-items: center;
  background: #1a1c2a;
}
.dc-name {
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
  font-weight: 650;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dc-name:hover {
  color: #c98bff;
}
.dc-track {
  flex-shrink: 0;
}
.dc-desc {
  font-size: 0.8rem;
  color: var(--text-2);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
}
.dc-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 4px;
}
.dc-topics .tag {
  font-size: 0.62rem;
}
.dc-facts {
  display: flex;
  align-items: center;
  gap: 13px;
  font-size: 0.73rem;
  color: var(--text-3);
  flex-wrap: wrap;
}
.dc-stars {
  color: var(--warning);
}
.dc-lang {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.lang-dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}
.dc-upd {
  margin-left: auto;
}

@media (max-width: 640px) {
  .dc-grid,
  .daily-grid {
    grid-template-columns: 1fr;
  }
  .dc-select {
    flex: 1;
  }
}
</style>
