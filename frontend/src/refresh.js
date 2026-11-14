import { reactive, watch, onMounted, onBeforeUnmount, ref } from 'vue'
import { prefs } from './utils'

export const clock = reactive({ tick: 0, last: Date.now() })
let timer = null
function arm() {
  clearInterval(timer)
  if (prefs.refresh > 0) timer = setInterval(() => { if (!document.hidden) { clock.tick++; clock.last = Date.now() } }, prefs.refresh * 1000)
}
watch(() => prefs.refresh, arm, { immediate: true })
export function refreshNow() { clock.tick++; clock.last = Date.now() }

/**
 * Charge des données et les recharge à chaque tick global.
 * fn reçoit {silent} : true lors des rafraîchissements automatiques.
 */
export function useLoader(fn, { auto = true, immediate = true } = {}) {
  const loading = ref(false)
  const error = ref(null)
  let seq = 0
  async function run(silent = false) {
    const my = ++seq
    if (!silent) loading.value = true
    try {
      await fn({ silent })
      if (my === seq) error.value = null
    } catch (e) {
      if (my === seq) error.value = e?.message || String(e)
    } finally {
      if (my === seq) loading.value = false
    }
  }
  let stop = null
  onMounted(() => {
    if (immediate) run()
    if (auto) stop = watch(() => clock.tick, () => run(true))
  })
  onBeforeUnmount(() => stop && stop())
  return { loading, error, reload: run }
}
