<script setup>
/**
 * 低多边形几何动画背景 — 纯 Canvas 2D 手写（零 Three.js 依赖）
 * 网格顶点缓慢漂移 → 三角面填充暗紫渐变 + 细描边
 * 30fps 节流 / 标签页隐藏暂停 / reduced-motion 静态单帧
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'

const canvas = ref(null)
let raf = 0
let running = false
let last = 0

const COLS = 13
const ROWS = 8
const DRIFT = 46 // 顶点漂移幅度 px
const nodes = [] // { ox, oy, phase1, phase2, speed }

function initNodes(w, h) {
  nodes.length = 0
  const mx = w / (COLS - 1)
  const my = h / (ROWS - 1)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      nodes.push({
        ox: c * mx,
        oy: r * my,
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 0.5,
      })
    }
  }
}

function nodeXY(n, t) {
  return [
    n.ox + Math.sin(t * 0.00016 * n.sp + n.p1) * DRIFT,
    n.oy + Math.cos(t * 0.00013 * n.sp + n.p2) * DRIFT,
  ]
}

/** 三角形填充色：按主题取色板 —— 暗色压暗紫靛蓝，亮色提浅薰衣草 */
const isLight = () => document.documentElement.dataset.theme === 'light'

function faceColor(x, y, w, h) {
  const k = (x / w) * 0.6 + (y / h) * 0.4
  if (isLight()) {
    const r = Math.round(216 + k * 20)
    const g = Math.round(208 + k * 18)
    const b = Math.round(244 + k * 10)
    return [r, g, b]
  }
  const r = Math.round(38 + k * 26)
  const g = Math.round(20 + k * 22)
  const b = Math.round(66 + k * 40)
  return [r, g, b]
}

function draw(t) {
  const cvs = canvas.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  const w = cvs.width
  const h = cvs.height
  ctx.clearRect(0, 0, w, h)

  const cellW = w / (COLS - 1)
  const cellH = h / (ROWS - 1)

  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const n00 = nodes[r * COLS + c]
      const n10 = nodes[r * COLS + c + 1]
      const n01 = nodes[(r + 1) * COLS + c]
      const n11 = nodes[(r + 1) * COLS + c + 1]
      const [ax, ay] = nodeXY(n00, t)
      const [bx, by] = nodeXY(n10, t)
      const [cx2, cy2] = nodeXY(n01, t)
      const [dx, dy] = nodeXY(n11, t)

      // 两个三角形：▲ (a,b,d) ▽ (a,d,c)
      for (const tri of [
        [ax, ay, bx, by, dx, dy],
        [ax, ay, dx, dy, cx2, cy2],
      ]) {
        const mx = (tri[0] + tri[2] + tri[4]) / 3
        const my = (tri[1] + tri[3] + tri[5]) / 3
        const [r1, g1, b1] = faceColor(mx, my, w, h)
        ctx.beginPath()
        ctx.moveTo(tri[0], tri[1])
        ctx.lineTo(tri[2], tri[3])
        ctx.lineTo(tri[4], tri[5])
        ctx.closePath()
        ctx.fillStyle = `rgba(${r1},${g1},${b1},${isLight() ? 0.5 : 0.24})`
        ctx.fill()
        ctx.strokeStyle = isLight() ? 'rgba(139,92,246,0.07)' : 'rgba(168,120,255,0.045)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }
  // 轻微暗角，增强层次（亮色主题用白角）
  const corner = isLight() ? 'rgba(255,255,255,0.5)' : 'rgba(7,8,13,0.55)'
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
  vg.addColorStop(0, isLight() ? 'rgba(255,255,255,0)' : 'rgba(7,8,13,0)')
  vg.addColorStop(1, corner)
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)
  void cellW
  void cellH
}

function loop(t) {
  raf = requestAnimationFrame(loop)
  if (t - last < 41) return // ~24fps
  last = t
  draw(t)
}

function resize() {
  const cvs = canvas.value
  if (!cvs) return
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
  cvs.width = Math.floor(window.innerWidth * dpr)
  cvs.height = Math.floor(window.innerHeight * dpr)
  cvs.style.width = '100%'
  cvs.style.height = '100%'
  initNodes(cvs.width, cvs.height)
  if (!running) draw(0) // 静态模式也要重绘一帧
}

function setRunning(v) {
  if (running === v) return
  running = v
  if (running) {
    last = 0
    raf = requestAnimationFrame(loop)
  } else {
    cancelAnimationFrame(raf)
  }
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  /* 主题切换时静态模式（reduced-motion）也要立即重绘一帧 */
  window.addEventListener('lifeos:theme', () => draw(performance.now()))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    draw(0)
  } else {
    setRunning(true)
    document.addEventListener('visibilitychange', () => setRunning(!document.hidden))
  }
})

onBeforeUnmount(() => {
  setRunning(false)
  window.removeEventListener('resize', resize)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <canvas ref="canvas" class="lowpoly" aria-hidden="true"></canvas>
</template>

<style scoped>
.lowpoly {
  position: fixed;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  opacity: 0.55;
  pointer-events: none;
}
</style>
