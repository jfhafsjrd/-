<script setup>
/**
 * 阅读书架 — 小说/漫画导入、进度续读、管理
 * 点击书籍进入沉浸阅读（TXT 分栏翻页 / 漫画逐页）
 */
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useToast } from '@/composables/useToast'
import StateShell from '@/components/common/StateShell.vue'
import TxtReader from './TxtReader.vue'
import ComicReader from './ComicReader.vue'

const toast = useToast()
const books = ref([])
const loading = ref(true)
const error = ref('')
const importing = ref(false)
const importPct = ref(0)
const fileEl = ref(null)

const reading = ref(null) // 当前打开的书对象

async function load() {
  loading.value = true
  error.value = ''
  try {
    books.value = await api.reader.list()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.size > 280 * 1024 * 1024) return toast.error('文件超过 280MB，请拆分后导入')
  importing.value = true
  importPct.value = 0
  try {
    const book = await api.reader.upload(file, (p) => (importPct.value = p))
    toast.success(`《${book.title}》导入成功`)
    await load()
  } catch (err) {
    toast.error(err.message)
  } finally {
    importing.value = false
  }
}

function open(book) {
  reading.value = book
}

async function removeBook(book) {
  if (!confirm(`删除《${book.title}》？文件和进度将一并清除`)) return
  try {
    await api.reader.remove(book.id)
    books.value = books.value.filter((b) => b.id !== book.id)
    toast.info('已删除')
  } catch (e) {
    toast.error(e.message)
  }
}

const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

const sorted = computed(() => [...books.value])
</script>

<template>
  <div class="rd-root">
    <div class="page-head">
      <div>
        <h1 class="page-title">📖 阅读书房</h1>
        <p class="page-sub">小说 · 漫画 · 沉浸阅读 · 进度自动记忆</p>
      </div>
      <div class="head-right">
        <input ref="fileEl" type="file" accept=".txt,.cbz,.zip" hidden @change="onFile" />
        <button class="btn primary" :disabled="importing" @click="fileEl?.click()">
          {{ importing ? `导入中 ${importPct}%` : '📥 导入书籍' }}
        </button>
      </div>
    </div>

    <div v-if="importing" class="import-bar glass-card">
      <div class="ib-track"><i :style="{ width: importPct + '%' }"></i></div>
    </div>

    <StateShell :loading="loading" :error="error" :empty="!sorted.length"
      empty-emoji="📚" empty-text="书房还是空的" empty-sub="导入 TXT 小说或 CBZ/ZIP 漫画开始阅读"
      :rows="3" @retry="load">
      <div class="shelf-grid">
        <article v-for="b in sorted" :key="b.id" class="bk-card glass-card hoverable" @click="open(b)">
          <div class="bk-cover" :class="b.type">
            <img v-if="b.type === 'cbz'" :src="api.reader.coverUrl(b.id)" loading="lazy" :alt="b.title" />
            <div v-else class="bk-spine">
              <span class="bk-icon">📕</span>
              <strong>{{ b.title.slice(0, 12) }}</strong>
            </div>
            <span class="bk-type">{{ b.type === 'txt' ? '小说' : '漫画' }}</span>
          </div>
          <div class="bk-body">
            <h3 class="bk-title">{{ b.title }}</h3>
            <p class="bk-meta mono">
              {{ b.type === 'txt' ? `${b.chapterCount} 章 · ${Math.round((b.chars || 0) / 10000)}万字` : `${b.pages} 页` }}
              · {{ fmtSize(b.size || 0) }}
            </p>
            <div class="bk-progress">
              <span class="bk-bar"><i :style="{ width: (b.pct || 0) + '%' }"></i></span>
              <span class="mono bk-pct">{{ Math.round(b.pct || 0) }}%</span>
            </div>
          </div>
          <button class="icon-btn danger bk-del" aria-label="删除" @click.stop="removeBook(b)">✕</button>
        </article>
      </div>
    </StateShell>

    <!-- 沉浸阅读器 -->
    <TxtReader v-if="reading?.type === 'txt'" :book="reading" @close="reading = null; load()" />
    <ComicReader v-else-if="reading?.type === 'cbz'" :book="reading" @close="reading = null; load()" />
  </div>
</template>

<style scoped>
.rd-root { display: flex; flex-direction: column; gap: 18px; }
.import-bar { padding: 12px 16px; }
.ib-track { height: 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.ib-track i { display: block; height: 100%; background: var(--accent-grad); transition: width 0.2s; }

.shelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
.bk-card { padding: 12px; cursor: pointer; position: relative; }
.bk-cover { aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden; background: var(--bg-2); border: 1px solid var(--border); position: relative; }
.bk-cover img { width: 100%; height: 100%; object-fit: cover; }
.bk-spine { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 14px;
  background: linear-gradient(160deg, rgba(124, 58, 237, 0.25), rgba(99, 102, 241, 0.12)); text-align: center; }
.bk-spine .bk-icon { font-size: 2rem; }
.bk-spine strong { font-size: 0.85rem; color: var(--text-1); line-height: 1.5; }
.bk-type { position: absolute; top: 8px; right: 8px; font-size: 0.64rem; padding: 2px 8px; border-radius: 99px;
  background: rgba(10, 11, 16, 0.6); color: #fff; backdrop-filter: blur(4px); }
.bk-body { padding: 10px 2px 2px; display: grid; gap: 5px; }
.bk-title { font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bk-meta { font-size: 0.7rem; color: var(--text-3); }
.bk-progress { display: flex; align-items: center; gap: 8px; }
.bk-bar { flex: 1; height: 4px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.bk-bar i { display: block; height: 100%; background: linear-gradient(90deg, #a855f7, #6366f1); }
.bk-pct { font-size: 0.66rem; color: var(--text-3); }
.bk-del { position: absolute; top: 8px; left: 8px; opacity: 0; transition: opacity var(--dur-fast); background: rgba(10, 11, 16, 0.55); color: #fff; }
.bk-card:hover .bk-del { opacity: 1; }
</style>
