<script setup>
/** 成就明细弹窗 — 缓存命中秒开，未命中现场拉取（含中文名），骨架屏过渡 */
import { ref, watch } from 'vue'
import Modal from '@/components/common/Modal.vue'
import { api, img } from '@/api'

const props = defineProps({
  show: { type: Boolean, default: false },
  game: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const loading = ref(false)
const error = ref('')
const items = ref([])
const earned = ref(0)
const total = ref(0)

watch(
  () => props.show,
  async (v) => {
    if (!v || !props.game) return
    loading.value = true
    error.value = ''
    items.value = []
    try {
      if (props.game.steamAppId) {
        const res = await api.steam.achievements(props.game.steamAppId)
        items.value = res.items || []
        earned.value = res.earned
        total.value = res.total
      } else {
        error.value = '手动添加的游戏暂无成就数据'
      }
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  },
)
</script>

<template>
  <Modal :show="show && !!game" :title="`${game?.name} · 成就`" width="560px" @close="emit('close')">
    <div v-if="loading" style="display: flex; flex-direction: column; gap: 10px">
      <div v-for="i in 6" :key="i" class="skeleton" style="height: 52px"></div>
    </div>

    <div v-else-if="error" class="state-box">
      <span class="emoji">🛠️</span>
      <span class="msg">{{ error }}</span>
    </div>

    <template v-else>
      <div class="ach-progress">
        <div class="ap-bar">
          <div class="ap-fill" :style="{ width: total ? (earned / total) * 100 + '%' : '0%' }"></div>
        </div>
        <span class="ap-num mono">{{ earned }} / {{ total }}</span>
      </div>
      <ul class="ach-list">
        <li v-for="a in items" :key="a.apiName" class="ach-item" :class="{ unlocked: a.achieved }">
          <img v-if="a.icon" :src="img(a.icon)" :alt="a.name" loading="lazy" referrerpolicy="no-referrer" />
          <span v-else class="ach-icon-fallback">{{ a.achieved ? '🏆' : '🔒' }}</span>
          <div class="ach-text">
            <strong>{{ a.name }}</strong>
            <p v-if="a.description">{{ a.description }}</p>
          </div>
          <time v-if="a.achieved && a.unlockTime" class="mono">{{ a.unlockTime.slice(0, 10) }}</time>
        </li>
      </ul>
    </template>
  </Modal>
</template>

<style scoped>
.ach-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.ap-bar {
  flex: 1;
  height: 8px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.ap-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  box-shadow: 0 0 12px var(--accent-glow);
  transition: width 0.6s var(--ease);
}
.ap-num {
  font-size: 0.82rem;
  color: var(--text-2);
  font-weight: 700;
}
.ach-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ach-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  opacity: 0.55;
  filter: grayscale(0.85);
}
.ach-item.unlocked {
  opacity: 1;
  filter: none;
  border-color: rgba(251, 191, 36, 0.22);
  background: rgba(251, 191, 36, 0.04);
}
.ach-item img {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: #1a1c2a;
}
.ach-icon-fallback {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  font-size: 19px;
}
.ach-text {
  flex: 1;
  min-width: 0;
}
.ach-text strong {
  font-size: 0.86rem;
  display: block;
}
.ach-text p {
  font-size: 0.74rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ach-item time {
  font-size: 0.68rem;
  color: var(--text-3);
}
</style>
