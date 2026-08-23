<script setup>
/**
 * 命令面板（Ctrl+K）— 全局快捷操作中心
 * 跳转模块 · 搜影视库 · 搜书签 · 快捷动作，模糊匹配 + 键盘导航
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { modules } from '@/router/modules'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const router = useRouter()

const query = ref('')
const activeIdx = ref(0)
const inputEl = ref(null)

/* 懒加载数据源：首次打开才拉，之后走缓存 */
const moviesCache = ref(null)
const linksCache = ref(null)
async function warmup() {
  if (!moviesCache.value) api.movies.list().then((l) => (moviesCache.value = l)).catch(() => {})
  if (!linksCache.value) api.links.list().then((l) => (linksCache.value = Array.isArray(l) ? l : l.items || [])).catch(() => {})
}

const open = computed(() => props.modelValue)
watch(open, async (v) => {
  if (v) {
    query.value = ''
    activeIdx.value = 0
    await nextTick()
    inputEl.value?.focus()
    warmup()
  }
})

/* ---------- 命令清单 ---------- */
const commands = computed(() => {
  const list = []
  for (const m of modules) {
    list.push({ group: '跳转', icon: m.icon, label: `前往 ${m.label}`, desc: m.desc, run: () => router.push(m.path) })
  }
  list.push(
    {
      group: '动作', icon: '🔄', label: '同步 Trakt 观看记录', desc: '拉取待看/已看/评分',
      run: () => router.push('/movies'),
    },
    {
      group: '动作', icon: '☀️', label: '切换 明亮/暗黑 主题', desc: '即时生效并记忆',
      run: () => {
        const next = (localStorage.getItem('lifeos_theme') === 'light' ? 'dark' : 'light')
        document.documentElement.dataset.theme = next
        localStorage.setItem('lifeos_theme', next)
        window.dispatchEvent(new CustomEvent('lifeos:theme'))
      },
    },
  )
  for (const m of moviesCache.value || []) {
    list.push({
      group: '影视', icon: m.type === 'tv' ? '📺' : '🎞️', label: m.title,
      desc: `${m.year || ''} ${m.status === 'done' ? '· 已看完' : '· 待看'}${m.airedEps > 0 ? ` · ${m.watchedEps || 0}/${m.airedEps}集` : ''}`,
      run: () => router.push('/movies'),
    })
  }
  for (const l of linksCache.value || []) {
    list.push({ group: '书签', icon: l.emoji || '🔗', label: l.title || l.name || '', desc: l.url || l.link || '', run: () => window.open(l.url || l.link, '_blank') })
  }
  return list.filter((x) => x.label)
})

/* 模糊匹配：子串打分（连续命中 > 分散命中 > 前缀 > 包含），空查询显示导航+动作 */
function score(text, q) {
  if (!q) return 1
  const t = String(text).toLowerCase()
  const s = q.toLowerCase()
  const idx = t.indexOf(s)
  if (idx === 0) return 100
  if (idx > 0) return 60
  /* 分散子序列 */
  let ti = 0
  let hits = 0
  for (const ch of s) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return 0
    ti = found + 1
    hits++
  }
  return 10 + hits
}

const results = computed(() => {
  if (!query.value.trim()) return commands.value.filter((c) => c.group !== '影视' && c.group !== '书签').slice(0, 10)
  return commands.value
    .map((c) => ({ c, s: Math.max(score(c.label, query.value), score(c.desc, query.value) * 0.3) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.c)
})

watch(results, () => (activeIdx.value = 0))

function pick(item) {
  emit('update:modelValue', false)
  item?.run?.()
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    pick(results.value[activeIdx.value])
  } else if (e.key === 'Escape') {
    emit('update:modelValue', false)
  }
}

function onScrollActive(el) {
  el?.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cp">
      <div v-if="open" class="cp-mask" @click.self="emit('update:modelValue', false)">
        <div class="cp-panel glass-card" @keydown="onKeydown">
          <div class="cp-input-row">
            <span class="cp-icon">⌘</span>
            <input
              ref="inputEl"
              v-model="query"
              class="cp-input"
              type="text"
              placeholder="搜索页面、影视、书签，或执行动作…"
              aria-label="命令面板"
            />
            <span class="cp-kbd mono">ESC</span>
          </div>
          <ul v-if="results.length" class="cp-list">
            <li
              v-for="(r, i) in results"
              :key="r.group + r.label + i"
              :ref="i === activeIdx ? onScrollActive : null"
              class="cp-item"
              :class="{ active: i === activeIdx }"
              @mouseenter="activeIdx = i"
              @click="pick(r)"
            >
              <span class="cp-item-icon">{{ r.icon }}</span>
              <span class="cp-item-label">{{ r.label }}</span>
              <span class="cp-item-desc">{{ r.desc }}</span>
              <span class="cp-item-group mono">{{ r.group }}</span>
            </li>
          </ul>
          <div v-else class="cp-empty">没有匹配的结果</div>
          <footer class="cp-foot">
            <span><i class="cp-kbd mono">↑↓</i> 选择</span>
            <span><i class="cp-kbd mono">Enter</i> 执行</span>
            <span><i class="cp-kbd mono">Ctrl K</i> 呼出</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cp-mask {
  position: fixed;
  inset: 0;
  z-index: 250;
  background: rgba(4, 5, 10, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
}
.cp-panel {
  width: min(600px, calc(100vw - 40px));
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  border-color: var(--border-strong);
}
.cp-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border);
}
.cp-icon {
  font-size: 1.1rem;
  color: var(--text-3);
}
.cp-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-1);
  font-size: 1rem;
  font-family: inherit;
}
.cp-input::placeholder {
  color: var(--text-3);
}
.cp-kbd {
  font-size: 0.66rem;
  color: var(--text-3);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 6px;
  font-style: normal;
}
.cp-list {
  max-height: 46vh;
  overflow-y: auto;
  padding: 8px;
  list-style: none;
}
.cp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--dur-fast);
}
.cp-item.active {
  background: var(--accent-soft);
}
.cp-item-icon {
  font-size: 1.05rem;
  flex-shrink: 0;
  width: 22px;
  text-align: center;
}
.cp-item-label {
  color: var(--text-1);
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 45%;
}
.cp-item-desc {
  flex: 1;
  color: var(--text-3);
  font-size: 0.76rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-item-group {
  font-size: 0.62rem;
  color: var(--accent);
  border: 1px solid var(--border-strong);
  border-radius: 99px;
  padding: 1px 8px;
  flex-shrink: 0;
}
.cp-empty {
  padding: 28px;
  text-align: center;
  color: var(--text-3);
  font-size: 0.86rem;
}
.cp-foot {
  display: flex;
  gap: 16px;
  padding: 10px 18px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 0.72rem;
}
.cp-foot span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* 进出场 */
.cp-enter-active,
.cp-leave-active {
  transition: opacity 0.16s ease;
}
.cp-enter-active .cp-panel,
.cp-leave-active .cp-panel {
  transition: transform 0.18s var(--ease);
}
.cp-enter-from,
.cp-leave-to {
  opacity: 0;
}
.cp-enter-from .cp-panel,
.cp-leave-to .cp-panel {
  transform: translateY(-10px) scale(0.98);
}
</style>
