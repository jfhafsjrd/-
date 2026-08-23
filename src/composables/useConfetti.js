/**
 * 轻量五彩纸屑 — 零依赖 canvas 撒花（删除/完成庆祝用）
 * 用法: confetti() 默认从屏幕中上方撒；confetti({x, y}) 指定原点
 */
const COLORS = ['#a855f7', '#6366f1', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#f472b6']

export function confetti({ x = innerWidth / 2, y = innerHeight * 0.32, count = 46 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;z-index:999;pointer-events:none'
  canvas.width = innerWidth
  canvas.height = innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const parts = Array.from({ length: count }, () => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 9 - 3,
    size: 4 + Math.random() * 5,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    life: 1,
  }))

  const t0 = performance.now()
  function frame(t) {
    const elapsed = t - t0
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false
    for (const p of parts) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.32
      p.vx *= 0.985
      p.rot += p.vr
      p.life = 1 - elapsed / 1800
      if (p.life <= 0 || p.y > canvas.height + 30) continue
      alive = true
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62)
      ctx.restore()
    }
    if (alive && elapsed < 2200) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
