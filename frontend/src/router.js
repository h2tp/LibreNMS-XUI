import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: 'Tableau de bord' } },
  { path: '/dashboard/:id', name: 'dashboard-id', component: () => import('./views/Dashboard.vue'), meta: { title: 'Tableau de bord' } },
  { path: '/devices', name: 'devices', component: () => import('./views/Devices.vue'), meta: { title: 'Équipements' } },
  { path: '/device/:host/:tab?', name: 'device', component: () => import('./views/DeviceDetail.vue'), meta: { title: 'Équipement' } },
  { path: '/port/:id', name: 'port', component: () => import('./views/PortDetail.vue'), meta: { title: 'Port' } },
  { path: '/ports', name: 'ports', component: () => import('./views/Ports.vue'), meta: { title: 'Ports' } },
  { path: '/health', name: 'health', component: () => import('./views/Health.vue'), meta: { title: 'Santé' } },
  { path: '/alerts/:tab?', name: 'alerts', component: () => import('./views/Alerts.vue'), meta: { title: 'Alertes' } },
  { path: '/logs/:tab?', name: 'logs', component: () => import('./views/Logs.vue'), meta: { title: 'Journaux' } },
  { path: '/map', name: 'map', component: () => import('./views/MapView.vue'), meta: { title: 'Carte' } },
  { path: '/diagrams', name: 'diagrams', component: () => import('./views/Diagrams.vue'), meta: { title: 'Schémas' } },
  { path: '/diagrams/:id', name: 'diagram', component: () => import('./views/DiagramEditor.vue'), meta: { title: 'Schéma' } },
  { path: '/topology', name: 'topology', component: () => import('./views/Topology.vue'), meta: { title: 'Topologie' } },
  { path: '/groups/:tab?', name: 'groups', component: () => import('./views/Groups.vue'), meta: { title: 'Groupes' } },
  { path: '/locations', name: 'locations', component: () => import('./views/Locations.vue'), meta: { title: 'Emplacements' } },
  { path: '/services', name: 'services', component: () => import('./views/Services.vue'), meta: { title: 'Services' } },
  { path: '/routing/:tab?', name: 'routing', component: () => import('./views/Routing.vue'), meta: { title: 'Routage' } },
  { path: '/resources/:tab?', name: 'resources', component: () => import('./views/Resources.vue'), meta: { title: 'Ressources réseau' } },
  { path: '/bills', name: 'bills', component: () => import('./views/Bills.vue'), meta: { title: 'Facturation' } },
  { path: '/system', name: 'system', component: () => import('./views/System.vue'), meta: { title: 'Système' } },
  { path: '/explorer', name: 'explorer', component: () => import('./views/Explorer.vue'), meta: { title: 'Explorateur API' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || (to.name !== from.name ? { top: 0 } : undefined),
})
router.afterEach((to) => { document.title = `${to.meta.title || ''} · LibreNMS XUI` })
export default router
