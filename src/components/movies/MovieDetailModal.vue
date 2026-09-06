<script setup>
/** TMDB 详情弹窗 — 海报 + 简介 + 一键入库 + "如果你喜欢"相似推荐 */
import { computed, ref, watch } from 'vue'
import Modal from '@/components/common/Modal.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import { api, tmdbPoster } from '@/api'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  show: { type: Boolean, default: false },
  item: { type: Object, default: null }, // TMDB 条目
  adding: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'add'])
const toast = useToast()
const previewFailed = ref(false)
const similar = ref([])
const simLoading = ref(false)
const activeTmdbId = ref(0) // 当前弹窗展示的条目（可被推荐切换）

const display = computed(() => {
  /* 相似推荐切换后：activeTmdbId 指向新条目 */
  if (activeTmdbId.value && similar.value.length) {
    return similar.value.find((s) => s.tmdbId === activeTmdbId.value) || props.item
  }
  return props.item
})

watch(
  () => props.item?.tmdbId,
  async (id) => {
    previewFailed.value = false
    activeTmdbId.value = 0
    similar.value = []
    if (id && props.show) await loadSimilar(id)
  },
)
watch(
  () => props.show,
  async (v) => {
    if (v && props.item?.tmdbId && !similar.value.length) await loadSimilar(props.item.tmdbId)
  },
)

async function loadSimilar(id) {
  simLoading.value = true
  try {
    similar.value = await api.movies.similar(id, props.item?.mediaType === 'tv' || props.item?.typeLabel === '剧集' ? 'tv' : 'movie')
  } catch {
    similar.value = []
  } finally {
    simLoading.value = false
  }
}

function pickSimilar(s) {
  activeTmdbId.value = s.tmdbId
  previewFailed.value = false
}

function onImgError() {
  previewFailed.value = true
  toast.error('海报加载失败（网络受限时会出现，部署海外服务器即恢复）')
}
</script>

<template>
  <Modal :show="show && !!display" :title="display?.title || '详情'" width="640px" @close="emit('close')">
    <div v-if="display" class="detail">
      <div v-if="item.backdrop && !previewFailed" class="backdrop">
        <img :src="tmdbPoster(display.backdrop, 'w780')" :alt="display.title" loading="lazy" @error="previewFailed = true" />
        <span class="backdrop-grad"></span>
      </div>
      <div class="detail-row">
        <div class="poster">
          <div v-if="previewFailed" class="poster-fallback">🎞️</div>
          <img v-else :src="tmdbPoster(display.poster, 'w500')" :alt="display.title" @error="onImgError" />
        </div>
        <div class="info">
          <div class="badges">
            <span class="tag">{{ display.typeLabel }}</span>
            <span class="tag plain mono" v-if="display.year">{{ display.year }}</span>
            <span class="tag info mono" v-if="display.tmdbRating">★ {{ display.tmdbRating.toFixed(1) }}</span>
          </div>
          <p class="overview">{{ display.overview || '暂无简介' }}</p>
        </div>
      </div>

      <!-- 相似推荐：如果你喜欢 -->
      <div v-if="similar.length && activeTmdbId" class="similar">
        <header class="sim-head">
          <span class="sim-title">如果你喜欢《{{ item.title }}》</span>
          <button class="sim-back" @click="activeTmdbId = 0">← 返回</button>
        </header>
        <div class="sim-grid">
          <button v-for="s in similar" :key="s.tmdbId" class="sim-card" :class="{ on: s.tmdbId === activeTmdbId }" @click="pickSimilar(s)">
            <img :src="tmdbPoster(s.poster, 'w185')" :alt="s.title" loading="lazy" />
            <span class="sim-name">{{ s.title }}</span>
            <span class="sim-rate mono">★ {{ s.tmdbRating.toFixed(1) }}</span>
          </button>
        </div>
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
      <button class="btn success-btn" :disabled="adding" @click="emit('add', display, 'done')">✓ 已看完</button>
      <button class="btn primary" :disabled="adding" @click="emit('add', display, 'want')">
        <IconSvg v-if="!adding" name="plus" :size="15" />
        <span v-else>加入中…</span>
        {{ adding ? '' : '加入我的待看' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* 大图头部：剧照横幅 + 底部渐变过渡 */
.backdrop {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 16 / 6.5;
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.backdrop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.backdrop-grad {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 55%, rgba(10, 11, 16, 0.72));
}
.detail-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
}
.poster {
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.poster-fallback {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 44px;
  opacity: 0.5;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.success-btn {
  background: var(--success-soft);
  color: var(--success);
  border-color: rgba(52, 211, 153, 0.4);
}
.success-btn:hover {
  background: var(--success);
  color: #fff;
}
.overview {
  font-size: 0.9rem;
  color: var(--text-2);
  line-height: 1.75;
  display: -webkit-box;
  -webkit-line-clamp: 9;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@media (max-width: 560px) {
  .detail-row {
    grid-template-columns: 1fr;
  }
  .poster {
    max-width: 200px;
  }
}

.similar {
  margin-top: 18px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
.sim-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sim-title {
  font-size: 0.82rem;
  color: var(--text-2);
}
.sim-back {
  border: none;
  background: none;
  color: var(--t-accent);
  font-size: 0.76rem;
  cursor: pointer;
}
.sim-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.sim-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: none;
  padding: 6px;
  cursor: pointer;
  display: grid;
  gap: 4px;
  transition: border-color var(--dur-fast), transform var(--dur-fast);
}
.sim-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
}
.sim-card.on {
  border-color: var(--accent);
  box-shadow: var(--glow-soft);
}
.sim-card img {
  width: 100%;
  aspect-ratio: 2/3;
  object-fit: cover;
  border-radius: 7px;
}
.sim-name {
  font-size: 0.68rem;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sim-rate {
  font-size: 0.62rem;
  color: var(--text-3);
}
@media (max-width: 560px) {
  .sim-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
