import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
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
