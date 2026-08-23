<script setup>
import { onMounted, ref } from 'vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import MobileHeader from '@/components/layout/MobileHeader.vue'
import LowPolyBg from '@/components/layout/LowPolyBg.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import AuthGate from '@/components/common/AuthGate.vue'
import { api } from '@/api'

const booting = ref(true)
onMounted(() => setTimeout(() => (booting.value = false), 350))

/* 访问码登录门：启动时查询 + 任意接口 401（令牌失效/被改码）时重新落下 */
const needAuth = ref(false)
onMounted(async () => {
  try {
    const s = await api.auth.status()
    if (s.required && !s.authorized) needAuth.value = true
  } catch {
    /* 查询失败不打门，业务接口报错时由 401 事件兜底 */
  }
})
window.addEventListener('lifeos:401', () => {
  localStorage.removeItem('lifeos_token')
  needAuth.value = true
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

  <AuthGate v-if="needAuth" />

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
