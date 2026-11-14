// Catalogue des widgets disponibles dans les tableaux de bord.
// Chaque entrée : libellé, icône, description, taille par défaut (unités de grille : 12 colonnes,
// lignes de 30 px), champs de configuration et composant chargé à la demande.
import { defineAsyncComponent } from 'vue'
import {
  LayoutGrid, PieChart, Cpu, Timer, ArrowDownUp, Bell, CircleX, MapPin, ScrollText,
  Grid3x3, LineChart, Cable, Image, Map, StickyNote, Server, Thermometer, Fan, HardDrive, MemoryStick, Activity, ShieldCheck, AppWindow, HeartPulse, TriangleAlert, Plug, BatteryCharging, Printer, Wifi, Network, ServerCog, HardDriveDownload, Workflow,
} from 'lucide-vue-next'
import { session } from '../api'
import { SENSOR_LABELS } from '../rrdmeta'

const W = (name) => defineAsyncComponent(() => import(`../components/widgets/${name}.vue`))

export const RANGE_FIELD = { key: 'range', label: 'Période', type: 'range', default: '-1d' }
const GROUP_FIELD = { key: 'group', label: 'Groupe d\'équipements', type: 'group', default: '', help: 'Vide : tous les équipements' }
const LIMIT = (d, max = 50) => ({ key: 'limit', label: 'Nombre d\'éléments', type: 'number', default: d, min: 1, max })

export const STAT_ITEMS = [
  { v: 'devices', l: 'Équipements' }, { v: 'up', l: 'En ligne' }, { v: 'down', l: 'Hors ligne' },
  { v: 'ports', l: 'Ports actifs' }, { v: 'alerts', l: 'Alertes actives' }, { v: 'traffic', l: 'Trafic total' },
]

export const POWER_CLASSES = [
  { v: 'power', l: 'Puissance (W)' }, { v: 'voltage', l: 'Tension (V)' }, { v: 'current', l: 'Courant (A)' },
  { v: 'power_consumed', l: 'Énergie (kWh)' }, { v: 'power_factor', l: 'Facteur de puissance' },
  { v: 'charge', l: 'Charge batterie (%)' }, { v: 'runtime', l: 'Autonomie (min)' },
]

export const WIDGETS = {
  stats: {
    label: 'Compteurs', icon: LayoutGrid, desc: 'Tuiles de synthèse : équipements, ports, alertes, trafic.',
    w: 12, h: 4, minH: 3, frameless: true, component: W('WStats'),
    fields: [{ key: 'items', label: 'Compteurs affichés', type: 'multi', options: STAT_ITEMS, default: STAT_ITEMS.map((x) => x.v) }, GROUP_FIELD],
  },
  'device-status': {
    label: 'État des équipements', icon: PieChart, desc: 'Anneau en ligne / hors ligne / désactivés.',
    w: 4, h: 9, component: W('WDeviceStatus'), fields: [GROUP_FIELD],
  },
  availability: {
    label: 'Carte de disponibilité', icon: Grid3x3, desc: 'Une tuile colorée par équipement, comme dans LibreNMS.',
    w: 6, h: 6, component: W('WAvailability'),
    fields: [
      GROUP_FIELD,
      { key: 'mode', label: 'Affichage', type: 'select', default: 'tiles', options: [{ v: 'tiles', l: 'Tuiles avec nom' }, { v: 'compact', l: 'Carrés compacts' }] },
      { key: 'hideUp', label: 'Masquer les équipements en ligne', type: 'bool', default: false },
    ],
  },
  sla: {
    label: 'Disponibilité (SLA)', icon: ShieldCheck, desc: 'Taux de disponibilité sur 24 h / 7 j / 30 j / 1 an, objectif de SLA, coupures récentes.',
    w: 6, h: 10, component: W('WSla'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'table', options: [{ v: 'table', l: 'Tableau par équipement' }, { v: 'outages', l: 'Dernières coupures' }] },
      { key: 'period', label: 'Période de référence', type: 'select', default: '604800', options: [{ v: '86400', l: '24 heures' }, { v: '604800', l: '7 jours' }, { v: '2592000', l: '30 jours' }, { v: '31536000', l: '1 an' }] },
      { key: 'target', label: 'Objectif de disponibilité (%)', type: 'number', default: 99.9, min: 0, max: 100 },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'sort', label: 'Tri', type: 'select', default: 'worst', options: [{ v: 'worst', l: 'Moins disponibles d\'abord' }, { v: 'name', l: 'Équipement' }] },
      LIMIT(15, 200),
      { key: 'onlyBelow', label: 'Seulement les équipements sous l\'objectif', type: 'bool', default: false },
    ],
  },
  os: {
    label: 'Systèmes d\'exploitation', icon: Cpu, desc: 'Répartition des équipements par OS.',
    w: 4, h: 9, component: W('WOs'), fields: [GROUP_FIELD],
  },
  latency: {
    label: 'Latence ICMP', icon: Timer, desc: 'Équipements les plus lents à répondre au ping.',
    w: 4, h: 9, component: W('WLatency'), fields: [LIMIT(10, 30), GROUP_FIELD],
  },
  traffic: {
    label: 'Trafic réseau', icon: Activity, desc: 'Trafic entrant / sortant cumulé d\'un équipement, d\'un groupe ou du parc, dans le temps ou par équipement.',
    w: 6, h: 10, component: W('WTraffic'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'chart', options: [{ v: 'chart', l: 'Courbe entrant / sortant cumulée' }, { v: 'devices', l: 'Débit actuel par équipement' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'filter', label: 'Filtrer les ports (nom ou description)', type: 'text', default: '', help: 'Ex. « wan », « uplink », « eth0 ». Plusieurs termes séparés par des virgules.' },
      RANGE_FIELD,
      LIMIT(10, 40),
    ],
  },
  'port-errors': {
    label: 'Ports en erreur', icon: TriangleAlert, desc: 'Ports qui produisent des erreurs (taux, % des paquets, cumul) et ports activés mais déconnectés.',
    w: 6, h: 9, component: W('WPortErrors'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'current', options: [{ v: 'current', l: 'Erreurs au dernier relevé' }, { v: 'total', l: 'Compteurs cumulés' }, { v: 'history', l: 'Historique des erreurs (courbes)' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'filter', label: 'Filtrer les ports (nom ou description)', type: 'text', default: '' },
      { key: 'down', label: 'Inclure les ports activés mais déconnectés (admin up / oper down)', type: 'bool', default: false },
      { key: 'crit', label: 'Taux d\'erreur critique (% des paquets)', type: 'number', default: 1, min: 0, max: 100 },
      LIMIT(10, 100),
      RANGE_FIELD,
    ],
  },
  'top-ports': {
    label: 'Ports les plus chargés', icon: ArrowDownUp, desc: 'Classement des ports par débit ou par taux d\'utilisation.',
    w: 6, h: 10, component: W('WTopPorts'),
    fields: [
      LIMIT(8, 30),
      { key: 'sort', label: 'Trier par', type: 'select', default: 'rate', options: [{ v: 'rate', l: 'Débit' }, { v: 'util', l: 'Utilisation (%)' }] },
      GROUP_FIELD,
    ],
  },
  services: {
    label: 'Services', icon: HeartPulse, desc: 'Vérifications de services LibreNMS (HTTP, DNS, SSH, ping…) : état, message, depuis quand.',
    w: 6, h: 9, component: W('WServices'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'list', options: [{ v: 'list', l: 'Liste (problèmes en premier)' }, { v: 'tiles', l: 'Tuiles colorées' }, { v: 'summary', l: 'Synthèse (anneau)' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'type', label: 'Type de service', type: 'text', default: '', help: 'Ex. « http », « dns », « ssh ». Vide : tous.' },
      { key: 'onlyProblems', label: 'Seulement les services en avertissement ou critiques', type: 'bool', default: false },
      { key: 'showIgnored', label: 'Inclure les services ignorés ou désactivés', type: 'bool', default: false },
      LIMIT(15, 200),
    ],
  },
  alerts: {
    label: 'Alertes en cours', icon: Bell, desc: 'Alertes actives avec leur sévérité.',
    w: 6, h: 10, component: W('WAlerts'),
    fields: [
      LIMIT(10),
      { key: 'severity', label: 'Sévérité', type: 'select', default: '', options: [{ v: '', l: 'Toutes' }, { v: 'critical', l: 'Critiques' }, { v: 'warning', l: 'Avertissements' }] },
      GROUP_FIELD,
    ],
  },
  down: {
    label: 'Équipements hors ligne', icon: CircleX, desc: 'Liste des équipements qui ne répondent plus.',
    w: 6, h: 8, component: W('WDown'), fields: [LIMIT(10), GROUP_FIELD],
  },
  locations: {
    label: 'Équipements par emplacement', icon: MapPin, desc: 'Nombre d\'équipements par site.',
    w: 6, h: 9, component: W('WLocations'), fields: [LIMIT(12, 40), GROUP_FIELD],
  },
  logs: {
    label: 'Journaux', icon: ScrollText, desc: 'Derniers évènements, syslog ou historique des alertes.',
    w: 12, h: 9, component: W('WLogs'),
    fields: [
      { key: 'type', label: 'Journal', type: 'select', default: 'eventlog', options: [{ v: 'eventlog', l: 'Évènements' }, { v: 'syslog', l: 'Syslog' }, { v: 'alertlog', l: 'Historique des alertes' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      LIMIT(15, 200),
    ],
  },
  device: {
    label: 'Fiche équipement', icon: Server, desc: 'État, uptime, latence et charge d\'un équipement.',
    w: 4, h: 7, component: W('WDevice'), fields: [{ key: 'device', label: 'Équipement', type: 'device', required: true }],
  },
  sensors: {
    label: 'Températures', icon: Thermometer, desc: 'Capteurs de température (ou autre type) avec seuils d\'alerte : tuiles, barres ou historique.',
    w: 6, h: 9, component: W('WSensors'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'tiles', options: [{ v: 'tiles', l: 'Tuiles avec jauge' }, { v: 'bars', l: 'Barres' }, { v: 'history', l: 'Historique (courbes)' }] },
      { key: 'cls', label: 'Type de capteur', type: 'select', default: 'temperature', options: Object.entries(SENSOR_LABELS).map(([v, l]) => ({ v, l })) },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'filter', label: 'Filtrer par description', type: 'text', default: '', help: 'Ex. « CPU », « Package », « inlet »' },
      { key: 'sort', label: 'Tri', type: 'select', default: 'desc', options: [{ v: 'desc', l: 'Valeur décroissante' }, { v: 'asc', l: 'Valeur croissante' }, { v: 'name', l: 'Équipement puis capteur' }] },
      LIMIT(12, 100),
      { key: 'onlyAlarm', label: 'Seulement les capteurs proches ou au-delà d\'un seuil', type: 'bool', default: false },
      RANGE_FIELD,
    ],
  },
  power: {
    label: 'Alimentation', icon: Plug, desc: 'État des blocs d\'alimentation, budget PoE, puissance, tension, courant, onduleurs.',
    w: 6, h: 8, component: W('WPower'),
    fields: [
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'classes', label: 'Mesures affichées', type: 'multi', options: POWER_CLASSES, default: POWER_CLASSES.map((x) => x.v) },
      { key: 'onlyAlarm', label: 'Seulement les éléments en défaut ou proches d\'un seuil', type: 'bool', default: false },
      LIMIT(24, 200),
      { key: 'okValue', label: 'Valeur d\'état normale (avancé)', type: 'text', default: '', help: 'À renseigner seulement si un état s\'affiche « État n » : valeur(s) brute(s) signifiant « normal ».' },
    ],
  },
  nas: {
    label: 'NAS', icon: HardDriveDownload, desc: 'NAS (Synology, QNAP…) : volumes, état RAID, santé et température de chaque disque, système.',
    w: 6, h: 12, component: W('WNas'),
    fields: [
      { key: 'device', label: 'NAS', type: 'device', default: '', help: 'Vide : tous les NAS (équipements de type « stockage »)' },
      GROUP_FIELD,
      { key: 'warn', label: 'Volume : seuil d\'avertissement (%)', type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: 'Volume : seuil critique (%)', type: 'number', default: 90, min: 1, max: 100 },
      { key: 'disks', label: 'Afficher le détail des disques', type: 'bool', default: true },
    ],
  },
  servers: {
    label: 'Serveurs', icon: ServerCog, desc: 'Une carte (ou une ligne) par serveur : CPU, RAM, swap, disques, trafic, température, alertes.',
    w: 12, h: 10, component: W('WServers'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'cards', options: [{ v: 'cards', l: 'Cartes' }, { v: 'table', l: 'Tableau compact' }] },
      { key: 'device', label: 'Serveur', type: 'device', default: '', help: 'Vide : tous les serveurs' },
      GROUP_FIELD,
      { key: 'sort', label: 'Tri', type: 'select', default: 'worst', options: [{ v: 'worst', l: 'Les plus chargés d\'abord' }, { v: 'name', l: 'Nom' }] },
      { key: 'disks', label: 'Disques affichés par serveur', type: 'number', default: 3, min: 0, max: 10 },
      { key: 'warn', label: 'Seuil d\'avertissement (%)', type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: 'Seuil critique (%)', type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: 'Seulement les serveurs au-delà d\'un seuil, hors ligne ou en alerte', type: 'bool', default: false },
      { key: 'allTypes', label: 'Inclure tous les équipements ayant CPU / RAM (pas seulement le type « serveur »)', type: 'bool', default: false },
    ],
  },
  switches: {
    label: 'Switchs', icon: Network, desc: 'Façade de chaque switch (ports colorés selon état et vitesse), trafic, CPU, RAM, température, PoE.',
    w: 6, h: 9, component: W('WSwitches'),
    fields: [
      { key: 'device', label: 'Switch', type: 'device', default: '', help: 'Vide : tous les switchs' },
      GROUP_FIELD,
      { key: 'color', label: 'Couleur des ports', type: 'select', default: 'speed', options: [{ v: 'speed', l: 'Vitesse négociée' }, { v: 'util', l: 'Charge (utilisation)' }] },
      { key: 'kpis', label: 'Afficher les indicateurs (trafic, CPU, RAM, température, PoE)', type: 'bool', default: true },
    ],
  },
  wifi: {
    label: 'Points d\'accès Wi-Fi', icon: Wifi, desc: 'Clients par SSID et par radio, canal, occupation du canal, bruit, puissance d\'émission.',
    w: 6, h: 10, component: W('WWifi'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'cards', options: [{ v: 'cards', l: 'Cartes par point d\'accès' }, { v: 'history', l: 'Historique des clients' }] },
      { key: 'device', label: 'Point d\'accès / contrôleur', type: 'device', default: '', help: 'Vide : tous' },
      GROUP_FIELD,
      { key: 'util', label: 'Occupation de canal élevée (%)', type: 'number', default: 60, min: 1, max: 100 },
      { key: 'by', label: 'Courbes de l\'historique', type: 'select', default: 'ssid', options: [{ v: 'ssid', l: 'Par SSID' }, { v: 'radio', l: 'Par radio' }] },
      RANGE_FIELD,
    ],
  },
  printers: {
    label: 'Imprimantes', icon: Printer, desc: 'État des imprimantes, niveaux de toner / tambour / bacs papier, compteurs de pages.',
    w: 6, h: 8, component: W('WPrinters'),
    fields: [
      { key: 'device', label: 'Imprimante', type: 'device', default: '', help: 'Vide : toutes les imprimantes' },
      GROUP_FIELD,
      { key: 'low', label: 'Niveau bas des consommables (%)', type: 'number', default: 15, min: 0, max: 100 },
      { key: 'paper', label: 'Afficher les bacs papier', type: 'bool', default: true },
      { key: 'onlyAlarm', label: 'Seulement les imprimantes en défaut ou avec un consommable bas', type: 'bool', default: false },
    ],
  },
  ups: {
    label: 'Onduleurs', icon: BatteryCharging, desc: 'Une carte par onduleur : batterie, autonomie, charge, tensions, état secteur / batterie.',
    w: 6, h: 9, component: W('WUps'),
    fields: [
      { key: 'device', label: 'Onduleur', type: 'device', default: '', help: 'Vide : tous les onduleurs détectés' },
      GROUP_FIELD,
      { key: 'lowBattery', label: 'Charge batterie critique (%)', type: 'number', default: 30, min: 0, max: 100 },
      { key: 'lowRuntime', label: 'Autonomie critique (minutes)', type: 'number', default: 10, min: 0, max: 600 },
      { key: 'okValue', label: 'Valeur d\'état normale (avancé)', type: 'text', default: '', help: 'À renseigner seulement si un état s\'affiche « État n ».' },
    ],
  },
  fans: {
    label: 'Ventilateurs', icon: Fan, desc: 'État des ventilateurs (normal / en panne) et vitesses en tr/min si l\'équipement les remonte.',
    w: 6, h: 5, component: W('WFans'),
    fields: [
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'onlyAlarm', label: 'Seulement les ventilateurs en défaut', type: 'bool', default: false },
      { key: 'mode', label: 'Affichage des vitesses (tr/min)', type: 'select', default: 'tiles', options: [{ v: 'tiles', l: 'Tuiles avec jauge' }, { v: 'bars', l: 'Barres' }, { v: 'history', l: 'Historique (courbes)' }] },
      RANGE_FIELD,
      { key: 'okValue', label: 'Valeur d\'état normale (avancé)', type: 'text', default: '', help: 'À renseigner seulement si un état s\'affiche « État n » : valeur(s) brute(s) signifiant « normal », ex. « 1 » ou « 1, 3 ».' },
    ],
  },
  storage: {
    label: 'Stockage des disques', icon: HardDrive, desc: 'Occupation des disques et volumes : espace utilisé, libre, seuils.',
    w: 6, h: 10, component: W('WStorage'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'list', options: [{ v: 'list', l: 'Liste avec barres' }, { v: 'rings', l: 'Jauges circulaires' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'filter', label: 'Filtrer par volume', type: 'text', default: '', help: 'Ex. « C: », « /volume », « /home »' },
      { key: 'sort', label: 'Tri', type: 'select', default: 'perc', options: [{ v: 'perc', l: 'Taux d\'occupation' }, { v: 'free', l: 'Espace libre (le moins d\'abord)' }, { v: 'size', l: 'Taille' }, { v: 'name', l: 'Équipement puis volume' }] },
      LIMIT(15, 200),
      { key: 'warn', label: 'Seuil d\'avertissement (%)', type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: 'Seuil critique (%)', type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: 'Seulement les volumes au-delà du seuil d\'avertissement', type: 'bool', default: false },
      { key: 'showSystem', label: 'Afficher aussi les volumes système (/run, /tmp, /boot, < 1 Go…)', type: 'bool', default: false },
    ],
  },
  cpu: {
    label: 'Processeurs (CPU)', icon: Cpu, desc: 'Charge CPU par équipement : moyenne, cœur le plus chargé, carte des cœurs, historique.',
    w: 6, h: 10, component: W('WCpu'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'list', options: [{ v: 'list', l: 'Liste avec barres et cœurs' }, { v: 'rings', l: 'Jauges circulaires' }, { v: 'history', l: 'Historique (courbes)' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'sort', label: 'Tri', type: 'select', default: 'avg', options: [{ v: 'avg', l: 'Charge moyenne' }, { v: 'max', l: 'Cœur le plus chargé' }, { v: 'cores', l: 'Nombre de cœurs' }, { v: 'name', l: 'Équipement' }] },
      LIMIT(15, 200),
      { key: 'warn', label: 'Seuil d\'avertissement (%)', type: 'number', default: 75, min: 1, max: 100 },
      { key: 'crit', label: 'Seuil critique (%)', type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: 'Seulement les équipements au-delà du seuil d\'avertissement', type: 'bool', default: false },
      RANGE_FIELD,
    ],
  },
  memory: {
    label: 'Mémoire RAM', icon: MemoryStick, desc: 'Occupation de la mémoire vive par équipement, avec cache et swap.',
    w: 6, h: 10, component: W('WMemory'),
    fields: [
      { key: 'mode', label: 'Affichage', type: 'select', default: 'list', options: [{ v: 'list', l: 'Liste avec barres' }, { v: 'rings', l: 'Jauges circulaires' }] },
      { key: 'device', label: 'Équipement', type: 'device', default: '', help: 'Vide : tous les équipements' },
      GROUP_FIELD,
      { key: 'sort', label: 'Tri', type: 'select', default: 'perc', options: [{ v: 'perc', l: 'Taux d\'occupation' }, { v: 'total', l: 'Quantité de RAM' }, { v: 'name', l: 'Équipement' }] },
      LIMIT(15, 200),
      { key: 'warn', label: 'Seuil d\'avertissement (%)', type: 'number', default: 80, min: 1, max: 100 },
      { key: 'crit', label: 'Seuil critique (%)', type: 'number', default: 90, min: 1, max: 100 },
      { key: 'onlyAlarm', label: 'Seulement les équipements au-delà du seuil d\'avertissement', type: 'bool', default: false },
      { key: 'swap', label: 'Afficher l\'utilisation du swap', type: 'bool', default: true },
    ],
  },
  rrd: {
    label: 'Graphique interactif', icon: LineChart, desc: 'N\'importe quelle métrique RRD d\'un équipement (CPU, mémoire, capteurs…).',
    w: 6, h: 9, component: W('WRrd'), needs: 'rrd',
    fields: [
      { key: 'device', label: 'Équipement', type: 'device', required: true },
      { key: 'file', label: 'Métrique', type: 'rrd', required: true, depends: 'device' },
      RANGE_FIELD,
      { key: 'stats', label: 'Afficher actuel / moyenne / max', type: 'bool', default: true },
      { key: 'scale', label: 'Afficher l\'échelle (axes)', type: 'bool', default: true },
    ],
  },
  port: {
    label: 'Trafic d\'un port', icon: Cable, desc: 'Débit entrant / sortant d\'une interface.',
    w: 6, h: 9, component: W('WPort'),
    fields: [
      { key: 'device', label: 'Équipement', type: 'device', required: true },
      { key: 'port', label: 'Port', type: 'port', required: true, depends: 'device' },
      RANGE_FIELD,
      { key: 'stats', label: 'Afficher actuel / moyenne / max', type: 'bool', default: true },
      { key: 'scale', label: 'Afficher l\'échelle (axes)', type: 'bool', default: true },
    ],
  },
  graph: {
    label: 'Graphique LibreNMS', icon: Image, desc: 'Graphique image généré par LibreNMS pour un équipement.',
    w: 6, h: 9, component: W('WGraph'),
    fields: [
      { key: 'device', label: 'Équipement', type: 'device', required: true },
      { key: 'graph', label: 'Graphique', type: 'graph', required: true, depends: 'device' },
      RANGE_FIELD,
    ],
  },
  diagram: {
    label: 'Schéma', icon: Workflow, desc: 'Affiche un de vos schémas réseau, avec l\'état et le trafic en direct.',
    w: 6, h: 12, component: W('WDiagram'),
    fields: [
      { key: 'diagram', label: 'Schéma', type: 'diagram', required: true },
      { key: 'rates', label: 'Afficher les débits sur les liens', type: 'bool', default: true },
    ],
  },
  map: {
    label: 'Carte géographique', icon: Map, desc: 'Sites localisés, colorés selon l\'état des équipements.',
    w: 6, h: 11, component: W('WMap'), fields: [GROUP_FIELD, { key: 'onlyDown', label: 'Sites en défaut uniquement', type: 'bool', default: false }],
  },
  iframe: {
    label: 'Page web (iframe)', icon: AppWindow, desc: 'Intègre une page web : Grafana, caméra, Home Assistant, page LibreNMS, wiki…',
    w: 6, h: 10, component: W('WIframe'),
    fields: [
      { key: 'url', label: 'Adresse (http:// ou https://)', type: 'text', required: true, default: '', help: 'Certains sites interdisent l\'intégration (X-Frame-Options / CSP) : la zone reste alors vide ou affiche une erreur du navigateur.' },
      { key: 'refresh', label: 'Recharger la page', type: 'select', default: 0, options: [{ v: 0, l: 'Jamais' }, { v: 30, l: 'Toutes les 30 s' }, { v: 60, l: 'Toutes les minutes' }, { v: 300, l: 'Toutes les 5 min' }, { v: 900, l: 'Toutes les 15 min' }, { v: 3600, l: 'Toutes les heures' }] },
      { key: 'zoom', label: 'Zoom', type: 'select', default: 100, options: [50, 67, 75, 80, 90, 100, 110, 125, 150].map((v) => ({ v, l: `${v} %` })) },
      { key: 'scripts', label: 'Autoriser JavaScript dans la page', type: 'bool', default: true },
      { key: 'interact', label: 'Autoriser les clics et le défilement', type: 'bool', default: true },
    ],
  },
  notes: {
    label: 'Notes', icon: StickyNote, desc: 'Texte libre : consignes, contacts, liens utiles.',
    w: 4, h: 6, component: W('WNotes'),
    fields: [{ key: 'text', label: 'Texte', type: 'textarea', default: '', help: '**gras**, liens http(s) cliquables, une ligne commençant par « - » devient une puce.' }],
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
