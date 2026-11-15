import { t } from '../i18n'
// Traductions connues des capteurs d'état LibreNMS (l'API ne fournit que la valeur brute).
// Chaque entrée : valeur -> [libellé, niveau] avec niveau ok | warn | crit | unk.
const N = (l) => [l, 'ok']; const W = (l) => [l, 'warn']; const C = (l) => [l, 'crit']; const U = (l) => [l, 'unk']
const SYNO = { 1: N('Normal'), 2: C(t('En panne')) }

export const STATE_MAPS = {
  // ventilateurs
  systemFanStatusState: SYNO, cpuFanStatusState: SYNO,
  ciscoEnvMonFanState: { 1: N('Normal'), 2: W('Avertissement'), 3: C('Critique'), 4: C(t('Arrêté')), 5: U('Absent'), 6: C('Hors service') },
  cpqHeFltTolFanCondition: { 1: U('Autre'), 2: N('OK'), 3: W(t('Dégradé')), 4: C(t('En panne')) },
  cpqHeFltTolFanPresent: { 1: U('Autre'), 2: U('Absent'), 3: N(t('Présent')) },
  coolingDeviceStatus: { 1: U('Autre'), 2: U('Inconnu'), 3: N('OK'), 4: W('Non critique'), 5: C('Critique'), 6: C(t('Irrécupérable')), 7: W('Non critique'), 8: C('Critique'), 9: C(t('Irrécupérable')), 10: C(t('En panne')) },
  jnxFruState: { 1: U('Inconnu'), 2: U('Vide'), 3: U(t('Présent')), 4: W(t('Prêt')), 5: W(t('Annoncé en ligne')), 6: N(t('En ligne')), 7: W(t('Hors ligne annoncé')), 8: C('Hors ligne'), 9: W('Diagnostic'), 10: U('Veille') },
  hwFanStatus: { 1: N('Normal'), 2: C('Anormal') },
  fanState: { 1: N('Normal'), 2: C(t('En panne')) },
  // alimentations
  powerStatusState: SYNO, powerStatus: SYNO,
  hpicfPsState: { 1: U('Absent'), 2: C(t('Non branchée')), 3: N(t('Alimentée')), 4: C(t('En panne')), 5: C('Panne permanente'), 6: U('Max'), 7: C('Panne auxiliaire'), 8: C(t('Non alimentée')), 9: W(t('Auxiliaire non alimentée')) },
  ciscoEnvMonSupplyState: { 1: N('Normal'), 2: W('Avertissement'), 3: C('Critique'), 4: C(t('Arrêtée')), 5: U('Absente'), 6: C('Hors service') },
  cpqHeFltTolPowerSupplyCondition: { 1: U('Autre'), 2: N('OK'), 3: W(t('Dégradée')), 4: C(t('En panne')) },
  powerSupplyStatus: { 1: U('Autre'), 2: U('Inconnue'), 3: N('OK'), 4: W('Non critique'), 5: C('Critique'), 6: C(t('Irrécupérable')) },
  hwEntityPowerStatus: { 1: N('Normal'), 2: C('Anormal') },
  upsBasicOutputStatus: { 1: U('Inconnu'), 2: N(t('En ligne (secteur)')), 3: C(t('Sur batterie')), 4: W('Boost'), 5: W('Veille'), 6: C(t('Éteint')), 7: W(t('Réparation')), 8: W('Bypass') },
  upsBatteryStatus: { 1: U('Inconnue'), 2: N('Normale'), 3: C('Faible'), 4: C(t('Épuisée')) },
  upsBasicBatteryStatus: { 1: U('Inconnue'), 2: N('Normale'), 3: C('Faible'), 4: C(t('En défaut')) },
  upsAdvBatteryReplaceIndicator: { 1: N('Batterie OK'), 2: C(t('Batterie à remplacer')) },
  upsAdvTestDiagnosticsResults: { 1: N(t('Test réussi')), 2: C(t('Test échoué')), 3: W('Test invalide'), 4: W(t('Test en cours')) },
  xupsOutputSource: { 1: U('Autre'), 2: C('Aucune'), 3: N('Secteur'), 4: W('Bypass'), 5: C('Batterie'), 6: W('Boost'), 7: W(t('Réduction')), 8: N(t('Parallèle')), 9: N(t('Parallèle redondant')), 10: N('Haut rendement') },
  xupsBatteryAbmStatus: { 1: W(t('En charge')), 2: W(t('Décharge')), 3: N('Floating'), 4: N('Repos'), 5: U('Inconnu') },
  // NAS Synology (traductions de LibreNMS, resources/definitions/os_discovery/dsm.yaml)
  systemStatusState: SYNO,
  upgradeAvailableState: { 1: W(t('Mise à jour disponible')), 2: N(t('À jour')), 3: U(t('Vérification…')), 4: U('Hors ligne'), 5: U('Autre') },
  raidStatusState: { 1: N('Normal'), 2: W(t('Réparation')), 3: W('Migration'), 4: W('Extension'), 5: W('Suppression'), 6: W(t('Création')), 7: W('Synchronisation'), 8: W(t('Vérification de parité')), 9: W('Assemblage'), 10: W('Annulation'), 11: C(t('Dégradé')), 12: C(t('En panne')), 13: W(t('Nettoyage des données')), 14: W(t('Déploiement')), 15: W('Retrait'), 16: W(t('Montage du cache')), 17: W(t('Démontage du cache')), 18: W('Extension SHR'), 19: W('Conversion SHR'), 20: W('Migration SHR1 → SHR2'), 21: U('Inconnu') },
  diskStatusState: { 1: N('Normal'), 2: W(t('Initialisé')), 3: W(t('Non initialisé')), 4: C(t('Partition système en panne')), 5: C(t('En panne')) },
  diskHealthStatusState: { 1: N('Sain'), 2: W('Avertissement'), 3: C('Critique'), 4: C(t('Défaillant')) },
  // imprimantes (traductions de LibreNMS, includes/discovery/sensors/state/printer.inc.php)
  hrDeviceStatus: { 1: U('Inconnu'), 2: N(t('En marche')), 3: W('Avertissement'), 4: N('Test'), 5: C('Hors service') },
  hrPrinterDetectedErrorState: { 0: N('Normal'), 1: W('Papier bas'), 2: C(t('Plus de papier')), 3: W('Toner bas'), 4: C(t('Plus de toner')), 5: C('Capot ouvert'), 6: C('Bourrage'), 7: C('Hors ligne'), 8: C('Intervention requise'), 9: W('Plusieurs avertissements'), 10: C(t('Plusieurs problèmes')) },
  upsOutputSource: { 1: U('Autre'), 2: C('Aucune'), 3: N('Secteur'), 4: W('Bypass'), 5: C('Batterie'), 6: W('Boost'), 7: W(t('Réduction')) },
}

/** Traduit un capteur d'état ; okValue (« 1 » ou « 1, 3 ») force l'interprétation normal / anormal. */
export function interpretState(s, okValue) {
  const v = +s.sensor_current
  const ok = String(okValue ?? '').trim()
  if (ok !== '') return ok.split(/[\s,;]+/).map(Number).includes(v) ? N('Normal') : C(`Anormal (${v})`)
  const m = STATE_MAPS[s.sensor_type] || STATE_MAPS[String(s.sensor_type).replace(/State$/, '')]
  return m?.[v] || U(t('État {v}', { v }))
}
