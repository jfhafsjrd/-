<script setup>
import { onMounted, ref } from 'vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import MobileHeader from '@/components/layout/MobileHeader.vue'
import LowPolyBg from '@/components/layout/LowPolyBg.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import CommandPalette from '@/components/common/CommandPalette.vue'
import { api } from '@/api'

const booting = ref(true)
onMounted(() => setTimeout(() => (booting.value = false), 350))

/* 命令面板：Ctrl+K / Cmd+K 全局呼出（侧边栏按钮也可触发） */
const paletteShow = ref(false)
onMounted(() => {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      paletteShow.value = !paletteShow.value
    }
  })
  window.addEventListener('lifeos:palette', () => (paletteShow.value = true))
})

/* 站主专属链接（/?auth=口令）自动解锁写权限并从地址栏抹去口令；访客只读浏览，无任何登录框 */
onMounted(async () => {
  const params = new URLSearchParams(location.search)
  const key = params.get('auth')
  if (key) {
    try {
      const r = await api.auth.login(key)
      localStorage.setItem('lifeos_token', r.token)
    } catch {
      /* 无效链接：当作普通访客，不打扰 */
    }
    params.delete('auth')
    const qs = params.toString()
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash)
  }
})
</script>

<template>
  <LowPolyBg />

  <Transition name="boot">
    <div v-if="booting" class="boot-mask">
      <div class="boot-logo">⚡</div>
      <div class="boot-text">Life OS 启动中</div>
    </div>
  </Transition>

  <CommandPalette v-model="paletteShow" />

  <Sidebar />
  <MobileHeader />

  <main class="main">
    <RouterView v-slot="{ Component }">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>

  <ToastHost />
</template>

<style scoped>
.main {
  margin-left: var(--sidebar-w);
  padding: 30px 34px 60px;
  min-height: 100vh;
  position: relative;
  z-index: var(--z-content);
  max-width: 1360px;
}

@media (max-width: 768px) {
  .main {
    margin-left: 0;
    padding: 20px 16px 80px;
  }
}

.boot-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  background: var(--bg-0);
  transition: opacity 0.4s ease;
}
.boot-logo {
  font-size: 44px;
  animation: boot-pulse 1.2s ease-in-out infinite;
  filter: drop-shadow(0 0 18px var(--accent-glow));
}
.boot-text {
  font-size: 0.86rem;
  color: var(--text-3);
  letter-spacing: 0.28em;
}
@keyframes boot-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.88);
    opacity: 0.6;
  }
}
.boot-enter-from,
.boot-leave-to {
  opacity: 0;
}
</style>
