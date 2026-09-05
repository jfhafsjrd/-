<script setup>
/**
 * 年度 Wrapped — Spotify 式生活回顾故事
 * 全屏翻页 · 渐变场景 · 进度条 · 键盘/点击/滑动导航 · 可截图分享
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, tmdbPoster } from '@/api'
const router = useRouter()


const data = ref(null)
const loading = ref(true)
const slide = ref(0)
const total = 7

async function load() {
  try {
    data.value = await api.stats.wrapped()
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
  await load()
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})

function next() { if (slide.value < total - 1) slide.value++ }
function prev() { if (slide.value > 0) slide.value-- }
function onKey(e) {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'Escape') router.push('/')
}
let touchX = 0
function onTouchStart(e) { touchX = e.touches[0].clientX }
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchX
  if (dx < -40) next()
  else if (dx > 40) prev()
}
const SCENES = [
  'linear-gradient(150deg, #2b1a5e, #6d28d9 60%, #db2777)',
  'linear-gradient(150deg, #0f3460, #38bdf8 120%)',
  'linear-gradient(150deg, #7c2d12, #f59e0b 130%)',
  'linear-gradient(150deg, #14532d, #22c55e 130%)',
  'linear-gradient(150deg, #1e1b4b, #818cf8 130%)',
  'linear-gradient(150deg, #500724, #ec4899 130%)',
  'linear-gradient(150deg, #0a0a0a, #7c3aed 140%)',
]

const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const monthMax = computed(() => Math.max(1, ...(data.value?.movies.months || [])))
</script>

<template>
  <div class="wrapped" :style="{ background: SCENES[slide] }" @click="next" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <!-- 顶部进度条 -->
    <div class="w-progress">
      <div v-for="i in total" :key="i" class="wp-seg">
        <i v-if="i <= slide + 1"></i>
      </div>
      <button class="w-close" aria-label="关闭" @click.stop="router.push('/')">✕</button>
    </div>

    <div v-if="loading" class="w-loading">正在汇总你的 {{ new Date().getFullYear() }}…</div>

    <main v-else class="w-stage" :key="slide">
      <!-- S1 开场 -->
      <section v-if="slide === 0" class="w-slide">
        <span class="w-eyebrow">LIFE OS · 年度回顾</span>
        <h1 class="w-hero">{{ data.year }}<br />你的年度报告</h1>
        <p class="w-sub">这一年，影视、游戏与书页，都在这里留下了痕迹</p>
        <span class="w-hint">点击 / → 键继续</span>
      </section>

      <!-- S2 影视 -->
      <section v-else-if="slide === 1" class="w-slide">
        <span class="w-eyebrow">🎬 影视篇</span>
        <h1 class="w-big mono">{{ data.movies.count }}</h1>
        <p class="w-label">部影视看完</p>
        <div class="w-chips">
          <span class="w-chip">📺 追剧 {{ data.movies.episodes }} 集</span>
          <span v-for="(n, label) in data.movies.byType" :key="label" class="w-chip">{{ label }} {{ n }}</span>
        </div>
        <div class="w-months">
          <div v-for="(n, i) in data.movies.months" :key="i" class="wm-col">
            <i :style="{ height: Math.max(3, (n / monthMax) * 60) + 'px' }" :class="{ peak: i === data.movies.peakMonth - 1 }"></i>
            <em>{{ i + 1 }}</em>
          </div>
        </div>
        <p class="w-note">峰值在 {{ monthNames[data.movies.peakMonth - 1] }}（{{ data.movies.months[data.movies.peakMonth - 1] }} 部）</p>
      </section>

      <!-- S3 年度最佳 -->
      <section v-else-if="slide === 2" class="w-slide">
        <span class="w-eyebrow">🏆 年度之最</span>
        <template v-if="data.movies.best">
          <img v-if="data.movies.best.cover" class="w-poster" :src="data.movies.best.cover.startsWith('http') ? data.movies.best.cover : tmdbPoster(data.movies.best.cover, 'w500')" :alt="data.movies.best.title" />
          <h1 class="w-big" style="font-size: 2rem">{{ data.movies.best.title }}</h1>
          <p class="w-label">你的年度最高分 · <b class="mono">{{ data.movies.best.rating }}</b> 分</p>
        </template>
        <p v-else class="w-note">今年还没打过分，明年补上？</p>
      </section>

      <!-- S4 游戏 -->
      <section v-else-if="slide === 3" class="w-slide">
        <span class="w-eyebrow">🎮 游戏篇</span>
        <h1 class="w-big mono">{{ data.games.hours }}</h1>
        <p class="w-label">小时的游戏时光</p>
        <div class="w-chips">
          <span class="w-chip">📚 库藏 {{ data.games.total }} 款</span>
          <span class="w-chip">🔥 在玩 {{ data.games.playing }} 款</span>
        </div>
      </section>

      <!-- S5 阅读 -->
      <section v-else-if="slide === 4" class="w-slide">
        <span class="w-eyebrow">📖 阅读篇</span>
        <h1 class="w-big mono">{{ (data.reading.chars / 10000).toFixed(1) }}<small> 万字</small></h1>
        <p class="w-label">书架藏书体量</p>
        <div class="w-chips">
          <span class="w-chip">📚 {{ data.reading.books }} 本在架</span>
          <span class="w-chip">📈 平均读至 {{ data.reading.avgPct }}%</span>
        </div>
      </section>

      <!-- S6 待办+活动 -->
      <section v-else-if="slide === 5" class="w-slide">
        <span class="w-eyebrow">✅ 生活篇</span>
        <h1 class="w-big mono">{{ data.todos.done }}</h1>
        <p class="w-label">件待办被消灭</p>
        <div class="w-chips">
          <span class="w-chip">🕒 待办 {{ data.todos.open }} 件在路上</span>
          <span class="w-chip">🍿 想看清单 {{ data.want }} 部</span>
        </div>
      </section>

      <!-- S7 结尾 -->
      <section v-else class="w-slide">
        <span class="w-eyebrow">{{ data.year }}</span>
        <h1 class="w-hero" style="font-size: 2.2rem">把日子过成<br />值得备份的样子</h1>
        <p class="w-sub">—— Life OS，明年见</p>
        <button class="w-again" @click.stop="slide = 0">↺ 再看一遍</button>
      </section>
    </main>

    <!-- 底部导航 -->
    <footer class="w-nav" @click.stop>
      <button class="w-nav-btn" :disabled="slide === 0" @click="prev">←</button>
      <span class="mono w-page">{{ slide + 1 }} / {{ total }}</span>
      <button class="w-nav-btn" :disabled="slide === total - 1" @click="next">→</button>
    </footer>
  </div>
</template>

<style scoped>
.wrapped {
  position: fixed;
  inset: 0;
  z-index: 95;
  color: #fff;
  display: flex;
  flex-direction: column;
  transition: background 0.5s ease;
  overflow: hidden;
  user-select: none;
}
.w-progress {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  gap: 5px;
  z-index: 5;
  align-items: center;
}
.wp-seg {
  flex: 1;
  height: 3px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.25);
  overflow: hidden;
}
.wp-seg i {
  display: block;
  height: 100%;
  background: #fff;
  border-radius: 99px;
}
.w-close {
  border: none;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.8rem;
  flex-shrink: 0;
  margin-left: 4px;
}
.w-loading {
  flex: 1;
  display: grid;
  place-items: center;
  opacity: 0.8;
  letter-spacing: 0.2em;
}
.w-stage {
  flex: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  text-align: center;
  gap: 18px;
  padding: 40px 24px 90px;
  animation: w-in 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes w-in {
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
}
.w-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.4em;
  opacity: 0.75;
}
.w-hero {
  font-size: 3rem;
  font-weight: 800;
  line-height: 1.25;
  text-shadow: 0 6px 30px rgba(0, 0, 0, 0.35);
}
.w-big {
  font-size: 5rem;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 6px 30px rgba(0, 0, 0, 0.35);
}
.w-big small {
  font-size: 1.6rem;
  font-weight: 600;
}
.w-label {
  font-size: 1.05rem;
  opacity: 0.92;
}
.w-label b {
  color: #fde047;
}
.w-sub {
  font-size: 0.95rem;
  opacity: 0.85;
  max-width: 460px;
}
.w-hint {
  font-size: 0.72rem;
  opacity: 0.55;
  letter-spacing: 0.2em;
  margin-top: 16px;
}
.w-note {
  font-size: 0.85rem;
  opacity: 0.75;
}
.w-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.w-chip {
  font-size: 0.78rem;
  padding: 6px 14px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(6px);
}
.w-months {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 80px;
  margin-top: 8px;
}
.wm-col {
  display: grid;
  justify-items: center;
  gap: 4px;
}
.wm-col i {
  display: block;
  width: 14px;
  border-radius: 4px 4px 2px 2px;
  background: rgba(255, 255, 255, 0.45);
}
.wm-col i.peak {
  background: #fde047;
  box-shadow: 0 0 16px rgba(253, 224, 71, 0.7);
}
.wm-col em {
  font-size: 0.6rem;
  font-style: normal;
  opacity: 0.65;
}
.w-poster {
  width: 150px;
  border-radius: 12px;
  box-shadow: 0 20px 60px -12px rgba(0, 0, 0, 0.6);
  border: 2px solid rgba(255, 255, 255, 0.3);
}
.w-again {
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  padding: 9px 22px;
  border-radius: 99px;
  cursor: pointer;
  font-size: 0.85rem;
}
.w-nav {
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.w-nav-btn {
  width: 38px;
  height: 38px;
  border-radius: 99px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
}
.w-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.w-page {
  font-size: 0.74rem;
  opacity: 0.7;
}
@media (max-width: 560px) {
  .w-hero { font-size: 2.2rem; }
  .w-big { font-size: 3.4rem; }
}
</style>
