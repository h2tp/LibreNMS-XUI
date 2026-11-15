<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Alertes') }}</h1><div class="sub">{{ t('Alertes en cours, règles et historique') }}</div></div></div>
    <div class="tabs">
      <button v-for="tb in tabs" :key="tb.id" :class="{ on: tab === tb.id }" @click="$router.replace(`/alerts/${tb.id === 'active' ? '' : tb.id}`)"><component :is="tb.icon" />{{ tb.label }}</button>
    </div>
    <AlertsPanel v-if="tab === 'active'" />
    <RulesPanel v-else-if="tab === 'rules'" />
    <div v-else-if="tab === 'templates'" class="card"><ApiTable path="alert_templates" list-key="alert_templates" :columns="[{ key: 'id', label: 'ID' }, { key: 'name', label: t('Nom') }, { key: 'title', label: t('Titre') }, { key: 'title_rec', label: t('Titre (résolution)') }]" :row-click="(r) => (tpl = r)" filename="modeles.csv" /></div>
    <div v-else class="card"><LogList initial-type="alertlog" fixed-type /></div>
    <Modal v-if="tpl" :title="tpl.name" :icon="FileText" wide @close="tpl = null"><pre class="code">{{ tpl.template }}</pre></Modal>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import ApiTable from '../components/ApiTable.vue'
import Modal from '../components/Modal.vue'
import { useRoute } from 'vue-router'
import { Bell, ListChecks, History, FileText } from 'lucide-vue-next'
const tpl = ref(null)
import AlertsPanel from '../components/AlertsPanel.vue'
import RulesPanel from '../components/RulesPanel.vue'
import LogList from '../components/LogList.vue'
import { t } from '../i18n'
const route = useRoute()
const tabs = [{ id: 'active', label: t('En cours'), icon: Bell }, { id: 'rules', label: t('Règles'), icon: ListChecks }, { id: 'history', label: t('Historique'), icon: History }, { id: 'templates', label: t('Modèles'), icon: FileText }]
const tab = computed(() => route.params.tab || 'active')
</script>
