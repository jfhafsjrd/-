import { createRouter, createWebHistory } from 'vue-router'
import { modules } from './modules'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...modules.map((m) => ({
      path: m.path,
      name: m.name,
      component: m.view,
      meta: { title: m.label, icon: m.icon },
    })),
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Life OS` : 'Life OS · 探索者仪表盘'
})

export default router
