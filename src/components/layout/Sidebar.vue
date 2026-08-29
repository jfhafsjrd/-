<script setup>
/** 桌面侧边栏 — 由模块注册表驱动 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { modules } from '@/router/modules'

const route = useRoute()
const navItems = computed(() => modules)

/* ---------- 主题切换 ---------- */
const theme = ref(localStorage.getItem('lifeos_theme') === 'light' ? 'light' : 'dark')
function applyTheme(next) {
  theme.value = next
  document.documentElement.dataset.theme = next
  localStorage.setItem('lifeos_theme', next)
  window.dispatchEvent(new CustomEvent('lifeos:theme'))
}
/* 命令面板等处切换主题时同步本组件状态 */
window.addEventListener('lifeos:theme', () => {
  theme.value = document.documentElement.dataset.theme || 'dark'
})
const toggleTheme = () => applyTheme(theme.value === 'light' ? 'dark' : 'light')

/* 命令面板由 App.vue 挂载，这里只广播开关事件 */
const emitPalette = () => window.dispatchEvent(new CustomEvent('lifeos:palette'))
</script>

<template>
  <aside class="sidebar">
    <router-link to="/" class="brand">
      <span class="logo">⚡</span>
      <span class="brand-text">
        <strong>Life OS</strong>
        <em>探索者仪表盘</em>
      </span>
    </router-link>

    <nav class="nav">
      <router-link
        v-for="m in navItems"
        :key="m.path"
        :to="m.path"
        class="nav-item"
        :class="{ active: route.name === m.name }"
      >
        <span class="nav-icon">{{ m.icon }}</span>
        <span class="nav-label">{{ m.label }}</span>
        <span class="nav-desc">{{ m.desc }}</span>
      </router-link>
    </nav>

    <div class="side-foot">
      <button class="theme-toggle" title="命令面板 (Ctrl+K)" @click="emitPalette">
        <span class="tt-icon">🔎</span>
        <span>命令面板</span>
        <span class="tt-kbd mono">Ctrl K</span>
      </button>
      <button class="theme-toggle" :title="theme === 'dark' ? '切换到明亮模式' : '切换到暗黑模式'" @click="toggleTheme">
        <span class="tt-icon">{{ theme === 'dark' ? '☀️' : '🌙' }}</span>
        <span>{{ theme === 'dark' ? '明亮模式' : '暗黑模式' }}</span>
      </button>
      <div class="foot-card">
        <span class="pulse-dot"></span>
        <span>系统运行中</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--sidebar-w);
  z-index: var(--z-sidebar);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  background: rgba(11, 12, 19, 0.72);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-right: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 6px 10px 20px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;
}
.logo {
  font-size: 26px;
  filter: drop-shadow(0 0 10px var(--accent-glow));
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.brand-text strong {
  font-size: 1.06rem;
  letter-spacing: 0.04em;
  background: var(--accent-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-text em {
  font-style: normal;
  font-size: 0.7rem;
  color: var(--text-3);
  letter-spacing: 0.14em;
}

.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.nav-item {
  position: relative;
  display: grid;
  grid-template-columns: 26px 1fr auto;
  align-items: center;
  gap: 2px 10px;
  padding: 11px 12px;
  border-radius: 12px;
  color: var(--text-2);
  transition: all var(--dur-fast) var(--ease);
}
.nav-icon {
  font-size: 1.08rem;
  transition: transform var(--dur-fast);
}
.nav-label {
  font-size: 0.93rem;
  font-weight: 500;
}
.nav-desc {
  grid-column: 2 / 4;
  font-size: 0.68rem;
  color: var(--text-3);
  margin-top: -2px;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: all var(--dur-fast);
}
.nav-item:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.045);
}
.nav-item:hover .nav-icon {
  transform: scale(1.15);
}
.nav-item.active {
  color: #fff;
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.2), rgba(99, 102, 241, 0.08));
  box-shadow: var(--glow-soft);
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 14%;
  bottom: 14%;
  width: 3px;
  border-radius: 99px;
  background: var(--accent-grad);
  box-shadow: 0 0 14px var(--accent-glow);
}
.nav-item.active .nav-icon {
  filter: drop-shadow(0 0 10px var(--accent-glow));
  transform: scale(1.12);
}
.nav-item.active .nav-desc {
  max-height: 20px;
  opacity: 1;
}

.side-foot {
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease);
}
.theme-toggle:hover {
  color: var(--text-1);
  border-color: var(--border-strong);
}
.tt-icon {
  font-size: 0.95rem;
}
.tt-kbd {
  margin-left: auto;
  font-size: 0.62rem;
  color: var(--text-3);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 6px;
}
.foot-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(52, 211, 153, 0.06);
  border: 1px solid rgba(52, 211, 153, 0.14);
  color: var(--success);
  font-size: 0.78rem;
}
</style>
