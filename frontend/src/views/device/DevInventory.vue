<template>
  <div class="card">
    <div class="card-title"><Boxes :size="17" /> {{ t('Inventaire matériel') }} <span class="sub">{{ t('{n} éléments', { n: items.length }) }}</span>
      <div class="right"><div class="seg"><button :class="{ on: view === 'tree' }" @click="view = 'tree'">{{ t('Arborescence') }}</button><button :class="{ on: view === 'table' }" @click="view = 'table'">{{ t('Tableau') }}</button></div></div>
    </div>
    <div v-if="loading" class="col"><div v-for="i in 6" :key="i" class="skeleton" style="height:30px"></div></div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <div v-else-if="!items.length" class="empty"><Boxes /><div>{{ t('Aucun inventaire (ENTITY-MIB) pour cet équipement') }}</div></div>
    <div v-else-if="view === 'tree'" class="tree">
      <InvNode v-for="n in roots" :key="n.entPhysicalIndex" :node="n" :children="children" :depth="0" />
    </div>
    <DataTable v-else :rows="items" :columns="cols" :filename="`inventaire-${device.hostname}.csv`" />
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { Boxes } from 'lucide-vue-next'
import DataTable from '../../components/DataTable.vue'
import InvNode from '../../components/InvNode.vue'
import { api, pick, L } from '../../api'
import { useLoader } from '../../refresh'
import { t } from '../../i18n'
const props = defineProps({ device: Object })
const items = ref([])
const view = ref('tree')
const children = computed(() => {
  const m = {}
  items.value.forEach((i) => { (m[i.entPhysicalContainedIn] ||= []).push(i) })
  Object.values(m).forEach((a) => a.sort((x, y) => (+x.entPhysicalParentRelPos || 0) - (+y.entPhysicalParentRelPos || 0)))
  return m
})
const roots = computed(() => {
  const idx = new Set(items.value.map((i) => String(i.entPhysicalIndex)))
  return items.value.filter((i) => !idx.has(String(i.entPhysicalContainedIn)))
})
const cols = [
  { key: 'entPhysicalIndex', label: t('Index') }, { key: 'entPhysicalDescr', label: t('Description') }, { key: 'entPhysicalClass', label: t('Classe') },
  { key: 'entPhysicalName', label: t('Nom') }, { key: 'entPhysicalModelName', label: t('Modèle') }, { key: 'entPhysicalSerialNum', label: t('N° série'), class: 'mono' },
  { key: 'entPhysicalHardwareRev', label: t('Rév. HW') }, { key: 'entPhysicalFirmwareRev', label: t('Firmware') }, { key: 'entPhysicalSoftwareRev', label: t('Logiciel') },
  { key: 'entPhysicalMfgName', label: t('Fabricant') },
]
const { loading, error } = useLoader(async () => {
  items.value = pick(await api.get(`inventory/${L.enc(props.device.hostname)}/all`), 'inventory')
}, { auto: false })
</script>
<style scoped>
.tree { font-size: 13px; }
</style>
