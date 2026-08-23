<script setup>
/** 「看完了」弹窗 — 0-10 数字滑块评分 + 一句话影评，提交后撒花 */
import { ref, watch } from 'vue'
import Modal from '@/components/common/Modal.vue'
import { useToast } from '@/composables/useToast'
import { confetti } from '@/composables/useConfetti'

const props = defineProps({
  show: { type: Boolean, default: false },
  movie: { type: Object, default: null },
})
const emit = defineEmits(['close', 'submit'])

const toast = useToast()
const rating = ref(7)
const comment = ref('')
const submitting = ref(false)

watch(
  () => props.show,
  (v) => {
    if (v) {
      rating.value = props.movie?.personalRating || 7
      comment.value = props.movie?.comment || ''
    }
  },
)

async function submit() {
  submitting.value = true
  try {
    await emit('submit', { personalRating: rating.value, comment: comment.value })
    confetti()
    emit('close')
  } catch (e) {
    toast.error(e.message)
  } finally {
    submitting.value = false
  }
}

const RATING_WORDS = ['垃圾', '很差', '差', '一般', '普通', '还行', '不错', '好看', '精彩', '神作', '传世']
function wordOf(v) {
  return RATING_WORDS[Math.round(Number(v))] || ''
}
</script>

<template>
  <Modal :show="show && !!movie" :title="`看完《${movie?.title}》了？`" width="480px" @close="emit('close')">
    <div class="rate-body">
      <div class="rate-display">
        <span class="rate-num mono">{{ rating.toFixed(1) }}</span>
        <span class="rate-word">{{ wordOf(rating) }}</span>
      </div>
      <input
        v-model.number="rating"
        class="rate-slider"
        type="range"
        min="0"
        max="10"
        step="0.1"
        aria-label="个人评分"
      />
      <div class="rate-scale mono">
        <span>0</span><span>TMDB 参照 {{ movie?.tmdbRating?.toFixed(1) ?? '—' }}</span><span>10</span>
      </div>
      <textarea
        v-model="comment"
        class="textarea"
        rows="3"
        placeholder="一句话影评（可留空）…"
        maxlength="200"
      ></textarea>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">再想想</button>
      <button class="btn primary" :disabled="submitting" @click="submit">
        {{ submitting ? '保存中…' : '✓ 看完了，入库' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.rate-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rate-display {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.rate-num {
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
  background: var(--accent-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  min-width: 84px;
}
.rate-word {
  font-size: 0.95rem;
  color: var(--text-2);
}
.rate-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  border-radius: 99px;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  outline: none;
  cursor: pointer;
}
.rate-slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 99px;
  background: #fff;
  border: 3px solid var(--accent);
  box-shadow: 0 0 14px var(--accent-glow);
  cursor: grab;
  transition: transform 0.15s;
}
.rate-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}
.rate-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 99px;
  background: #fff;
  border: 3px solid var(--accent);
  box-shadow: 0 0 14px var(--accent-glow);
  cursor: grab;
}
.rate-scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-3);
}
</style>
