<script setup>
/** 移动端顶栏 + 抽屉导航（<768px 显示） */
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { visibleModules as modules } from '@/router/modules'

const route = useRoute()
const open = ref(false)

function close() {
  open.value = false
}
</script>

<template>
  <header class="m-header">
    <button class="menu-btn icon-btn" aria-label="打开菜单" @click="open = true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <router-link to="/" class="m-brand" @click="close">
      <span class="logo">⚡</span> Life OS
    </router-link>
    <span style="width: 34px"></span>
  </header>

  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="drawer-mask" @click.self="close">
        <nav class="drawer">
          <div class="drawer-head">
            <span>导航</span>
            <button class="icon-btn" aria-label="关闭菜单" @click="close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <router-link
            v-for="m in modules"
            :key="m.path"
            :to="m.path"
            class="drawer-item"
            :class="{ active: route.name === m.name }"
            @click="close"
          >
            <span class="di-icon">{{ m.icon }}</span>
            <span class="di-label">{{ m.label }}</span>
            <span class="di-desc">{{ m.desc }}</span>
          </router-link>
        </nav>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m-header {
  display: none;
}

@media (max-width: 768px) {
  .m-header {
    position: sticky;
    top: 0;
    z-index: var(--z-header);
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-h);
    padding: 0 14px;
    background: var(--card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
  }
  .m-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 1.02rem;
    background: var(--accent-grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .m-brand .logo {
    filter: drop-shadow(0 0 8px var(--accent-glow));
  }
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(5, 6, 10, 0.6);
  backdrop-filter: blur(4px);
}
.drawer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: min(300px, 82vw);
  background: var(--bg-2);
  border-right: 1px solid var(--border);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px 16px;
  font-weight: 600;
  color: var(--text-2);
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.drawer-item {
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-rows: auto auto;
  padding: 11px 12px;
  border-radius: 12px;
  color: var(--text-2);
}
.drawer-item .di-icon {
  font-size: 1.1rem;
}
.drawer-item .di-label {
  font-weight: 500;
}
.drawer-item .di-desc {
  grid-column: 2;
  font-size: 0.7rem;
  color: var(--text-3);
}
.drawer-item.active {
  color: #fff;
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.2), transparent);
}
.drawer-item.active::before {
  content: '';
  position: absolute;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.3s var(--ease);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(-100%);
}
</style>
