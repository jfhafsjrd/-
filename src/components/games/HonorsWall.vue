<script setup>
/**
 * 🏆 100% 满成就荣誉墙 — conic-gradient 流光边框 + 呼吸光晕 + 悬停 3D 视差倾斜
 * 过滤条件由后端焊死 earned === total，这里纯展示
 */
import { ref } from 'vue'
import { steamCover } from '@/api'
import { hours } from '@/utils/format'

defineProps({
  games: { type: Array, default: () => [] },
})
const emit = defineEmits(['inspect'])

const tiltCard = ref(null)

/** 3D 倾斜：以卡片中心为原点计算旋转角 */
function onMove(e) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  const px = (e.clientX - rect.left) / rect.width - 0.5
  const py = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transform = `perspective(700px) rotateY(${px * 14}deg) rotateX(${-py * 14}deg) translateY(-4px) scale(1.03)`
  el.style.setProperty('--mx', `${(px + 0.5) * 100}%`)
  el.style.setProperty('--my', `${(py + 0.5) * 100}%`)
}
function onLeave(e) {
  e.currentTarget.style.transform = ''
}
</script>

<template>
  <section class="honors glass-card" aria-label="满成就荣誉墙">
    <div class="honors-head">
      <h2 class="honors-title">
        <span class="crown">🏆</span>
        完美通关荣誉墙
      </h2>
      <span class="num-badge">{{ games.length }} 款 100% 满成就</span>
    </div>

    <div v-if="games.length" ref="tiltCard" class="honors-track">
      <article
        v-for="g in games"
        :key="g.id"
        class="honor-card aurora-border"
        @mousemove="onMove"
        @mouseleave="onLeave"
        @click="emit('inspect', g)"
      >
        <div class="hc-glow"></div>
        <img v-if="g.cover" :src="steamCover(g.cover)" :alt="g.name" loading="lazy" />
        <div v-else class="hc-fallback">🎮</div>
        <div class="hc-body">
          <strong class="hc-name">{{ g.name }}</strong>
          <span class="hc-meta">
            <b class="mono hc-ach">{{ g.achEarned }}<i>/</i>{{ g.achTotal }}</b>
            <span class="hc-time mono">{{ hours(g.playtime) }}</span>
          </span>
        </div>
        <span class="hc-check">✓</span>
      </article>
    </div>

    <div v-else class="state-box">
      <span class="emoji">🏗️</span>
      <span class="msg">还没有 100% 满成就的游戏</span>
      <span class="sub">当成就全部解锁时，游戏会自动登上这面墙</span>
    </div>
  </section>
</template>

<style scoped>
.honors {
  padding: 18px 20px 20px;
  margin-bottom: 24px;
  background:
    radial-gradient(600px 180px at 20% 0%, rgba(168, 85, 247, 0.08), transparent),
    var(--card);
}
.honors-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.honors-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 1.05rem;
  font-weight: 700;
}
.crown {
  filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.6));
  animation: breathe 3s ease-in-out infinite;
}

.honors-track {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 14px;
}

.honor-card {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.25s var(--ease);
  will-change: transform;
  animation: rise-in 0.5s var(--ease) both;
}
.honor-card img {
  width: 100%;
  aspect-ratio: 460 / 215;
  object-fit: cover;
}
.hc-fallback {
  display: grid;
  place-items: center;
  aspect-ratio: 460 / 215;
  font-size: 34px;
  background: linear-gradient(160deg, #262038, #141625);
}
.hc-body {
  position: absolute;
  inset: auto 0 0 0;
  padding: 24px 12px 10px;
  background: linear-gradient(transparent, rgba(8, 9, 14, 0.94));
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hc-name {
  font-size: 0.86rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hc-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.hc-ach {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--warning);
  text-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
}
.hc-ach i {
  font-style: normal;
  opacity: 0.5;
  font-weight: 400;
}
.hc-time {
  font-size: 0.68rem;
  color: var(--text-3);
}
.hc-check {
  position: absolute;
  top: 9px;
  right: 9px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 99px;
  font-size: 0.72rem;
  font-weight: 800;
  background: linear-gradient(135deg, #fbbf24, #f97316);
  color: #1a1206;
  box-shadow: 0 0 14px rgba(251, 191, 36, 0.55);
  animation: breathe 2.6s infinite;
}
.hc-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(180px 140px at var(--mx, 50%) var(--my, 50%), rgba(168, 85, 247, 0.22), transparent);
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
  z-index: 2;
}
.honor-card:hover .hc-glow {
  opacity: 1;
}
</style>
