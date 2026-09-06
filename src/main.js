import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { modules } from './router/modules'
import './styles/variables.css'
import './styles/base.css'
import './styles/components.css'
import './styles/theme-light.css'

/* 主题先行：避免暗色闪屏 */
document.documentElement.dataset.theme = localStorage.getItem('lifeos_theme') || 'dark'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

/* PWA：注册离线壳（生产环境） */
/* 空闲预取：首屏稳住后把所有懒加载板块代码块提前拉好，切换零延迟 */
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2500))
idle(() => {
  for (const mod of modules) {
    if (typeof mod.view === 'function') {
      try { Promise.resolve(mod.view()).catch(() => {}) } catch { /* 忽略 */ }
    }
  }
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
