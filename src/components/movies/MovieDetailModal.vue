<script setup>
/** TMDB 详情弹窗 — 海报 + 简介 + 一键加入待看 */
import { ref, watch } from 'vue'
import Modal from '@/components/common/Modal.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import { tmdbPoster } from '@/api'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  show: { type: Boolean, default: false },
  item: { type: Object, default: null }, // TMDB 条目
  adding: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'add'])
const toast = useToast()
const previewFailed = ref(false)

watch(
  () => props.item?.tmdbId,
  () => (previewFailed.value = false),
)

function onImgError() {
  previewFailed.value = true
  toast.error('海报加载失败（网络受限时会出现，部署海外服务器即恢复）')
}
</script>

<template>
  <Modal :show="show && !!item" :title="item?.title || '详情'" width="640px" @close="emit('close')">
    <div v-if="item" class="detail">
      <div v-if="item.backdrop && !previewFailed" class="backdrop">
        <img :src="tmdbPoster(item.backdrop, 'w780')" :alt="item.title" loading="lazy" @error="previewFailed = true" />
        <span class="backdrop-grad"></span>
      </div>
      <div class="detail-row">
        <div class="poster">
          <div v-if="previewFailed" class="poster-fallback">🎞️</div>
          <img v-else :src="tmdbPoster(item.poster, 'w500')" :alt="item.title" @error="onImgError" />
        </div>
        <div class="info">
          <div class="badges">
            <span class="tag">{{ item.typeLabel }}</span>
            <span class="tag plain mono" v-if="item.year">{{ item.year }}</span>
            <span class="tag info mono" v-if="item.tmdbRating">★ {{ item.tmdbRating.toFixed(1) }}</span>
          </div>
          <p class="overview">{{ item.overview || '暂无简介' }}</p>
        </div>
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
      <button class="btn primary" :disabled="adding" @click="emit('add', item)">
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
</style>
