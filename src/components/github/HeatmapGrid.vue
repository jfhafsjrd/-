<script setup>
/**
 * 生活热力格 — GitHub contributions 风格的站内活动日历墙
 * 53 周 × 7 天，色阶 = 当日活动数；hover 显示明细
 */
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'

const days = ref([])
const total = ref(0)
const best = ref({ date: '', count: 0 })
const loading = ref(true)

onMounted(async () => {
  try {
    const r = await api.stats.heatmap()
    days.value = r.days || []
    total.value = r.total || 0
    best.value = r.best || { date: '', count: 0 }
  } catch {
    /* 静默 */
  } finally {
    loading.value = false
  }
})

/* 列 = 周（周一起），行 = 周一~周日 */
const weeks = computed(() => {
  const out = []
  let col = []
  for (const d of days.value) {
    const dow = (new Date(d.date + 'T00:00:00').getDay() + 6) % 7
    if (dow === 0 && col.length) {
      out.push(col)
      col = []
    }
    col.push(d)
  }
  if (col.length) out.push(col)
  return out
})

const max = computed(() => Math.max(1, ...days.value.map((d) => d.count)))
const level = (n) => {
  if (!n) return 0
  const k = n / max.value
  return k > 0.75 ? 4 : k > 0.5 ? 3 : k > 0.25 ? 2 : 1
}
const label = (d) => {
  const parts = []
  if (d.parts.movie) parts.push(`影视 ${d.parts.movie}`)
  if (d.parts.todo) parts.push(`待办 ${d.parts.todo}`)
  if (d.parts.book) parts.push(`阅读 ${d.parts.book}`)
  return `${d.date} · ${parts.length ? parts.join(' / ') : '无活动'}`
}
</script>

<template>
  <section class="hm glass-card">
    <header class="hm-head">
      <h2>🔥 生活热力格</h2>
      <span class="hm-sum mono" v-if="!loading">{{ total }} 次活动 · 单日峰值 {{ best.count }}</span>
    </header>
    <div v-if="loading" class="hm-skeleton skeleton"></div>
    <div v-else class="hm-scroll">
      <div class="hm-grid" role="img" aria-label="近一年活动热力图">
        <div v-for="(w, wi) in weeks" :key="wi" class="hm-col">
          <i
            v-for="d in w"
            :key="d.date"
            class="hm-cell"
            :class="'lv' + level(d.count)"
            :title="label(d)"
          ></i>
        </div>
      </div>
    </div>
    <footer class="hm-legend">
      <span>少</span>
      <i class="hm-cell lv0"></i><i class="hm-cell lv1"></i><i class="hm-cell lv2"></i><i class="hm-cell lv3"></i><i class="hm-cell lv4"></i>
      <span>多</span>
    </footer>
  </section>
</template>

<style scoped>
.hm {
  padding: 18px 20px;
  margin-bottom: 18px;
}
.hm-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.hm-head h2 {
  font-size: 1rem;
}
.hm-sum {
  font-size: 0.72rem;
  color: var(--text-3);
}
.hm-skeleton {
  height: 112px;
  border-radius: 12px;
}
.hm-scroll {
  overflow-x: auto;
  padding-bottom: 6px;
}
.hm-grid {
  display: flex;
  gap: 3px;
  min-width: max-content;
}
.hm-col {
  display: grid;
  grid-auto-rows: 11px;
  gap: 3px;
}
.hm-cell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
}
.hm-cell.lv1 {
  background: rgba(124, 58, 237, 0.35);
}
.hm-cell.lv2 {
  background: rgba(139, 92, 246, 0.6);
}
.hm-cell.lv3 {
  background: rgba(168, 85, 247, 0.85);
}
.hm-cell.lv4 {
  background: linear-gradient(135deg, #a855f7, #6366f1);
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.5);
}
.hm-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 0.68rem;
  color: var(--text-3);
  justify-content: flex-end;
}
[data-theme='light'] .hm-cell {
  background: rgba(30, 32, 72, 0.07);
}
[data-theme='light'] .hm-cell.lv1 {
  background: rgba(124, 58, 237, 0.28);
}
</style>
