<template>
  <div class="card">
    <div class="card-title"><Puzzle :size="17" /> Composants</div>
    <ApiTable :path="`devices/${enc(device.hostname)}/components`" list-key="components" :columns="cols" :filename="`composants-${device.hostname}.csv`" empty-text="Aucun composant">
      <template #c-status="{ row }"><span class="badge" :class="{ 0: 'ok', 1: 'warning', 2: 'critical' }[row.status] || 'info'">{{ row.status }}</span></template>
    </ApiTable>
  </div>
</template>
<script setup>
import { Puzzle } from 'lucide-vue-next'
import ApiTable from '../../components/ApiTable.vue'
import { L } from '../../api'
defineProps({ device: Object })
const enc = L.enc
const cols = [{ key: 'id', label: 'ID' }, { key: 'type', label: 'Type' }, { key: 'label', label: 'Libellé' }, { key: 'status', label: 'État' }, { key: 'disabled', label: 'Désactivé' }, { key: 'ignore', label: 'Ignoré' }, { key: 'error', label: 'Erreur' }]
</script>
