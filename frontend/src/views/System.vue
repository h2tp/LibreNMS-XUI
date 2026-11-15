<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Système') }}</h1><div class="sub">{{ t('Informations LibreNMS, pollers et intégration') }}</div></div></div>
    <div class="grid g2">
      <div class="card">
        <div class="card-title"><Info :size="17" /> {{ t('LibreNMS') }}</div>
        <div v-if="!sys" class="skeleton" style="height:200px"></div>
        <dl v-else class="kv small"><template v-for="(v, k) in sys" :key="k"><dt>{{ labels[k] || k }}</dt><dd class="mono">{{ v }}</dd></template></dl>
      </div>
      <div class="card">
        <div class="card-title"><Plug :size="17" /> {{ t('Interface XUI') }}</div>
        <dl class="kv small">
          <dt>{{ t('Utilisateur') }}</dt><dd>{{ session.user }}</dd>
          <dt>{{ t('Mode d\'authentification') }}</dt><dd>{{ { password: t('compte local + jeton serveur'), token: t('jeton LibreNMS personnel'), none: t('désactivée') }[session.auth_mode] }}</dd>
          <dt>{{ t('Modifications') }}</dt><dd><span class="badge" :class="session.read_only ? 'warning' : 'ok'">{{ session.read_only ? t('lecture seule') : t('autorisées') }}</span></dd>
          <dt>{{ t('Graphiques RRD') }}</dt><dd><span class="badge" :class="session.rrd ? 'ok' : 'warning'">{{ session.rrd ? t('disponibles (interactifs)') : t('non montés — images LibreNMS') }}</span></dd>
          <dt>{{ t('LibreNMS') }}</dt><dd><a :href="session.librenms_url" target="_blank">{{ session.librenms_url }}</a></dd>
          <dt>{{ t('Équipements') }}</dt><dd>{{ devCount }}</dd>
        </dl>
      </div>
      <div class="card span2">
        <div class="card-title"><Cpu :size="17" /> {{ t('Pollers') }}</div>
        <ApiTable path="pollers" list-key="pollers" :auto="true" :empty-text="t('Aucun poller enregistré')" />
      </div>
      <div class="card span2">
        <div class="card-title"><Server :size="17" /> {{ t('Groupes de pollers') }}</div>
        <ApiTable path="poller_group" :columns="[{ key: 'id', label: 'ID' }, { key: 'group_name', label: t('Nom') }, { key: 'descr', label: t('Description') }]" :auto="false" :empty-text="t('Aucun groupe (poller par défaut uniquement)')" />
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { Info, Plug, Server, Cpu } from 'lucide-vue-next'
import ApiTable from '../components/ApiTable.vue'
import { session, api, pick, devicesCached } from '../api'
import { t } from '../i18n'
const sys = ref(null)
const devCount = ref('…')
const labels = { local_ver: 'Version', local_sha: 'Commit', local_date: t('Date du commit'), local_branch: t('Branche'), db_schema: t('Schéma BDD'), php_ver: 'PHP', python_ver: 'Python', database_ver: t('Base de données'), rrdtool_ver: 'RRDtool', netsnmp_ver: 'Net-SNMP' }
onMounted(async () => {
  try { sys.value = pick(await api.get('system'), 'system')[0] || {} } catch (e) { sys.value = { erreur: e.message } }
  devCount.value = (await devicesCached().catch(() => [])).length
})
</script>
