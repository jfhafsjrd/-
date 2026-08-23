/**
 * 模块注册表 —— Life OS 的可扩展核心
 *
 * 新增模块三步走：
 *   1. src/components/<模块名>/ 下创建 XxxView.vue
 *   2. 在此数组追加一项（路径 /xxx，懒加载组件）
 *   3. 后端需要数据的话在 server/routes/ 加同名路由并挂到 app.js
 * 侧边栏、移动端菜单、路由表全部由本表驱动，无需改动其他文件。
 */
import HomeView from '@/components/home/HomeView.vue'

export const modules = [
  { path: '/', name: 'home', label: '首页', icon: '🏠', view: HomeView, desc: '总览面板' },
  { path: '/movies', name: 'movies', label: '影视', icon: '🎬', view: () => import('@/components/movies/MoviesView.vue'), desc: '待看录 · 已看完' },
  { path: '/games', name: 'games', label: '游戏', icon: '🎮', view: () => import('@/components/games/GamesView.vue'), desc: '成就仓 · 荣誉墙' },
  { path: '/calendar', name: 'calendar', label: '日历', icon: '📅', view: () => import('@/components/calendar/CalendarView.vue'), desc: '日程 · 待办' },
  { path: '/github', name: 'github', label: 'GitHub', icon: '🐙', view: () => import('@/components/github/GithubView.vue'), desc: '追更仓 · 雷达' },
  { path: '/links', name: 'links', label: '导航', icon: '🔗', view: () => import('@/components/links/LinksView.vue'), desc: '书签 · 存活检测' },
]
