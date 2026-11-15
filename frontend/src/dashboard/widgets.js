// Catalogue des widgets disponibles dans les tableaux de bord.
// Chaque entrée : libellé, icône, description, taille par défaut (unités de grille : 12 colonnes,
// lignes de 30 px), champs de configuration et composant chargé à la demande.
import { defineAsyncComponent } from 'vue'
import {
  LayoutGrid, PieChart, Cpu, Timer, ArrowDownUp, Bell, CircleX, MapPin, ScrollText,
  Grid3x3, LineChart, Cable, Image, Map, StickyNote, Server, Thermometer, Fan, HardDrive, MemoryStick, Activity, ShieldCheck, AppWindow, HeartPulse, TriangleAlert, Plug, BatteryCharging, Printer, Wifi, Network, ServerCog, HardDriveDownload, Workflow, Rows3,
} from 'lucide-vue-next'
import { session } from '../api'
import { SENSOR_LABELS } from '../rrdmeta'
import { t } from '../i18n'

const W = (name) => defineAsyncComponent(() => import(`../components/widgets/${name}.vue`))

export const RANGE_FIELD = { key: 'range', label: t('Période'), type: 'range', default: '-1d' }
const GROUP_FIELD = { key: 'group', label: t('Groupe d\'équipements'), type: 'group', default: '', help: t('Vide : tous les équipements') }
const LIMIT = (d, max = 50) => ({ key: 'limit', label: t('Nombre d\'éléments'), type: 'number', default: d, min: 1, max })

export const STAT_ITEMS = [
  { v: 'devices', l: t('Équipements') }, { v: 'up', l: t('En ligne') }, { v: 'down', l: t('Hors ligne') },
  { v: 'ports', l: t('Ports actifs') }, { v: 'alerts', l: t('Alertes actives') }, { v: 'traffic', l: t('Trafic total') },
]

export const POWER_CLASSES = [
  { v: 'power', l: t('Puissance (W)') }, { v: 'voltage', l: t('Tension (V)') }, { v: 'current', l: t('Courant (A)') },
  { v: 'power_consumed', l: t('Énergie (kWh)') }, { v: 'power_factor', l: t('Facteur de puissance') },
  { v: 'charge', l: t('Charge batterie (%)') }, { v: 'runtime', l: t('Autonomie (min)') },
]

export const WIDGETS = {
  stats: {
    label: t('Compteurs'), icon: LayoutGrid, desc: t('Tuiles de synthèse : équipements, ports, alertes, trafic.'),
    w: 12, h: 4, minH: 3, frameless: true, component: W('WStats'),
    fields: [
      { key: 'items', label: t('Compteurs affichés'), type: 'multi', options: STAT_ITEMS, default: STAT_ITEMS.map((x) => x.v) }, GROUP_FIELD,
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'cards', options: [
        { v: 'cards', l: t('Cartes') }, { v: 'tinted', l: t('Tuiles teintées') }, { v: 'big', l: t('Grands chiffres (écran mural)') },
        { v: 'rings', l: t('Jauges') }, { v: 'compact', l: t('Bandeau compact (une ligne)') }, { v: 'list', l: t('Liste') },
      ] },
      { key: 'icons', label: t('Afficher les icônes'), type: 'bool', default: true },
    ],
  },
  'device-status': {
    label: t('État des équipements'), icon: PieChart, desc: t('Anneau en ligne / hors ligne / désactivés.'),
    w: 4, h: 9, component: W('WDeviceStatus'),
    fields: [
      GROUP_FIELD,
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'donut', options: [
        { v: 'donut', l: t('Anneau') }, { v: 'pie', l: t('Camembert') }, { v: 'half', l: t('Demi-anneau (jauge)') },
        { v: 'bar', l: t('Barre empilée') }, { v: 'tiles', l: t('Chiffres') }, { v: 'breakdown', l: t('Par catégorie') },
      ] },
      { key: 'groupBy', label: t('Répartition par (affichage « Par catégorie »)'), type: 'select', default: 'location', options: [{ v: 'location', l: t('Emplacement') }, { v: 'type', l: t('Type') }, { v: 'os', l: t('OS') }] },
      { key: 'hideEmpty', label: t('Masquer les états à zéro'), type: 'bool', default: false },
    ],
  },
  availability: {
    label: t('Carte de disponibilité'), icon: Grid3x3, desc: t('Une tuile colorée par équipement, comme dans LibreNMS.'),
    w: 6, h: 6, component: W('WAvailability'),
    fields: [
      GROUP_FIELD,
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'tiles', options: [
        { v: 'tiles', l: t('Tuiles avec nom') }, { v: 'compact', l: t('Carrés compacts') }, { v: 'hex', l: t('Hexagones') },
        { v: 'cards', l: t('Cartes détaillées (IP, latence, uptime)') }, { v: 'list', l: t('Liste') }, { v: 'summary', l: t('Synthèse (barre + hors ligne)') },
      ] },
      { key: 'groupBy', label: t('Regrouper par'), type: 'select', default: '', options: [{ v: '', l: t('Aucun') }, { v: 'location', l: t('Emplacement') }, { v: 'type', l: t('Type') }, { v: 'os', l: t('OS') }] },
      { key: 'color', label: t('Couleur des équipements en ligne'), type: 'select', default: 'status', options: [{ v: 'status', l: t('État (vert)') }, { v: 'latency', l: t('Latence (vert → rouge)') }] },
      { key: 'hideUp', label: t('Masquer les équipements en ligne'), type: 'bool', default: false },
    ],
  },
  sla: {
    label: t('Disponibilité (SLA)'), icon: ShieldCheck, desc: t('Taux de disponibilité sur 24 h / 7 j / 30 j / 1 an, objectif de SLA, coupures récentes.'),
    w: 6, h: 10, component: W('WSla'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'table', options: [{ v: 'table', l: t('Tableau par équipement') }, { v: 'outages', l: t('Dernières coupures') }] },
      { key: 'period', label: t('Période de référence'), type: 'select', default: '604800', options: [{ v: '86400', l: t('24 heures') }, { v: '604800', l: t('7 jours') }, { v: '2592000', l: t('30 jours') }, { v: '31536000', l: t('1 an') }] },
      { key: 'target', label: t('Objectif de disponibilité (%)'), type: 'number', default: 99.9, min: 0, max: 100 },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'sort', label: t('Tri'), type: 'select', default: 'worst', options: [{ v: 'worst', l: t('Moins disponibles d\'abord') }, { v: 'name', l: t('Équipement') }] },
      LIMIT(15, 200),
      { key: 'onlyBelow', label: t('Seulement les équipements sous l\'objectif'), type: 'bool', default: false },
    ],
  },
  os: {
    label: t('Systèmes d\'exploitation'), icon: Cpu, desc: t('Répartition des équipements par OS.'),
    w: 4, h: 9, component: W('WOs'), fields: [GROUP_FIELD],
  },
  latency: {
    label: t('Latence ICMP'), icon: Timer, desc: t('Équipements les plus lents à répondre au ping.'),
    w: 4, h: 9, component: W('WLatency'), fields: [LIMIT(10, 30), GROUP_FIELD],
  },
  traffic: {
    label: t('Trafic réseau'), icon: Activity, desc: t('Trafic entrant / sortant cumulé d\'un équipement, d\'un groupe ou du parc, dans le temps ou par équipement.'),
    w: 6, h: 10, component: W('WTraffic'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'chart', options: [{ v: 'chart', l: t('Courbe entrant / sortant cumulée') }, { v: 'devices', l: t('Débit actuel par équipement') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'filter', label: t('Filtrer les ports (nom ou description)'), type: 'text', default: '', help: t('Ex. « wan », « uplink », « eth0 ». Plusieurs termes séparés par des virgules.') },
      RANGE_FIELD,
      LIMIT(10, 40),
    ],
  },
  'port-errors': {
    label: t('Ports en erreur'), icon: TriangleAlert, desc: t('Ports qui produisent des erreurs (taux, % des paquets, cumul) et ports activés mais déconnectés.'),
    w: 6, h: 9, component: W('WPortErrors'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'current', options: [{ v: 'current', l: t('Erreurs au dernier relevé') }, { v: 'total', l: t('Compteurs cumulés') }, { v: 'history', l: t('Historique des erreurs (courbes)') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'filter', label: t('Filtrer les ports (nom ou description)'), type: 'text', default: '' },
      { key: 'down', label: t('Inclure les ports activés mais déconnectés (admin up / oper down)'), type: 'bool', default: false },
      { key: 'crit', label: t('Taux d\'erreur critique (% des paquets)'), type: 'number', default: 1, min: 0, max: 100 },
      LIMIT(10, 100),
      RANGE_FIELD,
    ],
  },
  'top-ports': {
    label: t('Ports les plus chargés'), icon: ArrowDownUp, desc: t('Classement des ports par débit ou par taux d\'utilisation.'),
    w: 6, h: 10, component: W('WTopPorts'),
    fields: [
      LIMIT(8, 30),
      { key: 'sort', label: t('Trier par'), type: 'select', default: 'rate', options: [{ v: 'rate', l: t('Débit') }, { v: 'util', l: t('Utilisation (%)') }] },
      GROUP_FIELD,
    ],
  },
  services: {
    label: t('Services'), icon: HeartPulse, desc: t('Vérifications de services LibreNMS (HTTP, DNS, SSH, ping…) : état, message, depuis quand.'),
    w: 6, h: 9, component: W('WServices'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'list', options: [{ v: 'list', l: t('Liste (problèmes en premier)') }, { v: 'tiles', l: t('Tuiles colorées') }, { v: 'summary', l: t('Synthèse (anneau)') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'type', label: t('Type de service'), type: 'text', default: '', help: t('Ex. « http », « dns », « ssh ». Vide : tous.') },
      { key: 'onlyProblems', label: t('Seulement les services en avertissement ou critiques'), type: 'bool', default: false },
      { key: 'showIgnored', label: t('Inclure les services ignorés ou désactivés'), type: 'bool', default: false },
      LIMIT(15, 200),
    ],
  },
  alerts: {
    label: t('Alertes en cours'), icon: Bell, desc: t('Alertes actives avec leur sévérité.'),
    w: 6, h: 10, component: W('WAlerts'),
    fields: [
      LIMIT(10),
      { key: 'severity', label: t('Sévérité'), type: 'select', default: '', options: [{ v: '', l: t('Toutes') }, { v: 'critical', l: t('Critiques') }, { v: 'warning', l: t('Avertissements') }] },
      GROUP_FIELD,
    ],
  },
  down: {
    label: t('Équipements hors ligne'), icon: CircleX, desc: t('Liste des équipements qui ne répondent plus.'),
    w: 6, h: 8, component: W('WDown'), fields: [LIMIT(10), GROUP_FIELD],
  },
  locations: {
    label: t('Équipements par emplacement'), icon: MapPin, desc: t('Nombre d\'équipements par site.'),
    w: 6, h: 9, component: W('WLocations'), fields: [LIMIT(12, 40), GROUP_FIELD],
  },
  logs: {
    label: t('Journaux'), icon: ScrollText, desc: t('Derniers évènements, syslog ou historique des alertes.'),
    w: 12, h: 9, component: W('WLogs'),
    fields: [
      { key: 'type', label: t('Journal'), type: 'select', default: 'eventlog', options: [{ v: 'eventlog', l: t('Évènements') }, { v: 'syslog', l: t('Syslog') }, { v: 'alertlog', l: t('Historique des alertes') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      LIMIT(15, 200),
    ],
  },
  device: {
    label: t('Fiche équipement'), icon: Server, desc: t('État, uptime, latence et charge d\'un équipement.'),
    w: 4, h: 7, component: W('WDevice'), fields: [{ key: 'device', label: t('Équipement'), type: 'device', required: true }],
  },
  sensors: {
    label: t('Températures'), icon: Thermometer, desc: t('Capteurs de température (ou autre type) avec seuils d\'alerte : tuiles, barres ou historique.'),
    w: 6, h: 9, component: W('WSensors'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'tiles', options: [{ v: 'tiles', l: t('Tuiles avec jauge') }, { v: 'bars', l: t('Barres') }, { v: 'history', l: t('Historique (courbes)') }] },
      { key: 'cls', label: t('Type de capteur'), type: 'select', default: 'temperature', options: Object.entries(SENSOR_LABELS).map(([v, l]) => ({ v, l })) },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'filter', label: t('Filtrer par description'), type: 'text', default: '', help: t('Ex. « CPU », « Package », « inlet »') },
      { key: 'sort', label: t('Tri'), type: 'select', default: 'desc', options: [{ v: 'desc', l: t('Valeur décroissante') }, { v: 'asc', l: t('Valeur croissante') }, { v: 'name', l: t('Équipement puis capteur') }] },
      LIMIT(12, 100),
      { key: 'onlyAlarm', label: t('Seulement les capteurs proches ou au-delà d\'un seuil'), type: 'bool', default: false },
      RANGE_FIELD,
    ],
  },
  power: {
    label: t('Alimentation'), icon: Plug, desc: t('État des blocs d\'alimentation, budget PoE, puissance, tension, courant, onduleurs.'),
    w: 6, h: 8, component: W('WPower'),
    fields: [
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'classes', label: t('Mesures affichées'), type: 'multi', options: POWER_CLASSES, default: POWER_CLASSES.map((x) => x.v) },
      { key: 'onlyAlarm', label: t('Seulement les éléments en défaut ou proches d\'un seuil'), type: 'bool', default: false },
      LIMIT(24, 200),
      { key: 'okValue', label: t('Valeur d\'état normale (avancé)'), type: 'text', default: '', help: t('À renseigner seulement si un état s\'affiche « État n » : valeur(s) brute(s) signifiant « normal ».') },
    ],
  },
  nas: {
    label: 'NAS', icon: HardDriveDownload, desc: t('NAS (Synology, QNAP…) : volumes, état RAID, santé et température de chaque disque, système.'),
    w: 6, h: 12, component: W('WNas'),
    fields: [
      { key: 'device', label: 'NAS', type: 'device', default: '', help: t('Vide : tous les NAS (équipements de type « stockage »)') },
      GROUP_FIELD,
      { key: 'warn', label: t('Volume : seuil d\'avertissement (%)'), type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: t('Volume : seuil critique (%)'), type: 'number', default: 90, min: 1, max: 100 },
      { key: 'disks', label: t('Afficher le détail des disques'), type: 'bool', default: true },
    ],
  },
  servers: {
    label: t('Serveurs'), icon: ServerCog, desc: t('Une carte (ou une ligne) par serveur : CPU, RAM, swap, disques, trafic, température, alertes.'),
    w: 12, h: 10, component: W('WServers'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'cards', options: [{ v: 'cards', l: t('Cartes') }, { v: 'table', l: t('Tableau compact') }] },
      { key: 'device', label: t('Serveur'), type: 'device', default: '', help: t('Vide : tous les serveurs') },
      GROUP_FIELD,
      { key: 'sort', label: t('Tri'), type: 'select', default: 'worst', options: [{ v: 'worst', l: t('Les plus chargés d\'abord') }, { v: 'name', l: t('Nom') }] },
      { key: 'disks', label: t('Disques affichés par serveur'), type: 'number', default: 3, min: 0, max: 10 },
      { key: 'warn', label: t('Seuil d\'avertissement (%)'), type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: t('Seuil critique (%)'), type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: t('Seulement les serveurs au-delà d\'un seuil, hors ligne ou en alerte'), type: 'bool', default: false },
      { key: 'allTypes', label: t('Inclure tous les équipements ayant CPU / RAM (pas seulement le type « serveur »)'), type: 'bool', default: false },
    ],
  },
  switches: {
    label: t('Switchs'), icon: Network, desc: t('Façade de chaque switch (ports colorés selon état et vitesse), trafic, CPU, RAM, température, PoE.'),
    w: 6, h: 9, component: W('WSwitches'),
    fields: [
      { key: 'device', label: t('Switch'), type: 'device', default: '', help: t('Vide : tous les switchs') },
      GROUP_FIELD,
      { key: 'color', label: t('Couleur des ports'), type: 'select', default: 'speed', options: [{ v: 'speed', l: t('Vitesse négociée') }, { v: 'util', l: t('Charge (utilisation)') }] },
      { key: 'kpis', label: t('Afficher les indicateurs (trafic, CPU, RAM, température, PoE)'), type: 'bool', default: true },
    ],
  },
  wifi: {
    label: t('Points d\'accès Wi-Fi'), icon: Wifi, desc: t('Clients par SSID et par radio, canal, occupation du canal, bruit, puissance d\'émission.'),
    w: 6, h: 10, component: W('WWifi'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'cards', options: [{ v: 'cards', l: t('Cartes par point d\'accès') }, { v: 'history', l: t('Historique des clients') }] },
      { key: 'device', label: t('Point d\'accès / contrôleur'), type: 'device', default: '', help: t('Vide : tous') },
      GROUP_FIELD,
      { key: 'util', label: t('Occupation de canal élevée (%)'), type: 'number', default: 60, min: 1, max: 100 },
      { key: 'by', label: t('Courbes de l\'historique'), type: 'select', default: 'ssid', options: [{ v: 'ssid', l: t('Par SSID') }, { v: 'radio', l: t('Par radio') }] },
      RANGE_FIELD,
    ],
  },
  printers: {
    label: t('Imprimantes'), icon: Printer, desc: t('État des imprimantes, niveaux de toner / tambour / bacs papier, compteurs de pages.'),
    w: 6, h: 8, component: W('WPrinters'),
    fields: [
      { key: 'device', label: t('Imprimante'), type: 'device', default: '', help: t('Vide : toutes les imprimantes') },
      GROUP_FIELD,
      { key: 'low', label: t('Niveau bas des consommables (%)'), type: 'number', default: 15, min: 0, max: 100 },
      { key: 'paper', label: t('Afficher les bacs papier'), type: 'bool', default: true },
      { key: 'onlyAlarm', label: t('Seulement les imprimantes en défaut ou avec un consommable bas'), type: 'bool', default: false },
    ],
  },
  ups: {
    label: t('Onduleurs'), icon: BatteryCharging, desc: t('Une carte par onduleur : batterie, autonomie, charge, tensions, état secteur / batterie.'),
    w: 6, h: 9, component: W('WUps'),
    fields: [
      { key: 'device', label: t('Onduleur'), type: 'device', default: '', help: t('Vide : tous les onduleurs détectés') },
      GROUP_FIELD,
      { key: 'lowBattery', label: t('Charge batterie critique (%)'), type: 'number', default: 30, min: 0, max: 100 },
      { key: 'lowRuntime', label: t('Autonomie critique (minutes)'), type: 'number', default: 10, min: 0, max: 600 },
      { key: 'okValue', label: t('Valeur d\'état normale (avancé)'), type: 'text', default: '', help: t('À renseigner seulement si un état s\'affiche « État n ».') },
    ],
  },
  fans: {
    label: t('Ventilateurs'), icon: Fan, desc: t('État des ventilateurs (normal / en panne) et vitesses en tr/min si l\'équipement les remonte.'),
    w: 6, h: 5, component: W('WFans'),
    fields: [
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'onlyAlarm', label: t('Seulement les ventilateurs en défaut'), type: 'bool', default: false },
      { key: 'mode', label: t('Affichage des vitesses (tr/min)'), type: 'select', default: 'tiles', options: [{ v: 'tiles', l: t('Tuiles avec jauge') }, { v: 'bars', l: t('Barres') }, { v: 'history', l: t('Historique (courbes)') }] },
      RANGE_FIELD,
      { key: 'okValue', label: t('Valeur d\'état normale (avancé)'), type: 'text', default: '', help: t('À renseigner seulement si un état s\'affiche « État n » : valeur(s) brute(s) signifiant « normal », ex. « 1 » ou « 1, 3 ».') },
    ],
  },
  storage: {
    label: t('Stockage des disques'), icon: HardDrive, desc: t('Occupation des disques et volumes : espace utilisé, libre, seuils.'),
    w: 6, h: 10, component: W('WStorage'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'list', options: [{ v: 'list', l: t('Liste avec barres') }, { v: 'rings', l: t('Jauges circulaires') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'filter', label: t('Filtrer par volume'), type: 'text', default: '', help: t('Ex. « C: », « /volume », « /home »') },
      { key: 'sort', label: t('Tri'), type: 'select', default: 'perc', options: [{ v: 'perc', l: t('Taux d\'occupation') }, { v: 'free', l: t('Espace libre (le moins d\'abord)') }, { v: 'size', l: t('Taille') }, { v: 'name', l: t('Équipement puis volume') }] },
      LIMIT(15, 200),
      { key: 'warn', label: t('Seuil d\'avertissement (%)'), type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: t('Seuil critique (%)'), type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: t('Seulement les volumes au-delà du seuil d\'avertissement'), type: 'bool', default: false },
      { key: 'showSystem', label: t('Afficher aussi les volumes système (/run, /tmp, /boot, < 1 Go…)'), type: 'bool', default: false },
    ],
  },
  cpu: {
    label: t('Processeurs (CPU)'), icon: Cpu, desc: t('Charge CPU par équipement : moyenne, cœur le plus chargé, carte des cœurs, historique.'),
    w: 6, h: 10, component: W('WCpu'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'list', options: [{ v: 'list', l: t('Liste avec barres et cœurs') }, { v: 'rings', l: t('Jauges circulaires') }, { v: 'history', l: t('Historique (courbes)') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'sort', label: t('Tri'), type: 'select', default: 'avg', options: [{ v: 'avg', l: t('Charge moyenne') }, { v: 'max', l: t('Cœur le plus chargé') }, { v: 'cores', l: t('Nombre de cœurs') }, { v: 'name', l: t('Équipement') }] },
      LIMIT(15, 200),
      { key: 'warn', label: t('Seuil d\'avertissement (%)'), type: 'number', default: 75, min: 1, max: 100 },
      { key: 'crit', label: t('Seuil critique (%)'), type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: t('Seulement les équipements au-delà du seuil d\'avertissement'), type: 'bool', default: false },
      RANGE_FIELD,
    ],
  },
  memory: {
    label: t('Mémoire RAM'), icon: MemoryStick, desc: t('Occupation de la mémoire vive par équipement, avec cache et swap.'),
    w: 6, h: 10, component: W('WMemory'),
    fields: [
      { key: 'mode', label: t('Affichage'), type: 'select', default: 'list', options: [{ v: 'list', l: t('Liste avec barres') }, { v: 'rings', l: t('Jauges circulaires') }] },
      { key: 'device', label: t('Équipement'), type: 'device', default: '', help: t('Vide : tous les équipements') },
      GROUP_FIELD,
      { key: 'sort', label: t('Tri'), type: 'select', default: 'perc', options: [{ v: 'perc', l: t('Taux d\'occupation') }, { v: 'total', l: t('Quantité de RAM') }, { v: 'name', l: t('Équipement') }] },
      LIMIT(15, 200),
      { key: 'warn', label: t('Seuil d\'avertissement (%)'), type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: t('Seuil critique (%)'), type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: t('Seulement les équipements au-delà du seuil d\'avertissement'), type: 'bool', default: false },
      { key: 'swap', label: t('Afficher l\'utilisation du swap'), type: 'bool', default: true },
    ],
  },
  rrd: {
    label: t('Graphique interactif'), icon: LineChart, desc: t('N\'importe quelle métrique RRD d\'un équipement (CPU, mémoire, capteurs…).'),
    w: 6, h: 9, component: W('WRrd'), needs: 'rrd',
    fields: [
      { key: 'device', label: t('Équipement'), type: 'device', required: true },
      { key: 'file', label: t('Métrique'), type: 'rrd', required: true, depends: 'device' },
      RANGE_FIELD,
      { key: 'stats', label: t('Afficher actuel / moyenne / max'), type: 'bool', default: true },
      { key: 'scale', label: t('Afficher l\'échelle (axes)'), type: 'bool', default: true },
    ],
  },
  port: {
    label: t('Trafic d\'un port'), icon: Cable, desc: t('Débit entrant / sortant d\'une interface.'),
    w: 6, h: 9, component: W('WPort'),
    fields: [
      { key: 'device', label: t('Équipement'), type: 'device', required: true },
      { key: 'port', label: t('Port'), type: 'port', required: true, depends: 'device' },
      RANGE_FIELD,
      { key: 'stats', label: t('Afficher actuel / moyenne / max'), type: 'bool', default: true },
      { key: 'scale', label: t('Afficher l\'échelle (axes)'), type: 'bool', default: true },
    ],
  },
  graph: {
    label: t('Graphique LibreNMS'), icon: Image, desc: t('Graphique image généré par LibreNMS pour un équipement.'),
    w: 6, h: 9, component: W('WGraph'),
    fields: [
      { key: 'device', label: t('Équipement'), type: 'device', required: true },
      { key: 'graph', label: t('Graphique'), type: 'graph', required: true, depends: 'device' },
      RANGE_FIELD,
    ],
  },
  diagram: {
    label: t('Schéma'), icon: Workflow, desc: t('Affiche un de vos schémas réseau, avec l\'état et le trafic en direct.'),
    w: 6, h: 12, component: W('WDiagram'),
    fields: [
      { key: 'diagram', label: t('Schéma'), type: 'diagram', required: true },
      { key: 'rates', label: t('Afficher les débits sur les liens'), type: 'bool', default: true },
    ],
  },
  rack: {
    label: t('Baie'), icon: Rows3, desc: t('Une baie (ou toute une salle) avec ses équipements, l\'état des ports et les câbles en direct.'),
    w: 4, h: 18, component: W('WRack'),
    fields: [
      { key: 'rack', label: t('Baie'), type: 'rack', required: true },
      { key: 'cables', label: t('Câbles'), type: 'select', default: 'real', options: [{ v: 'real', l: t('Couleur réelle') }, { v: 'state', l: t('État / charge') }, { v: 'hidden', l: t('Masqués') }] },
    ],
  },
  map: {
    label: t('Carte géographique'), icon: Map, desc: t('Sites localisés, colorés selon l\'état des équipements.'),
    w: 6, h: 11, component: W('WMap'), fields: [GROUP_FIELD, { key: 'onlyDown', label: t('Sites en défaut uniquement'), type: 'bool', default: false }],
  },
  iframe: {
    label: t('Page web (iframe)'), icon: AppWindow, desc: t('Intègre une page web : Grafana, caméra, Home Assistant, page LibreNMS, wiki…'),
    w: 6, h: 10, component: W('WIframe'),
    fields: [
      { key: 'url', label: t('Adresse (http:// ou https://)'), type: 'text', required: true, default: '', help: t('Certains sites interdisent l\'intégration (X-Frame-Options / CSP) : la zone reste alors vide ou affiche une erreur du navigateur.') },
      { key: 'refresh', label: t('Recharger la page'), type: 'select', default: 0, options: [{ v: 0, l: t('Jamais') }, { v: 30, l: t('Toutes les 30 s') }, { v: 60, l: t('Toutes les minutes') }, { v: 300, l: t('Toutes les 5 min') }, { v: 900, l: t('Toutes les 15 min') }, { v: 3600, l: t('Toutes les heures') }] },
      { key: 'zoom', label: t('Zoom'), type: 'select', default: 100, options: [50, 67, 75, 80, 90, 100, 110, 125, 150].map((v) => ({ v, l: `${v} %` })) },
      { key: 'scripts', label: t('Autoriser JavaScript dans la page'), type: 'bool', default: true },
      { key: 'interact', label: t('Autoriser les clics et le défilement'), type: 'bool', default: true },
    ],
  },
  notes: {
    label: t('Notes'), icon: StickyNote, desc: t('Texte libre : consignes, contacts, liens utiles.'),
    w: 4, h: 6, component: W('WNotes'),
    fields: [{ key: 'text', label: t('Texte'), type: 'textarea', default: '', help: t('**gras**, liens http(s) cliquables, une ligne commençant par « - » devient une puce.') }],
  },
}

export function available(type) {
  const w = WIDGETS[type]
  return w && (w.needs !== 'rrd' || session.rrd)
}

export function defaultConfig(type) {
  const cfg = {}
  for (const f of WIDGETS[type]?.fields || []) if (f.default !== undefined) cfg[f.key] = Array.isArray(f.default) ? [...f.default] : f.default
  return cfg
}

export function missingConfig(type, cfg) {
  return (WIDGETS[type]?.fields || []).some((f) => f.required && !cfg?.[f.key])
}

let n = 0
export const newId = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** Tableau proposé à la première visite : reprend l'ancienne page d'accueil. */
export function starterWidgets() {
  const L = [
    ['stats', 0, 0, 12, 4], ['device-status', 0, 4, 4, 9], ['os', 4, 4, 4, 9], ['latency', 8, 4, 4, 9],
    ['top-ports', 0, 13, 6, 10], ['alerts', 6, 13, 6, 10], ['down', 0, 23, 6, 9], ['locations', 6, 23, 6, 9],
    ['logs', 0, 32, 12, 9],
  ]
  return L.map(([type, x, y, w, h]) => ({ i: newId(), type, x, y, w, h, config: defaultConfig(type) }))
}
