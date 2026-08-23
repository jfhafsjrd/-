/**
 * Toast 通知 — composable
 * 用法：
 *   const toast = useToast()
 *   toast.success('已加入待看')
 *   toast.error('网络超时')
 */
import { reactive } from 'vue'

const state = reactive({ list: [] })
let uid = 0

function push(type, message, duration = 2600) {
  const id = ++uid
  state.list.push({ id, type, message })
  if (state.list.length > 5) state.list.shift()
  setTimeout(() => {
    const i = state.list.findIndex((t) => t.id === id)
    if (i > -1) state.list.splice(i, 1)
  }, duration)
  return id
}

export function useToast() {
  return {
    list: state.list,
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, 4000),
    info: (m, d) => push('info', m, d),
  }
}
