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

/* 写操作被拒（403 访客只读）→ 右下角解锁卡：输一次口令恢复站主身份 */
const unlockShow = ref(false)
const unlockCode = ref('')
const unlockErr = ref('')
const unlockBusy = ref(false)
onMounted(() => {
  window.addEventListener('lifeos:403', () => {
    unlockShow.value = true
  })
})
async function doUnlock() {
  if (!unlockCode.value.trim() || unlockBusy.value) return
  unlockBusy.value = true
  unlockErr.value = ''
  try {
    const r = await api.auth.login(unlockCode.value.trim())
    localStorage.setItem('lifeos_token', r.token)
    unlockShow.value = false
    setTimeout(() => window.location.reload(), 200)
  } catch (e) {
    unlockErr.value = e.message
  } finally {
    unlockBusy.value = false
  }
}
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

  <!-- 站主解锁卡：写操作被拒时出现在右下角 -->
  <Transition name="unlock">
    <div v-if="unlockShow" class="unlock-card glass-card">
      <div class="uc-head">
        <span class="uc-ico">🔒</span>
        <div class="uc-txt">
          <b>当前是访客身份（只读）</b>
          <span>删除、同步等修改操作需要解锁</span>
        </div>
        <button class="uc-close" aria-label="关闭" @click="unlockShow = false">✕</button>
      </div>
      <form class="uc-form" @submit.prevent="doUnlock">
        <input
          v-model="unlockCode"
          type="password"
          class="input uc-input"
          placeholder="站主口令"
          autocomplete="current-password"
          autofocus
        />
        <button class="btn primary uc-btn" type="submit" :disabled="unlockBusy || !unlockCode.trim()">
          {{ unlockBusy ? '解锁中…' : '解锁' }}
        </button>
      </form>
      <p v-if="unlockErr" class="uc-err">{{ unlockErr }}</p>
    </div>
  </Transition>
</template>

<style scoped>
.main {
  margin-left: var(--sidebar-w);
  padding: 30px clamp(20px, 3vw, 48px) 60px;
  min-height: 100vh;
  position: relative;
  z-index: var(--z-content);
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

/* 站主解锁卡 */
.unlock-card {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 160;
  width: min(340px, calc(100vw - 40px));
  padding: 16px 18px;
  border-color: var(--border-strong);
  box-shadow: var(--shadow-lift);
}
.uc-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.uc-ico {
  font-size: 1.2rem;
}
.uc-txt {
  flex: 1;
  display: grid;
  gap: 1px;
  min-width: 0;
}
.uc-txt b {
  font-size: 0.88rem;
}
.uc-txt span {
  font-size: 0.72rem;
  color: var(--text-3);
}
.uc-close {
  border: none;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 4px 6px;
}
.uc-close:hover {
  color: var(--text-1);
}
.uc-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.uc-input {
  flex: 1;
  padding: 8px 12px;
}
.uc-btn {
  flex-shrink: 0;
}
.uc-err {
  margin-top: 8px;
  font-size: 0.76rem;
  color: var(--danger);
}
.unlock-enter-active,
.unlock-leave-active {
  transition: opacity 0.22s ease, transform 0.22s var(--ease);
}
.unlock-enter-from,
.unlock-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
