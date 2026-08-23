<script setup>
/**
 * 访问码登录门 — 服务端设置 ACCESS_CODE 后全站生效
 * 登录成功存储令牌并刷新页面（各视图重新拉数据，状态最干净）
 */
import { ref } from 'vue'
import { api } from '@/api'

const emit = defineEmits(['authorized'])

const code = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (!code.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const r = await api.auth.login(code.value.trim())
    localStorage.setItem('lifeos_token', r.token)
    emit('authorized')
    setTimeout(() => window.location.reload(), 150)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-mask">
    <form class="auth-card glass-card" @submit.prevent="submit">
      <div class="auth-logo">⚡</div>
      <h2>Life OS</h2>
      <p class="auth-sub">私人仪表盘 · 请输入访问码</p>
      <input
        v-model="code"
        type="password"
        class="input auth-input"
        placeholder="访问码"
        autocomplete="current-password"
        autofocus
        :disabled="loading"
        @input="error = ''"
      />
      <button class="btn primary auth-btn" type="submit" :disabled="loading || !code.trim()">
        {{ loading ? '验证中…' : '进入' }}
      </button>
      <p v-if="error" class="auth-error">{{ error }}</p>
    </form>
  </div>
</template>

<style scoped>
.auth-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-content: center;
  justify-items: center;
  background: var(--bg-0);
}
.auth-card {
  width: min(360px, calc(100vw - 48px));
  padding: 38px 34px 30px;
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
}
.auth-logo {
  font-size: 40px;
  filter: drop-shadow(0 0 16px var(--accent-glow));
}
.auth-card h2 {
  font-size: 1.3rem;
  letter-spacing: 0.12em;
}
.auth-sub {
  color: var(--text-3);
  font-size: 0.85rem;
  margin-top: -8px;
}
.auth-input {
  text-align: center;
  letter-spacing: 0.3em;
}
.auth-btn {
  width: 100%;
  justify-content: center;
}
.auth-error {
  color: #f87171;
  font-size: 0.82rem;
  min-height: 1em;
}
</style>
