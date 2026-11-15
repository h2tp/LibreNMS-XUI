import { createApp } from 'vue'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import 'leaflet/dist/leaflet.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { toast } from './utils'
import { t } from './i18n'

const app = createApp(App)
app.config.errorHandler = (err, inst, info) => {
  console.error(err, info)
  toast(t('Erreur d\'affichage : {msg}', { msg: err?.message || err }), 'error', 8000)
}
window.addEventListener('unhandledrejection', (e) => console.error('Promesse rejetée :', e.reason))
app.use(router).mount('#app')
