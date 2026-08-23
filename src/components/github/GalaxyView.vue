<script setup>
/**
 * ✨ 项目星系 — Canvas 2D 伪 3D 可视化
 * 藏书阁每个项目一颗星：大小∝star数、颜色按分类、慢速自转、拖拽旋转、滚轮缩放、点击直达仓库
 * 星数不足时混入每日推荐项目补场
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { api } from '@/api'

const CAT_COLORS = {
  ios: '#38bdf8',
  android: '#34d399',
  pc: '#a855f7',
  selfhost: '#fbbf24',
}
const colorOf = (c) => CAT_COLORS[c] || '#a3a9c0'

const canvasRef = ref(null)
const wrapRef = ref(null)
const tip = ref(null) // { x, y, title, stars }
const starCount = ref(0) // 响应式计数：驱动空态/图例切换

let raf = 0
let stars = [] // { x,y,z, size, color, url, title, starCount, cat }
let bgStars = [] // 背景静态星
let ry = 0.6
let rx = -0.18
let vy = 0.0022 // 自转速度
let fov = 620
let dragging = false
let lastX = 0
let lastY = 0
let dragDist = 0
let inertiaX = 0
let inertiaY = 0
let hoverStar = null
let running = false

/** 项目 → 3D 均匀盘面分布（斐波那契球面偏盘） */
function buildStars(projects) {
  const N = projects.length
  stars = projects.map((p, i) => {
    const golden = Math.PI * (3 - Math.sqrt(5))
    const y = 1 - (i / Math.max(N - 1, 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    const R = 170 + (i % 5) * 26 // 分层半径避免重叠
    return {
      x: Math.cos(theta) * radius * R,
      y: y * 62,
      z: Math.sin(theta) * radius * R,
      size: 2.6 + Math.min(Math.log10((p.starCount || p.stars || 100) + 10) * 1.7, 9),
      color: p.color || colorOf(p.cat),
      url: p.url,
      title: p.title,
      starCount: p.starCount || p.stars || 0,
      cat: p.cat,
      idx: i,
    }
  })
  starCount.value = stars.length
}

function resize() {
  const cvs = canvasRef.value
  const wrap = wrapRef.value
  if (!cvs || !wrap) return
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  cvs.width = wrap.clientWidth * dpr
  cvs.height = wrap.clientHeight * dpr
  cvs.style.width = '100%'
  cvs.style.height = '100%'
  cvs.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  // 背景静态星
  bgStars = Array.from({ length: 90 }, () => ({
    x: Math.random() * wrap.clientWidth,
    y: Math.random() * wrap.clientHeight,
    r: Math.random() * 1.2 + 0.3,
    tw: Math.random() * Math.PI * 2,
  }))
}

function project(s) {
  const wrap = wrapRef.value
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  // 绕 Y 轴
  const x1 = s.x * Math.cos(ry) + s.z * Math.sin(ry)
  const z1 = -s.x * Math.sin(ry) + s.z * Math.cos(ry)
  // 绕 X 轴
  const y2 = s.y * Math.cos(rx) - z1 * Math.sin(rx)
  const z2 = s.y * Math.sin(rx) + z1 * Math.cos(rx)
  const scale = fov / (fov + z2 + 260)
  return { sx: w / 2 + x1 * scale, sy: h / 2 + y2 * scale, scale, z: z2 }
}

function draw(t) {
  raf = requestAnimationFrame(draw)
  if (!running) return
  const cvs = canvasRef.value
  const wrap = wrapRef.value
  if (!cvs || !wrap) return
  const ctx = cvs.getContext('2d')
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  ctx.clearRect(0, 0, w, h)

  // 背景星
  for (const b of bgStars) {
    const a = 0.25 + Math.abs(Math.sin(t * 0.0006 + b.tw)) * 0.35
    ctx.fillStyle = `rgba(220,225,255,${a.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 惯性 + 自转
  if (!dragging) {
    ry += vy + inertiaX
    rx = Math.max(-1.1, Math.min(1.1, rx + inertiaY))
    inertiaX *= 0.94
    inertiaY *= 0.94
  }

  // 项目星（按 z 远→近排序绘制）
  const projected = stars.map((s) => ({ s, p: project(s) })).sort((a, b) => b.p.z - a.p.z)
  for (const { s, p } of projected) {
    const r = s.size * p.scale
    const depth = Math.max(0.25, Math.min(1, (p.z + 430) / 500))
    const isHover = hoverStar === s

    // 光晕
    const glow = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * (isHover ? 6 : 3.6))
    glow.addColorStop(0, s.color + (isHover ? 'cc' : '55'))
    glow.addColorStop(1, s.color + '00')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.sx, p.sy, r * (isHover ? 6 : 3.6), 0, Math.PI * 2)
    ctx.fill()

    // 星体
    ctx.fillStyle = s.color
    ctx.globalAlpha = 0.35 + depth * 0.65
    ctx.beginPath()
    ctx.arc(p.sx, p.sy, Math.max(r, 1.2), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // 十字光
    if (r > 3 || isHover) {
      ctx.strokeStyle = s.color + '88'
      ctx.lineWidth = 1
      const len = r * 2.4
      ctx.beginPath()
      ctx.moveTo(p.sx - len, p.sy)
      ctx.lineTo(p.sx + len, p.sy)
      ctx.moveTo(p.sx, p.sy - len)
      ctx.lineTo(p.sx, p.sy + len)
      ctx.stroke()
    }

    // 悬停标签
    if (isHover) {
      ctx.font = '600 12px system-ui, sans-serif'
      const text = `${s.title}  ★${s.starCount >= 1000 ? (s.starCount / 1000).toFixed(1) + 'k' : s.starCount}`
      const tw = ctx.measureText(text).width
      ctx.fillStyle = 'rgba(13,15,22,0.92)'
      ctx.strokeStyle = s.color + 'aa'
      roundRect(ctx, p.sx + 14, p.sy - 12, tw + 18, 24, 7)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#eceef6'
      ctx.fillText(text, p.sx + 23, p.sy + 4)
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function hitTest(mx, my) {
  const projected = stars.map((s) => ({ s, p: project(s) })).sort((a, b) => b.p.z - a.p.z)
  for (const { s, p } of projected) {
    const r = Math.max(s.size * p.scale, 4) + 8
    if ((mx - p.sx) ** 2 + (my - p.sy) ** 2 < r * r) return s
  }
  return null
}

function onDown(e) {
  dragging = true
  dragDist = 0
  lastX = e.clientX
  lastY = e.clientY
}
function onMove(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  if (dragging) {
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    dragDist += Math.abs(dx) + Math.abs(dy)
    ry += dx * 0.006
    rx = Math.max(-1.1, Math.min(1.1, rx + dy * 0.005))
    inertiaX = dx * 0.00035
    inertiaY = dy * 0.00028
    lastX = e.clientX
    lastY = e.clientY
  }
  hoverStar = hitTest(mx, my)
  canvasRef.value.style.cursor = hoverStar ? 'pointer' : dragging ? 'grabbing' : 'grab'
}
function onUp(e) {
  if (dragging && dragDist < 5 && hoverStar?.url) {
    window.open(hoverStar.url, '_blank', 'noopener')
  }
  dragging = false
}
function onWheel(e) {
  e.preventDefault()
  fov = Math.max(280, Math.min(1400, fov + e.deltaY * 0.8))
}

onMounted(async () => {
  resize()
  window.addEventListener('resize', resize)

  // 数据：藏书阁项目（分类着色），不足 8 颗时混入每日推荐补场
  const projects = []
  try {
    const repos = await api.github.repos()
    for (const r of repos) {
      projects.push({
        title: `${r.owner}/${r.repo}`,
        starCount: r.info?.stars || 0,
        cat: r.category,
        color: colorOf(r.category),
        url: `https://github.com/${r.owner}/${r.repo}`,
      })
    }
  } catch {
    /* 静默 */
  }
  if (projects.length < 8) {
    try {
      const daily = await api.github.daily()
      const seen = new Set(projects.map((p) => p.title))
      for (const d of daily.repos || []) {
        if (projects.length >= 14) break
        if (seen.has(d.fullName)) continue
        projects.push({
          title: d.fullName,
          starCount: d.stars,
          cat: 'pc',
          color: '#8b8fb5',
          url: `https://github.com/${d.fullName}`,
        })
      }
    } catch {
      /* 静默 */
    }
  }
  if (projects.length) {
    buildStars(projects)
    running = true
    raf = requestAnimationFrame(draw)
  }
})

onBeforeUnmount(() => {
  running = false
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <div class="galaxy glass-card">
    <header class="gx-head">
      <h2>✨ 项目星系</h2>
      <span class="text-3 gx-tip">拖拽旋转 · 滚轮缩放 · 点击星点直达仓库 · 星点大小 = Star 数</span>
    </header>
    <div ref="wrapRef" class="gx-wrap">
      <canvas ref="canvasRef" class="gx-canvas" @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp; hoverStar = null" @wheel="onWheel"></canvas>
      <div v-if="!starCount" class="gx-empty">
        <span>🌌</span>
        <p>藏书阁还是空的，先去「库」里收藏几个项目吧</p>
      </div>
      <div class="gx-legend">
        <span><i style="background: #38bdf8"></i>iOS</span>
        <span><i style="background: #34d399"></i>Android</span>
        <span><i style="background: #a855f7"></i>PC</span>
        <span><i style="background: #fbbf24"></i>自部署</span>
        <span><i style="background: #8b8fb5"></i>推荐</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.galaxy {
  overflow: hidden;
}
.gx-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 20px 8px;
}
.gx-head h2 {
  font-size: 1.05rem;
}
.gx-tip {
  font-size: 0.74rem;
}
.gx-wrap {
  position: relative;
  height: 480px;
}
.gx-canvas {
  display: block;
  cursor: grab;
  touch-action: none;
}
.gx-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--text-3);
}
.gx-empty span {
  font-size: 40px;
}
.gx-empty p {
  font-size: 0.88rem;
}
.gx-legend {
  position: absolute;
  left: 16px;
  bottom: 12px;
  display: flex;
  gap: 14px;
  font-size: 0.7rem;
  color: var(--text-3);
  background: rgba(10, 11, 16, 0.55);
  padding: 6px 12px;
  border-radius: 99px;
  backdrop-filter: blur(6px);
}
.gx-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.gx-legend i {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  box-shadow: 0 0 6px currentColor;
}
@media (max-width: 640px) {
  .gx-wrap {
    height: 360px;
  }
}
</style>
