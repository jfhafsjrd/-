<script setup>
/**
 * GitHub 应用追更仓 — 仓库追踪 + Release 多平台安装包 + 极客雷达
 */
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import { compactNum, fileSize, friendlyDate } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import StateShell from '@/components/common/StateShell.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import Modal from '@/components/common/Modal.vue'
import DiscoverPanel from './DiscoverPanel.vue'
import GalaxyView from './GalaxyView.vue'

const toast = useToast()

const CATS = {
  ios: { label: 'iOS 工具', emoji: '' },
  android: { label: 'Android', emoji: '🤖' },
  pc: { label: 'PC 生产力', emoji: '🖥️' },
  selfhost: { label: '自部署', emoji: '🗄️' },
}

/* ---------- 状态 ---------- */
const tab = ref('library') // library 藏书阁 | discover 库 | galaxy 星系
const repos = ref([])
const loading = ref(true)
const error = ref('')
const catFilter = ref('')

const inputUrl = ref('')
const inputCat = ref('pc')
const adding = ref(false)

const radar = ref([])
const radarLoading = ref(false)

const relShow = ref(false)
const relRepo = ref(null)
const relList = ref([])
const relLoading = ref(false)

/* ---------- 加载 ---------- */
async function load() {
  loading.value = true
  error.value = ''
  try {
    repos.value = await api.github.repos()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadRadar() {
  radarLoading.value = true
  try {
    radar.value = await api.github.radar(3)
  } catch {
    radar.value = []
  } finally {
    radarLoading.value = false
  }
}

onMounted(() => {
  load()
  loadRadar()
})

const filtered = computed(() => (catFilter.value ? repos.value.filter((r) => r.category === catFilter.value) : repos.value))

/* ---------- 操作 ---------- */
async function addRepo() {
  if (!inputUrl.value.trim()) {
    toast.error('请先粘贴仓库链接或输入 owner/repo')
    return
  }
  adding.value = true
  try {
    await api.github.addRepo(inputUrl.value.trim(), inputCat.value, '')
    toast.success('已收进藏书阁')
    inputUrl.value = ''
    await load()
    loadRadar()
  } catch (e) {
    toast.error(e.message)
  } finally {
    adding.value = false
  }
}

async function removeRepo(r) {
  try {
    await api.github.removeRepo(r.id)
    repos.value = repos.value.filter((x) => x.id !== r.id)
    toast.info(`已移出藏书阁 ${r.owner}/${r.repo}`)
    loadRadar()
  } catch (e) {
    toast.error(e.message)
  }
}

async function openReleases(r) {
  relRepo.value = r
  relShow.value = true
  relLoading.value = true
  relList.value = []
  try {
    relList.value = await api.github.releases(r.owner, r.repo)
  } catch (e) {
    toast.error(e.message)
  } finally {
    relLoading.value = false
  }
}

function trackFromRadar(item) {
  inputUrl.value = `${item.owner}/${item.repo}`
  inputCat.value = item.category
  addRepo()
}

function moveSlider() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.gh-tabs .pill-tab.active')
    const slider = document.querySelector('.gh-tabs .pill-slider')
    if (el && slider) {
      slider.style.left = `${el.offsetLeft}px`
      slider.style.width = `${el.offsetWidth}px`
    }
  })
}
watch(tab, moveSlider)
onMounted(() => setTimeout(moveSlider, 80))
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">🐙 GitHub 藏书阁</h1>
        <p class="page-sub">藏书 {{ repos.length }} 个项目 · 每日发现 · 项目星系</p>
      </div>
      <div class="pill-tabs gh-tabs">
        <span class="pill-slider"></span>
        <button class="pill-tab" :class="{ active: tab === 'library' }" @click="tab = 'library'">📚 藏书阁</button>
        <button class="pill-tab" :class="{ active: tab === 'discover' }" @click="tab = 'discover'">🌌 库</button>
        <button class="pill-tab" :class="{ active: tab === 'galaxy' }" @click="tab = 'galaxy'">✨ 星系</button>
      </div>
    </div>

    <!-- ==================== 星系 Tab ==================== -->
    <GalaxyView v-if="tab === 'galaxy'" />

    <!-- ==================== 库（发现）Tab ==================== -->
    <DiscoverPanel v-else-if="tab === 'discover'" @tracked="load" />

    <!-- ==================== 藏书阁 Tab ==================== -->
    <template v-else>
    <!-- 添加追踪 -->
    <div class="add-bar glass-card">
      <div class="ab-input-wrap">
        <IconSvg name="link" :size="16" />
        <input
          v-model="inputUrl"
          class="ab-input"
          placeholder="粘贴仓库链接收进藏书阁（github.com/owner/repo 或 owner/repo）…"
          aria-label="仓库地址"
          @keyup.enter="addRepo"
        />
      </div>
      <select v-model="inputCat" class="select ab-cat" aria-label="分类">
        <option v-for="(c, k) in CATS" :key="k" :value="k">{{ c.label }}</option>
      </select>
      <button class="btn primary" :disabled="adding" @click="addRepo">
        {{ adding ? '校验中…' : '＋ 收进藏书阁' }}
      </button>
    </div>

    <!-- 极客雷达 -->
    <section class="radar glass-card">
      <header class="radar-head">
        <h2>🎲 极客雷达 <span class="text-3" style="font-size:0.72rem;font-weight:400">· 精选池随机推荐</span></h2>
        <button class="btn sm" :disabled="radarLoading" @click="loadRadar">
          <IconSvg name="dice" :size="14" /> 换一批
        </button>
      </header>
      <div v-if="radarLoading" class="radar-grid">
        <div v-for="i in 3" :key="i" class="skeleton" style="height: 92px"></div>
      </div>
      <div v-else-if="radar.length" class="radar-grid">
        <div v-for="p in radar" :key="p.owner + p.repo" class="radar-item">
          <div class="ri-main">
            <strong class="ri-name">{{ p.name }}</strong>
            <p class="ri-desc">{{ p.desc }}</p>
          </div>
          <button class="btn sm primary" @click="trackFromRadar(p)">追踪</button>
        </div>
      </div>
      <p v-else class="text-3 radar-empty">精选池已全部追踪，先去发现别的吧 🎉</p>
    </section>

    <!-- 追踪列表 -->
    <StateShell :loading="loading" :error="error" :empty="!repos.length" empty-emoji="🔭"
      empty-text="藏书阁还空着" empty-sub="粘贴仓库链接，或去「库」里发现好项目收藏进来" :rows="3" @retry="load">
      <div class="cat-filter">
        <button class="chip" :class="{ on: !catFilter }" @click="catFilter = ''">全部 {{ repos.length }}</button>
        <button v-for="(c, k) in CATS" :key="k" class="chip" :class="{ on: catFilter === k }" @click="catFilter = k">
          {{ c.emoji }} {{ c.label }} {{ repos.filter((r) => r.category === k).length }}
        </button>
      </div>

      <div class="repo-grid">
        <article v-for="(r, i) in filtered" :key="r.id" class="repo-card glass-card hoverable stagger-item" :style="{ animationDelay: `${Math.min(i * 0.05, 0.4)}s` }">
          <header class="rc-head">
            <a :href="`https://github.com/${r.owner}/${r.repo}`" target="_blank" rel="noopener" class="rc-name">
              <IconSvg name="external" :size="13" />
              {{ r.owner }}/{{ r.repo }}
            </a>
            <div class="rc-ops">
              <span class="tag plain">{{ CATS[r.category]?.label || '其他' }}</span>
              <button class="icon-btn danger" :aria-label="`取消追踪 ${r.repo}`" @click="removeRepo(r)">
                <IconSvg name="trash" :size="14" />
              </button>
            </div>
          </header>

          <p class="rc-desc">{{ r.info?.description || '暂无描述' }}</p>

          <div class="rc-facts mono">
            <span>★ {{ compactNum(r.info?.stars) }}</span>
            <span v-if="r.info?.language">⌁ {{ r.info.language }}</span>
            <span v-if="r.info?.pushedAt">推送 {{ friendlyDate(r.info.pushedAt) }}</span>
          </div>

          <div v-if="r.info?.error" class="rc-err">⚠️ {{ r.info.error }}</div>

          <div v-else-if="r.info?.latestRelease" class="rc-release">
            <button class="rc-rel-btn" @click="openReleases(r)">
              <span class="rc-tag mono">{{ r.info.latestRelease.tag }}</span>
              <span class="rc-rel-time">{{ friendlyDate(r.info.latestRelease.publishedAt) }}</span>
            </button>
            <div class="rc-assets">
              <a
                v-for="a in r.info.latestRelease.assets.slice(0, 4)"
                :key="a.url"
                :href="a.url"
                class="dl-btn"
                :title="`${a.name} · ${fileSize(a.size)}`"
              >
                <IconSvg name="download" :size="12" />
                {{ a.platform }}
              </a>
              <button v-if="r.info.latestRelease.assets.length > 4" class="dl-btn more" @click="openReleases(r)">
                +{{ r.info.latestRelease.assets.length - 4 }}
              </button>
            </div>
          </div>
          <div v-else class="rc-norel">尚无 Release 版本</div>
        </article>
      </div>
      <div v-if="!filtered.length" class="state-box glass-card">
        <span class="emoji">🗂️</span>
        <span class="msg">该分类下暂无追踪项目</span>
      </div>
    </StateShell>

    <!-- Release 历史 -->
    <Modal :show="relShow" :title="`${relRepo?.owner}/${relRepo?.repo} · 版本历史`" width="620px" @close="relShow = false">
      <div v-if="relLoading" style="display: flex; flex-direction: column; gap: 12px">
        <div v-for="i in 3" :key="i" class="skeleton" style="height: 110px"></div>
      </div>
      <div v-else class="rel-list">
        <section v-for="rel in relList" :key="rel.tag" class="rel-item">
          <header class="rel-head">
            <span class="rel-tag mono">{{ rel.tag }}</span>
            <time class="mono">{{ rel.publishedAt ? rel.publishedAt.slice(0, 10) : '' }}</time>
          </header>
          <pre v-if="rel.notes" class="rel-notes">{{ rel.notes }}</pre>
          <div class="rel-assets">
            <a v-for="a in rel.assets" :key="a.url" :href="a.url" class="dl-btn" :title="`${a.name} · ${fileSize(a.size)}`">
              <IconSvg name="download" :size="12" />
              {{ a.platform }} · {{ fileSize(a.size) }}
            </a>
          </div>
        </section>
      </div>
    </Modal>
    </template>
  </div>
</template>

<style scoped>
/* 添加栏 */
.add-bar {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  align-items: center;
}
.ab-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-3);
  min-width: 0;
}
.ab-input {
  flex: 1;
  padding: 9px 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-1);
  font-size: 0.9rem;
  min-width: 0;
}
.ab-cat {
  width: 130px;
  flex-shrink: 0;
}

/* 雷达 */
.radar {
  padding: 16px 18px;
  margin-bottom: 18px;
  background:
    radial-gradient(400px 120px at 85% 0%, rgba(99, 102, 241, 0.09), transparent),
    var(--card);
}
.radar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.radar-head h2 {
  font-size: 1rem;
}
.radar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}
.radar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed rgba(168, 85, 247, 0.3);
  background: rgba(168, 85, 247, 0.05);
}
.ri-main {
  flex: 1;
  min-width: 0;
}
.ri-name {
  font-size: 0.92rem;
  display: block;
  margin-bottom: 3px;
}
.ri-desc {
  font-size: 0.78rem;
  color: var(--text-2);
  line-height: 1.5;
}
.radar-empty {
  text-align: center;
  padding: 10px 0 4px;
  font-size: 0.86rem;
}

/* 分类过滤 */
.cat-filter {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.chip {
  padding: 5px 14px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  font-size: 0.8rem;
  transition: all var(--dur-fast);
}
.chip.on {
  color: #fff;
  background: var(--accent-grad);
  border-color: transparent;
}

/* 仓库卡片 */
.repo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 14px;
}
.repo-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.rc-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.94rem;
  font-weight: 650;
  color: var(--text-1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-name:hover {
  color: var(--t-accent);
}
.rc-ops {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.rc-desc {
  font-size: 0.8rem;
  color: var(--text-2);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
}
.rc-facts {
  display: flex;
  gap: 14px;
  font-size: 0.74rem;
  color: var(--text-3);
}
.rc-facts span:first-child {
  color: var(--warning);
}
.rc-err {
  font-size: 0.78rem;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  padding: 8px 12px;
}
.rc-release {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  margin-top: auto;
}
.rc-rel-btn {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-1);
  padding: 0;
  margin-bottom: 9px;
  cursor: pointer;
  text-align: left;
}
.rc-rel-btn:hover .rc-tag {
  text-decoration: underline;
}
.rc-tag {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--t-accent);
}
.rc-rel-time {
  font-size: 0.72rem;
  color: var(--text-3);
}
.rc-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 8px;
  font-size: 0.74rem;
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--t-lavender);
  border: 1px solid rgba(168, 85, 247, 0.3);
  transition: all var(--dur-fast);
}
.dl-btn:hover {
  background: rgba(168, 85, 247, 0.25);
  box-shadow: 0 0 14px -3px var(--accent-glow);
}
.dl-btn.more {
  background: transparent;
  color: var(--text-2);
  border-style: dashed;
}
.rc-norel {
  font-size: 0.78rem;
  color: var(--text-3);
  border-top: 1px solid var(--border);
  padding-top: 10px;
  margin-top: auto;
}

/* Release 弹窗 */
.rel-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rel-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.rel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 9px;
}
.rel-tag {
  font-size: 1rem;
  font-weight: 700;
  color: var(--t-accent);
}
.rel-head time {
  font-size: 0.72rem;
  color: var(--text-3);
}
.rel-notes {
  font-family: var(--font);
  font-size: 0.78rem;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
  background: rgba(10, 11, 18, 0.4);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  line-height: 1.6;
}
.rel-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 640px) {
  .add-bar {
    flex-wrap: wrap;
  }
  .ab-input-wrap {
    width: 100%;
    flex-basis: 100%;
  }
  .repo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
