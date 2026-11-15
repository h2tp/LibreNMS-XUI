<template>
  <div class="card">
    <div class="card-title"><Puzzle :size="17" /> {{ t('Composants') }}</div>
    <ApiTable :path="`devices/${enc(device.hostname)}/components`" list-key="components" :columns="cols" :filename="`composants-${device.hostname}.csv`" empty-text="Aucun composant">
      <template #c-status="{ row }"><span class="badge" :class="{ 0: 'ok', 1: 'warning', 2: 'critical' }[row.status] || 'info'">{{ row.status }}</span></template>
    </ApiTable>
  </div>
</template>
<script setup>
import { Puzzle } from 'lucide-vue-next'
import ApiTable from '../../components/ApiTable.vue'
import { L } from '../../api'
import { t } from '../../i18n'
defineProps({ device: Object })
const enc = L.enc
const cols = [{ key: 'id', label: 'ID' }, { key: 'type', label: t('Type') }, { key: 'label', label: t('Libellé') }, { key: 'status', label: t('État') }, { key: 'disabled', label: t('Désactivé') }, { key: 'ignore', label: t('Ignoré') }, { key: 'error', label: t('Erreur') }]
</script>
