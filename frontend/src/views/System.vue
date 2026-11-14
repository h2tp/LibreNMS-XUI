<template>
  <div>
    <div class="page-head"><div><h1>Système</h1><div class="sub">Informations LibreNMS, pollers et intégration</div></div></div>
    <div class="grid g2">
      <div class="card">
        <div class="card-title"><Info :size="17" /> LibreNMS</div>
        <div v-if="!sys" class="skeleton" style="height:200px"></div>
        <dl v-else class="kv small"><template v-for="(v, k) in sys" :key="k"><dt>{{ labels[k] || k }}</dt><dd class="mono">{{ v }}</dd></template></dl>
      </div>
      <div class="card">
        <div class="card-title"><Plug :size="17" /> Interface XUI</div>
        <dl class="kv small">
          <dt>Utilisateur</dt><dd>{{ session.user }}</dd>
          <dt>Mode d'authentification</dt><dd>{{ { password: 'compte local + jeton serveur', token: 'jeton LibreNMS personnel', none: 'désactivée' }[session.auth_mode] }}</dd>
          <dt>Modifications</dt><dd><span class="badge" :class="session.read_only ? 'warning' : 'ok'">{{ session.read_only ? 'lecture seule' : 'autorisées' }}</span></dd>
          <dt>Graphiques RRD</dt><dd><span class="badge" :class="session.rrd ? 'ok' : 'warning'">{{ session.rrd ? 'disponibles (interactifs)' : 'non montés — images LibreNMS' }}</span></dd>
          <dt>LibreNMS</dt><dd><a :href="session.librenms_url" target="_blank">{{ session.librenms_url }}</a></dd>
          <dt>Équipements</dt><dd>{{ devCount }}</dd>
        </dl>
      </div>
      <div class="card span2">
        <div class="card-title"><Cpu :size="17" /> Pollers</div>
        <ApiTable path="pollers" list-key="pollers" :auto="true" empty-text="Aucun poller enregistré" />
      </div>
      <div class="card span2">
        <div class="card-title"><Server :size="17" /> Groupes de pollers</div>
        <ApiTable path="poller_group" :columns="[{ key: 'id', label: 'ID' }, { key: 'group_name', label: 'Nom' }, { key: 'descr', label: 'Description' }]" :auto="false" empty-text="Aucun groupe (poller par défaut uniquement)" />
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { Info, Plug, Server, Cpu } from 'lucide-vue-next'
import ApiTable from '../components/ApiTable.vue'
import { session, api, pick, devicesCached } from '../api'
const sys = ref(null)
const devCount = ref('…')
const labels = { local_ver: 'Version', local_sha: 'Commit', local_date: 'Date du commit', local_branch: 'Branche', db_schema: 'Schéma BDD', php_ver: 'PHP', python_ver: 'Python', database_ver: 'Base de données', rrdtool_ver: 'RRDtool', netsnmp_ver: 'Net-SNMP' }
onMounted(async () => {
  try { sys.value = pick(await api.get('system'), 'system')[0] || {} } catch (e) { sys.value = { erreur: e.message } }
  devCount.value = (await devicesCached().catch(() => [])).length
})
</script>
