<template>
  <div class="ri" :class="[item.kind, status, { img: showImage }]">
    <!-- image choisie par l'utilisateur (photo de façade…) -->
    <template v-if="showImage">
      <img :src="diagApi.imgUrl(item.image)" alt="" draggable="false" />
      <span class="img-name"><i v-if="item.kind === 'device'" class="dot" :class="status"></i>{{ name }}</span>
    </template>

    <template v-else>
      <div class="ears"><i></i><i></i></div>
      <div class="label" :style="{ width: `${LABEL_W}px` }">
        <span class="name"><i v-if="item.kind === 'device'" class="dot" :class="status"></i>{{ name }}</span>
        <span v-if="sub && hpx >= 30" class="sub">{{ sub }}</span>
      </div>

      <!-- prises : ports réels (équipement) ou numérotés (panneau, PDU, élément libre) -->
      <div v-if="grid.rows" class="sockets" :style="{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.pw}px)`, gridTemplateRows: `repeat(${grid.rows}, ${grid.ph}px)`, gap: `${grid.gap}px` }">
        <template v-if="item.kind === 'device'">
          <component :is="editing ? 'span' : 'router-link'" v-for="(p, i) in devPorts" :key="p.port_id" :to="editing ? undefined : `/port/${p.port_id}`"
            class="sock" :class="p.cls" :style="{ gridRow: grid.pos(i).row, gridColumn: grid.pos(i).col, '--fill': p.color }" :title="p.tip" draggable="false">
            <span v-if="grid.pw >= 14 && grid.ph >= 11" class="num">{{ p.label }}</span>
          </component>
        </template>
        <template v-else>
          <span v-for="i in item.ports" :key="i" class="sock passive" :class="item.kind" :style="{ gridRow: grid.pos(i - 1).row, gridColumn: grid.pos(i - 1).col }" :title="`${name} · ${i}`">
            <span v-if="grid.pw >= 14 && grid.ph >= 11" class="num">{{ i }}</span>
          </span>
        </template>
      </div>
      <div v-else-if="item.kind === 'cablemgmt'" class="brush"></div>
      <div v-else-if="item.kind === 'shelf'" class="tray"></div>
      <div v-else class="grow"></div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { diagApi } from '../api'
import { devName, devStatus, fmtBits, fmtSpeed, portUtil } from '../utils'
import { faceGrid, shortName, speedColor, UH, FACE_W, KIND_LABEL } from '../rack/core'
import { t } from '../i18n'

const LABEL_W = 118
const props = defineProps({ item: Object, dev: Object, ports: { type: Array, default: () => [] }, editing: Boolean })
const n = (v) => +v || 0
const hpx = computed(() => props.item.h * UH)
const showImage = computed(() => props.item.display === 'image' && !!props.item.image)
const status = computed(() => (props.item.kind !== 'device' ? 'none' : props.dev ? devStatus(props.dev) : 'unknown'))
const name = computed(() => props.item.label || (props.dev ? devName(props.dev) : props.item.kind === 'device' ? `#${props.item.device_id}` : KIND_LABEL[props.item.kind]))
const sub = computed(() => (props.item.kind === 'device' ? (props.dev ? props.dev.hardware || props.dev.os || '' : t('équipement inconnu')) : ''))

const count = computed(() => (props.item.kind === 'device' ? props.ports.length : props.item.ports))
const grid = computed(() => faceGrid(count.value, FACE_W - LABEL_W - 34, hpx.value - 10))

const devPorts = computed(() => props.ports.map((p) => {
  const admin = p.ifAdminStatus === 'down'
  const up = !admin && p.ifOperStatus === 'up'
  const errs = n(p.ifInErrors_delta) + n(p.ifOutErrors_delta) > 0
  return {
    ...p, label: shortName(p), color: up ? speedColor(n(p.ifSpeed)) : '',
    cls: [admin ? 'admin' : up ? 'up' : 'off', errs ? 'err' : ''],
    tip: [`${p.ifName}${p.ifAlias && p.ifAlias !== p.ifName ? ' — ' + p.ifAlias : ''}`,
      admin ? t('Désactivé') : up ? t('Connecté à {s}', { s: fmtSpeed(n(p.ifSpeed)) }) : t('Déconnecté'),
      up ? `↓ ${fmtBits(n(p.ifInOctets_rate) * 8)} · ↑ ${fmtBits(n(p.ifOutOctets_rate) * 8)} · ${Math.round(portUtil(p))} %` : ''].filter(Boolean).join('\n'),
  }
}))
</script>

<style scoped>
.ri { position: relative; height: 100%; display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 0; border-radius: 3px; overflow: hidden;
  background: linear-gradient(180deg, #2b3445, #1c2331); border: 1px solid #3b4658; color: #e2e8f0; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .06); }
.ri.down { border-color: #f43f5e; box-shadow: inset 0 0 0 1px #f43f5e; }
.ri.blank { background: repeating-linear-gradient(180deg, #273142 0 3px, #222b3a 3px 6px); }
.ri.patch { background: linear-gradient(180deg, #20262f, #161b22); }
.ri.pdu { background: linear-gradient(180deg, #2a2f3a, #1b1f27); }
.ri.shelf, .ri.cablemgmt { background: linear-gradient(180deg, #252d3b, #1a202b); }
.ears { align-self: stretch; width: 14px; flex: none; display: flex; flex-direction: column; justify-content: space-around; align-items: center;
  background: linear-gradient(90deg, #3a4558, #2c3546); border-right: 1px solid #45526a; }
.ears i { width: 5px; height: 5px; border-radius: 50%; background: #10151d; box-shadow: inset 0 0 0 1px #5b6880; }
.label { flex: none; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.name { font-size: 11.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
.sub { font-size: 9.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #64748b; }
.dot.up { background: #22c55e; } .dot.down { background: #f43f5e; }
.sockets { display: grid; margin-left: auto; }
.sock { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 2px; font-size: 8.5px; font-weight: 700; color: #64748b;
  background: #0b1018; border: 1px solid #334155; text-decoration: none; overflow: hidden; }
a.sock:hover { border-color: #e2e8f0; text-decoration: none; }
.sock.up { border-color: var(--fill); color: #fff; background: color-mix(in srgb, var(--fill) 35%, #0b1018); }
.sock.admin { background: repeating-linear-gradient(135deg, #1e293b 0 3px, #0b1018 3px 6px); }
.sock.err { box-shadow: 0 0 0 1.5px #f43f5e; }
.sock.passive { background: #05080d; border-color: #2a3442; color: #7c8aa0; }
.sock.pdu { border-radius: 40%; background: #111; }
.num { position: relative; z-index: 1; line-height: 1; }
.brush { flex: 1; align-self: stretch; margin: 2px 0; border-radius: 3px; background: repeating-linear-gradient(90deg, #0f141c 0 2px, #1e2633 2px 5px); }
.tray { flex: 1; align-self: flex-end; height: 5px; border-radius: 2px; background: #475569; }
.ri.img { padding: 0; background: #111827; }
.ri.img img { width: 100%; height: 100%; object-fit: fill; display: block; }
.img-name { position: absolute; left: 6px; bottom: 3px; max-width: 70%; font-size: 10.5px; font-weight: 700; color: #fff; display: flex; gap: 5px; align-items: center;
  padding: 1px 6px; border-radius: 4px; background: rgba(0, 0, 0, .55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
