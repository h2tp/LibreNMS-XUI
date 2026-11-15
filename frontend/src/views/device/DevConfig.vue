<template>
  <div class="card">
    <div class="card-title"><FileCode2 :size="17" /> {{ t('Configuration (Oxidized)') }}
      <div class="right">
        <div class="row search-in"><Search :size="15" class="faint" /><input v-model="q" class="input" :placeholder="t('Rechercher dans la config…')" /></div>
        <button v-if="config" class="btn sm" @click="download"><Download /> {{ t('Télécharger') }}</button>
      </div>
    </div>
    <div v-if="loading" class="skeleton" style="height:300px"></div>
    <div v-else-if="error" class="empty"><FileX2 /><div>Configuration indisponible : {{ error }}</div><div class="small faint">{{ t('Nécessite l\'intégration Oxidized dans LibreNMS.') }}</div></div>
    <pre v-else class="code cfg"><template v-for="(l, i) in lines" :key="i"><span class="ln">{{ i + 1 }}</span><span :class="{ hl: q && l.toLowerCase().includes(q.toLowerCase()) }">{{ l }}</span>
</template></pre>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { FileCode2, Search, Download, FileX2 } from 'lucide-vue-next'
import { api, L } from '../../api'
import { useLoader } from '../../refresh'
import { t } from '../../i18n'
const props = defineProps({ device: Object })
const config = ref('')
const q = ref('')
const lines = computed(() => config.value.split('\n'))
const { loading, error } = useLoader(async () => {
  const r = await api.get(`oxidized/config/${L.enc(props.device.hostname)}`)
  config.value = typeof r === 'string' ? r : r.config || ''
  if (!config.value) throw new Error('vide')
}, { auto: false })
function download() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([config.value], { type: 'text/plain' })); a.download = `${props.device.hostname}.cfg`; a.click()
}
</script>
<style scoped>
.cfg { max-height: 70vh; line-height: 1.55; }
.ln { display: inline-block; width: 44px; color: var(--faint); user-select: none; text-align: right; padding-right: 12px; }
.hl { background: rgba(250, 204, 21, .25); border-radius: 3px; }
.search-in { position: relative; } .search-in svg { position: absolute; left: 11px; } .search-in .input { padding-left: 34px; width: 240px; }
</style>
