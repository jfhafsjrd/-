/**
 * 定时任务调度 — node-cron
 *   Steam 静默同步：每 2 小时（缓存过期才真正执行）
 *   链接哨兵巡检：每 30 分钟
 *   Trakt 自动同步：每天 07:17（已授权才执行）
 */
import cron from 'node-cron'
import { steamSyncIfStale } from './routes/steam.js'
import { sentinelSweep } from './routes/links.js'
import { traktAutoSync } from './routes/trakt.js'

export function startScheduler() {
  cron.schedule('7 */2 * * *', () => {
    if (steamSyncIfStale()) console.log('[cron] Steam 定时同步已触发')
  })

  cron.schedule('*/30 * * * *', async () => {
    try {
      const n = await sentinelSweep()
      if (n) console.log(`[cron] 哨兵巡检完成，检查 ${n} 条链接`)
    } catch (err) {
      console.warn('[cron] 哨兵巡检失败:', err.message)
    }
  })

  cron.schedule('17 7 * * *', () => traktAutoSync())

  // 启动 45 秒后检查一次 Steam 缓存新鲜度（避开启动高峰）
  setTimeout(() => steamSyncIfStale(), 45000)

  console.log('[cron] 定时任务就绪：Steam 每 2 小时 · 哨兵每 30 分钟 · Trakt 每天 07:17')
}
