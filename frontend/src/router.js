import { createRouter, createWebHistory } from 'vue-router'
import { t } from './i18n'

const routes = [
  { path: '/', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: t('Tableau de bord') } },
  { path: '/dashboard/:id', name: 'dashboard-id', component: () => import('./views/Dashboard.vue'), meta: { title: t('Tableau de bord') } },
  { path: '/devices', name: 'devices', component: () => import('./views/Devices.vue'), meta: { title: t('Équipements') } },
  { path: '/device/:host/:tab?', name: 'device', component: () => import('./views/DeviceDetail.vue'), meta: { title: t('Équipement') } },
  { path: '/port/:id', name: 'port', component: () => import('./views/PortDetail.vue'), meta: { title: t('Port') } },
  { path: '/ports', name: 'ports', component: () => import('./views/Ports.vue'), meta: { title: t('Ports') } },
  { path: '/health', name: 'health', component: () => import('./views/Health.vue'), meta: { title: t('Santé') } },
  { path: '/alerts/:tab?', name: 'alerts', component: () => import('./views/Alerts.vue'), meta: { title: t('Alertes') } },
  { path: '/logs/:tab?', name: 'logs', component: () => import('./views/Logs.vue'), meta: { title: t('Journaux') } },
  { path: '/map', name: 'map', component: () => import('./views/MapView.vue'), meta: { title: t('Carte') } },
  { path: '/diagrams', name: 'diagrams', component: () => import('./views/Diagrams.vue'), meta: { title: t('Schémas') } },
  { path: '/diagrams/:id', name: 'diagram', component: () => import('./views/DiagramEditor.vue'), meta: { title: t('Schéma') } },
  { path: '/racks', name: 'racks', component: () => import('./views/Racks.vue'), meta: { title: t('Baies') } },
  { path: '/racks/:id', name: 'rack', component: () => import('./views/RackEditor.vue'), meta: { title: t('Baies') } },
  { path: '/topology', name: 'topology', component: () => import('./views/Topology.vue'), meta: { title: t('Topologie') } },
  { path: '/groups/:tab?', name: 'groups', component: () => import('./views/Groups.vue'), meta: { title: t('Groupes') } },
  { path: '/locations', name: 'locations', component: () => import('./views/Locations.vue'), meta: { title: t('Emplacements') } },
  { path: '/services', name: 'services', component: () => import('./views/Services.vue'), meta: { title: t('Services') } },
  { path: '/routing/:tab?', name: 'routing', component: () => import('./views/Routing.vue'), meta: { title: t('Routage') } },
  { path: '/resources/:tab?', name: 'resources', component: () => import('./views/Resources.vue'), meta: { title: t('Ressources réseau') } },
  { path: '/bills', name: 'bills', component: () => import('./views/Bills.vue'), meta: { title: t('Facturation') } },
  { path: '/system', name: 'system', component: () => import('./views/System.vue'), meta: { title: t('Système') } },
  { path: '/explorer', name: 'explorer', component: () => import('./views/Explorer.vue'), meta: { title: t('Explorateur API') } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || (to.name !== from.name ? { top: 0 } : undefined),
})
router.afterEach((to) => { document.title = `${to.meta.title || ''} · LibreNMS XUI` })
export default router
