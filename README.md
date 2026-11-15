# LibreNMS XUI

Interface web moderne pour LibreNMS, construite sur l'API v0 + les fichiers RRD (graphiques interactifs).

## Démarrage

```bash
cp .env.example .env   # puis éditer
docker compose up -d --build
```
Interface : `http://<hôte>:8095`

## Authentification (3 modes)

| Mode | Configuration | Connexion |
|---|---|---|
| **Jeton personnel** (défaut) | `LIBRENMS_TOKEN` vide | chaque utilisateur colle son jeton API LibreNMS — ses droits LibreNMS s'appliquent |
| **Compte local** | `LIBRENMS_TOKEN` + `UI_PASSWORD` | `UI_USERNAME` / `UI_PASSWORD`, le jeton serveur est utilisé |
| **Aucune** | `AUTH_DISABLED=true` | réseau de confiance uniquement |

Jeton : LibreNMS › *Paramètres › API › Create API access token*. Un compte **admin** donne accès à
toutes les actions (ajout/suppression d'équipements, acquittement, règles…) ; un compte *global-read*
suffit pour la consultation. `READ_ONLY=true` bloque toute modification côté XUI.

Le jeton ne quitte jamais le serveur (sessions côté serveur, cookie HttpOnly) et les secrets SNMP
(community, mots de passe v3) sont masqués avant d'être envoyés au navigateur.

### Connexion avec les comptes LibreNMS (`UI_AUTH=librenms`)

Avec `LIBRENMS_TOKEN` défini et `UI_AUTH=librenms`, on se connecte à XUI avec ses identifiants
LibreNMS (base locale, LDAP, AD… : XUI rejoue le formulaire de connexion de LibreNMS).
Les appels API passent par le jeton serveur ; les droits dépendent du rôle LibreNMS :
`admin` → toutes les fonctions, `global-read` → consultation seule, compte limité à certains
équipements → refusé. La double authentification n'est pas gérée. `UI_USERNAME` / `UI_PASSWORD`
restent un compte de secours (vider `UI_PASSWORD` pour le supprimer).

## Graphiques

Le dossier `rrd` de LibreNMS est monté **en lecture seule** : les courbes sont tracées à partir des
données réelles (zoom, survol, plages 1 h → 1 an, stats act./moy./max). Sans montage, l'interface
bascule sur les images PNG générées par LibreNMS. Si LibreNMS utilise rrdcached, renseigner `RRDCACHED`.

## Fonctionnalités

- **Tableaux de bord personnalisables** (comme dans LibreNMS) : plusieurs tableaux par utilisateur,
  widgets à glisser / redimensionner (bouton « Personnaliser »), partage privé / lecture / écriture,
  tableau par défaut (★), duplication, export / import JSON. Widgets : compteurs, état du parc,
  carte de disponibilité, OS, latence, ports les plus chargés, alertes, équipements hors ligne,
  emplacements, journaux (évènements / syslog / alertes), fiche équipement, températures / capteurs,
  ventilateurs, alimentation (PSU, PoE), onduleurs, serveurs, NAS (RAID, santé des disques), switchs (façade des ports), points d'accès Wi-Fi (`/xui/wireless`), imprimantes (consommables lus dans les RRD, `/xui/printers`), services LibreNMS, ports en erreur, disponibilité / SLA (24 h à 1 an, coupures, `/xui/availability`), trafic réseau cumulé (somme des RRD de ports), stockage des disques, mémoire RAM et CPU (agrégés par `/xui/storage`, `/xui/memory`
  et `/xui/cpu`, cache 60 s), graphique RRD interactif,
  trafic d'un port, graphique LibreNMS, carte géographique, notes, page web (iframe sandboxée).
  Les données agrégées (CPU, RAM, stockage, disponibilité, Wi-Fi, imprimantes) sont préchauffées au démarrage
  puis servies depuis un cache rafraîchi en arrière-plan ; `AGG_CONCURRENCY` (6 par défaut) limite les requêtes
  simultanées vers LibreNMS (15 processus PHP par défaut).
  Stockage : `./data/dashboards.json` (volume `/data`). Le propriétaire d'un tableau est le nom
  d'utilisateur de la session XUI : en mode « jeton », c'est le nom saisi à la connexion, ce qui
  sert à ranger les tableaux et ne constitue pas un contrôle d'accès fort.
- **Schémas réseau** (menu Visualisation › Schémas) : éditeur intégré — équipements glissés depuis une liste,
  liens tracés entre deux éléments avec choix des ports (pré-remplis par LLDP), nuages et textes libres,
  liens courbables, fond uni / grille / image (plan, photo de baie ; PNG, JPEG, WebP, GIF, 8 Mo max.),
  annuler / rétablir, export SVG. En direct : état des équipements, alertes, couleur et épaisseur des liens selon
  charge (%) ou débit, avec paliers et couleurs personnalisables par schéma, débits. Image personnalisée par
  équipement (dans la carte ou à la place de la carte), bibliothèque partagée `./data/diagram-img/`. Création possible depuis la topologie LLDP (disposition en arbre). Partage privé /
  lecture / écriture comme les tableaux de bord ; widget « Schéma ». Stockage : `./data/diagrams.json` et
  `./data/diagram-bg/`.
- **Équipements** : cartes/tableau, filtres (état, OS, type, emplacement, groupe), ajout SNMP v1/v2c/v3 ou ICMP
- **Fiche équipement** : vue d'ensemble (jauges CPU/RAM/disque/dispo, photos de l'équipement avec légendes et
  plein écran, stockées dans `./data/device-photos/`), ports avec sparklines, santé
  (processeurs, mémoire, stockage, capteurs + graphiques), explorateur de tous les RRD, inventaire ENTITY-MIB
  en arbre, voisins CDP/LLDP (graphe), IP, VLAN, FDB, ARP, pile de ports, transceivers, BGP/OSPF/VRF/IPsec,
  services, alertes, journaux, disponibilité & coupures, composants, config Oxidized, gestion
  (propriétés, maintenance, renommage, redécouverte, suppression)
- **Port** : trafic, paquets, broadcast/multicast, erreurs, IP, MAC apprises, édition de la description
- **Ports / Santé** globaux, **Alertes** (acquittement, règles CRUD avec assistant, historique, modèles)
- **Journaux** : évènements, syslog, alertes, authentification (filtres de dates, export CSV)
- **Carte** géographique, **Topologie** colorée selon la charge des liens
- **Groupes**, **Emplacements** (placement par clic/glisser sur la carte), **Services**, **Routage**,
  **Ressources** IP/ARP/FDB/VLAN, **Facturation**, **Système**, **Explorateur API**
- Recherche globale `Ctrl+K`, thème clair/sombre, rafraîchissement automatique, export CSV partout
