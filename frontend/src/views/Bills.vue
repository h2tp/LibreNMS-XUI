<template>
  <div>
    <div class="page-head"><div><h1>Facturation</h1><div class="sub">Suivi des quotas et du 95e percentile</div></div></div>
    <div v-if="loading && !bills.length" class="grid gauto"><div v-for="i in 4" :key="i" class="skeleton" style="height:180px"></div></div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <div v-else-if="!bills.length" class="card empty"><Receipt /><div>Aucune facturation configurée</div></div>
    <div class="grid gauto stagger">
      <div v-for="b in bills" :key="b.bill_id" class="card hover" @click="sel = b">
        <div class="row"><Receipt :size="18" color="var(--accent)" /><b class="grow ellipsis">{{ b.bill_name }}</b><span class="badge">{{ b.bill_type === 'cdr' ? '95e percentile' : 'Quota' }}</span></div>
        <div class="row mt" style="gap:18px">
          <Ring :value="usage(b)" :size="90" :stroke="9" />
          <dl class="kv small grow">
            <template v-if="b.bill_type === 'cdr'"><dt>95e</dt><dd>{{ fmtBits(b.rate_95th) }}</dd><dt>Engagé</dt><dd>{{ fmtBits(b.bill_cdr) }}</dd></template>
            <template v-else><dt>Consommé</dt><dd>{{ fmtBytes(b.total_data) }}</dd><dt>Quota</dt><dd>{{ fmtBytes(b.bill_quota) }}</dd></template>
            <dt>Moyenne</dt><dd>{{ fmtBits(b.rate_average) }}</dd>
            <dt>Période</dt><dd>j{{ b.bill_day }}</dd>
          </dl>
        </div>
      </div>
    </div>
    <Modal v-if="sel" :title="sel.bill_name" :icon="Receipt" wide @close="sel = null">
      <div class="row mb"><RangePicker v-model="range" /></div>
      <ApiGraph :path="`bills/${sel.bill_id}/graphs/bits`" :range="range" />
      <div class="card-title mt">Historique</div>
      <ApiTable :path="`bills/${sel.bill_id}/history`" list-key="bill_history" :page-size="12" :filename="`facture-${sel.bill_id}.csv`" />
    </Modal>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Receipt } from 'lucide-vue-next'
import Ring from '../components/Ring.vue'
import Modal from '../components/Modal.vue'
import ApiGraph from '../components/ApiGraph.vue'
import ApiTable from '../components/ApiTable.vue'
import RangePicker from '../components/RangePicker.vue'
import { api, pick } from '../api'
import { useLoader } from '../refresh'
import { fmtBits, fmtBytes } from '../utils'
const bills = ref([])
const sel = ref(null)
const range = ref('-30d')
const usage = (b) => (b.bill_type === 'cdr' ? (+b.bill_cdr ? (b.rate_95th / b.bill_cdr) * 100 : 0) : (+b.bill_quota ? (b.total_data / b.bill_quota) * 100 : 0))
const { loading, error } = useLoader(async () => { bills.value = pick(await api.get('bills'), 'bills') })
</script>
