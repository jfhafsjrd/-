<script setup>
/**
 * 极客导航仓 — 分类网格 + 拼音/首字母模糊搜索 + 存活检测
 * 搜索在后端做 LIKE；拼音首字母匹配用简单策略：标题、URL、备注 + 用户自定义 alias 字段
 */
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useToast } from '@/composables/useToast'
import StateShell from '@/components/common/StateShell.vue'
import IconSvg from '@/components/common/IconSvg.vue'
import Modal from '@/components/common/Modal.vue'

const toast = useToast()

const links = ref([])
const loading = ref(true)
const error = ref('')
const keyword = ref('')
const checking = ref(false)

const editShow = ref(false)
const editForm = ref(null) // { id?, title, url, icon, category, note }
const saving = ref(false)
const delTarget = ref(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    links.value = await api.links.list()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* 客户端过滤（后端 LIKE 之外的拼音首字母支持：匹配自定义 alias） */
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return links.value
  return links.value.filter((l) =>
    [l.title, l.url, l.note, l.alias].some((f) => String(f || '').toLowerCase().includes(q)),
  )
})

const groups = computed(() => {
  const map = new Map()
  for (const l of filtered.value) {
    const cat = l.category || '其他'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat).push(l)
  }
  return [...map.entries()]
})

async function checkAll() {
  checking.value = true
  toast.info('存活检测中…')
  try {
    await api.links.checkAll()
    await load()
    toast.success('检测完成')
  } catch (e) {
    toast.error(e.message)
  } finally {
    checking.value = false
  }
}

function openAdd() {
  editForm.value = { title: '', url: '', icon: '', category: '工具', note: '', alias: '' }
  editShow.value = true
}

function openEdit(l) {
  editForm.value = { id: l.id, title: l.title, url: l.url, icon: l.icon, category: l.category, note: l.note || '', alias: l.alias || '' }
  editShow.value = true
}

async function save() {
  const f = editForm.value
  if (!f.title.trim() || !f.url.trim()) {
    toast.error('名称和 URL 不能为空')
    return
  }
  saving.value = true
  try {
    if (f.id) await api.links.update(f.id, f)
    else await api.links.add(f)
    toast.success(f.id ? '已更新' : '已添加')
    editShow.value = false
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function doDelete() {
  try {
    await api.links.remove(delTarget.value.id)
    links.value = links.value.filter((l) => l.id !== delTarget.value.id)
    toast.info(`已删除 ${delTarget.value.title}`)
    delTarget.value = null
  } catch (e) {
    toast.error(e.message)
  }
}

const favicon = (url) => {
  try {
    const u = new URL(url)
    return `${u.origin}/favicon.ico`
  } catch {
    return ''
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">🔗 极客导航仓</h1>
        <p class="page-sub">{{ links.length }} 个书签 · 失效自动标红</p>
      </div>
      <div class="head-actions">
        <div class="search-box">
          <IconSvg name="search" :size="15" />
          <input v-model="keyword" type="text" class="si" placeholder="搜名称 / 网址 / 别名…" aria-label="搜索书签" />
        </div>
        <button class="btn" :disabled="checking" @click="checkAll">
          <IconSvg name="refresh" :size="14" />
          {{ checking ? '检测中…' : '存活检测' }}
        </button>
        <button class="btn primary" @click="openAdd"><IconSvg name="plus" :size="15" /> 添加</button>
      </div>
    </div>

    <StateShell :loading="loading" :error="error" :empty="!links.length" empty-emoji="🧭"
      empty-text="书签架还是空的" empty-sub="添加你常用的网站，配一个别名方便拼音搜索" :rows="3" @retry="load">
      <section v-for="[cat, items] in groups" :key="cat" class="group">
        <h2 class="group-title">
          <span class="group-bar"></span>{{ cat }}
          <span class="num-badge">{{ items.length }}</span>
        </h2>
        <div class="link-grid">
          <a
            v-for="l in items"
            :key="l.id"
            :href="l.url"
            target="_blank"
            rel="noopener"
            class="link-card glass-card hoverable"
            :class="{ dead: l.alive === 'down' }"
          >
            <span class="lc-icon" :class="{ dead: l.alive === 'down' }">
              <img
                v-if="(l.icon && l.icon.startsWith('http')) || (!l.icon && favicon(l.url))"
                :src="l.icon && l.icon.startsWith('http') ? l.icon : favicon(l.url)"
                alt=""
                @error="$event.target.style.display = 'none'"
              />
              <template v-else>{{ l.icon || '🔗' }}</template>
            </span>
            <span class="lc-main">
              <strong class="lc-title">{{ l.title }}</strong>
              <span class="lc-note" v-if="l.note">{{ l.note }}</span>
            </span>
            <span v-if="l.alive === 'down'" class="dead-tag">失效</span>
            <span class="lc-ops" @click.prevent.stop>
              <button class="icon-btn" :aria-label="`编辑 ${l.title}`" @click="openEdit(l)">
                <IconSvg name="edit" :size="14" />
              </button>
              <button class="icon-btn danger" :aria-label="`删除 ${l.title}`" @click="delTarget = l">
                <IconSvg name="trash" :size="14" />
              </button>
            </span>
          </a>
        </div>
      </section>
      <div v-if="!filtered.length" class="state-box glass-card">
        <span class="emoji">🔍</span>
        <span class="msg">没有匹配「{{ keyword }}」的书签</span>
        <span class="sub">可以在书签的「别名」里加拼音，以后用拼音首字母搜</span>
      </div>
    </StateShell>

    <!-- 编辑/添加弹窗 -->
    <Modal :show="editShow" :title="editForm?.id ? '编辑书签' : '添加书签'" width="440px" @close="editShow = false">
      <div v-if="editForm" class="form">
        <label class="f-label">名称
          <input v-model="editForm.title" class="input" placeholder="网站名称" />
        </label>
        <label class="f-label">URL
          <input v-model="editForm.url" class="input" placeholder="https://…" />
        </label>
        <div class="f-row">
          <label class="f-label">图标（emoji）
            <input v-model="editForm.icon" class="input" placeholder="🧰（留空自动取站点图标）" />
          </label>
          <label class="f-label">分类
            <input v-model="editForm.category" class="input" placeholder="开发 / 工具 / 娱乐…" list="cat-presets" />
            <datalist id="cat-presets">
              <option v-for="c in [...new Set(links.map((l) => l.category))]" :key="c" :value="c" />
            </datalist>
          </label>
        </div>
        <label class="f-label">别名（拼音搜索用）
          <input v-model="editForm.alias" class="input" placeholder="例如 github → gh / 吉特哈布" />
        </label>
        <label class="f-label">备注
          <input v-model="editForm.note" class="input" placeholder="一句话说明（可选）" />
        </label>
      </div>
      <template #footer>
        <button class="btn" @click="editShow = false">取消</button>
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </Modal>

    <!-- 删除确认 -->
    <Modal :show="!!delTarget" title="删除书签" width="360px" @close="delTarget = null">
      <p style="font-size: 0.92rem">
        确定删除 <strong style="color: #c98bff">{{ delTarget?.title }}</strong> 吗？
      </p>
      <template #footer>
        <button class="btn" @click="delTarget = null">取消</button>
        <button class="btn ghost-danger" @click="doDelete">删除</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(10, 11, 18, 0.5);
  color: var(--text-3);
  width: 230px;
}
.si {
  padding: 8px 0;
  border: none;
  background: transparent;
  color: var(--text-1);
  outline: none;
  font-size: 0.86rem;
  flex: 1;
  min-width: 0;
}

.group {
  margin-bottom: 26px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 650;
  margin-bottom: 13px;
}
.group-bar {
  width: 3.5px;
  height: 17px;
  border-radius: 99px;
  background: var(--accent-grad);
  box-shadow: 0 0 10px var(--accent-glow);
}

.link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.link-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  position: relative;
  color: var(--text-1);
}
.link-card.dead {
  border-color: rgba(248, 113, 113, 0.35);
}
.lc-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  font-size: 20px;
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.18);
  flex-shrink: 0;
  overflow: hidden;
}
.lc-icon img {
  width: 20px;
  height: 20px;
}
.lc-icon.dead {
  filter: grayscale(1);
  opacity: 0.6;
}
.lc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lc-title {
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lc-note {
  font-size: 0.72rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dead-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: 0.64rem;
  font-weight: 700;
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid rgba(248, 113, 113, 0.3);
}
.lc-ops {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--dur-fast);
}
.link-card:hover .lc-ops {
  opacity: 1;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.f-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.f-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.84rem;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .search-box {
    width: 100%;
  }
  .f-row {
    grid-template-columns: 1fr;
  }
}
</style>
