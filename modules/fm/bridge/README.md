# Archivix Bridge — plugin FM27

Plugin **BepInEx 6 (Unity IL2CPP)** pour Football Manager 27, en **lecture seule** : il lit l'effectif, la tactique,
le club et le prochain match via le système de bindings de l'interface du jeu, puis écrit
`archivix-snapshot.json` (format `archivix/1`) que le module `fm` de Simloom importe.

- Jamais d'écriture dans la mémoire du jeu ni dans les sauvegardes, jamais d'action de jeu (`SendEvent`, `ActionID`).
- Un instantané au chargement d'une partie, puis à chaque nouveau jour de jeu (au plus tard toutes les 60 s).
- Écriture atomique (`.tmp` puis renommage) ; jamais d'instantané vide.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/Plugin.cs` | Point d'entrée BepInEx, boucle d'instantanés, petit serveur local `http://localhost:8727` (sonde) |
| `src/FmBindingReader.cs` | Lecture groupée des bindings (chemins texte, ex. `game.GameCurrentManagerClubTeam/Club/Squad`) |
| `src/Probe.cs` | Sonde de découverte (`/api/probe`, `/api/properties`, `/api/refprops`) et file du thread principal |
| `config/chemins.json` | **Données supplémentaires sans recompiler** : chemins lus à chaque instantané (bloc `custom`) |

## Réglage

`BepInEx\config\fr.archivix.bridge.cfg`, clé `Dossier` : dossier où écrire les instantanés.
Par défaut `Documents\Sports Interactive\Football Manager 27\archivix`. Simloom le renseigne à l'installation.

Autres clés : `LireTactique` (non par défaut), `LireEfficacite` (non par défaut, expérimental),
`LireCompo` (non par défaut, expérimental : joueur à chaque poste), `LireJoueursEtendus` (non par défaut, expérimental : moral, hiérarchie, étoiles du staff), `LireCibles` (non par défaut, expérimental : cibles du mercato), `Decouverte` (oui par défaut : rapport
`archivix\config\decouverte.json`), `RelectureSecondes` (300 par défaut, 60 au minimum : relecture complète même sans
changement de date).

## Garde-fou « écran Tactique » (0.3.0)

Toute lecture liée à la tactique (`LireTactique`, `LireEfficacite`, `LireCompo`, section `tactique` de `chemins.json`,
sondes `/api/probe` et `/api/squad`) est **sautée tant que l'écran Tactique de FM27 est ouvert**, ou si son état est
inconnu. L'état est lu dans le fil d'événements de l'interface que le jeu tient pour son rapporteur de plantage
(`LocalLow\Sports Interactive\Football Manager 27\backtrace\bt-breadcrumbs-*`, événements `Panel Opened/Closed` de
`TacticalPlannerTool` du lancement en cours) : aucune requête au jeu. L'instantané indique ce qui a été lu ou sauté
dans `collecte` (ex. `{"tactique": "sautée : écran Tactique ouvert"}`).

## Propriétés « de contexte »

Syntaxe de chemin `Propriete{Contexte=valeur,Autre=valeur}`, utilisable aussi dans `chemins.json`. Une valeur est un
nombre, `true`/`false`, ou une référence : `@team` (équipe du club humain), `@human` (manager humain), `@person`
(joueur courant, section `joueur`). Exemples :
`"joueurPoste3": "PlayerFromTeamSelectionIndex{TeamSelectionIndex=3}/Name"` (section `tactique`),
`"moral": "Morale{team=@team,human=@human}"` (section `joueur`).
Le rapport `decouverte.json` liste, pour les principaux types de référence, chaque propriété et les contextes qu'elle
exige (`null` = aucun), ainsi que tous les noms de contexte connus du jeu. Il est écrit une fois par lancement, à partir
des tables statiques de l'interface (aucune requête au jeu).

## Instantané : blocs ajoutés en 0.3.0

- `lineup` (si `LireCompo`, 0.3.1) : `[{ "index": 0-10, "playerId", "playerName", "positionIP", "positionOOP",
  "ipRole", "oopRole", "roleOverride", "personalisedIP", "personalisedOOP" }]` ; codes de poste et de rôle :
  masques `PositionMask`, `InPossessionRole`, `OutOfPossessionRole` (voir `codes-roles-tactique.json`). `null` si le jeu
  ne répond pas.
- `playersExtended` (si `LireJoueursEtendus`, 0.3.1) : par id de joueur `{ morale, moraleText, happinessClub,
  happinessManagement, happinessPlayingTime, happinessTraining, hierarchy, currentStars, potentialStars, personality,
  mediaHandling, currentAbility, potentialAbility }` (champs absents si le jeu ne répond pas).
- Efficacité tactique (si `LireEfficacite`) : désormais lue avec son contexte `{human}`.
- `collecte` : `{ "tactique" | "efficacite" | "compo": "lue" | "désactivée (réglage)" | "sautée : …" | "erreur : …" }`.

## Cibles du mercato (0.4.0, réglage `LireCibles`)

Joueurs d'autres clubs que le joueur suit, pour la page « Cibles du mercato » de Simloom. Sources (propriétés trouvées
dans `decouverte.json`, remplaçables sans recompiler par la section `cibles` de `chemins.json`) :

- `listeSuivi` : `GameCurrentManager/HumanSelectedShortlist{IsPlayerRecruitment=true,team=@team}` (liste de suivi affichée) ;
- `cibles` : `GameCurrentManagerClubTeam/Club/PlayerTargetsList{human=@human}` (cibles du recrutement).

Une source peut renvoyer une liste de joueurs, une liste de fiches qui contiennent un joueur, ou une fiche qui contient
la liste : le plugin garde les joueurs (40 au plus, par paquets de 10). Pour chacun : les champs de `players`
(attributs en fourchette selon la connaissance du recrutement), plus `club`, `sources` et `scout` (étoiles du staff et
des recruteurs, connaissance, recommandation, meilleur poste et rôles vus par le recrutement, fourchettes de valeur et de
salaire, clubs intéressés, statut de transfert, personnalité). Écrit dans le bloc `shortlist` de l'instantané ; relu à
chaque nouveau jour de jeu seulement. `targetSources` indique, par source, le nombre de joueurs trouvés et, si aucun,
la forme de la réponse du jeu (pour corriger le chemin). Aucune lecture liée à la tactique.

## Requêtes au jeu : règles

- Chaque requête de binding est **désinscrite** dès sa réponse, même tardive, et **au délai dépassé** (0.2.2).
  Avant, une requête sans réponse restait active dans le jeu et s'ajoutait à chaque instantané : cause probable des gels
  de l'écran Tactique du 31/10 (FM27 figé ou arrêté pendant que des lectures de la tactique attendaient).
- Certaines propriétés sont « de contexte » : le jeu ne les résout que si la requête fournit un contexte
  (`BindingUtils.BuildRequest(...).AddContext(nom, valeur).BindOneShot(propriété, …)` ;
  `BindingUtils.RequiresContext(référence, propriété)` permet de le savoir). Sans contexte, elles ne répondent jamais.
  C'est le cas des pistes pour la compo (joueur par poste, rôles « Personnalisée ») : `PlayerFromTeamSelectionIndex`,
  `PositionFromTeamSelectionIndex`, `PlayerTeamSelectionIndex`, `TeamSelection`… À tester avec un contexte d'index de
  sélection, jamais pendant que l'écran Tactique est ouvert.

## Mises à jour

1. **Données à lire** : modifier `config/chemins.json`. Simloom le redéploie avec le plugin ; le plugin le relit à chaque
   instantané (pas de recompilation, pas de redémarrage du jeu).
2. **Code du plugin** : le plugin se compile contre les DLL d'interop générées par BepInEx dans le dossier du jeu.
   Elles appartiennent à l'éditeur : elles ne sont **ni versionnées ni publiées**, et la CI ne peut pas compiler le plugin.
   Il n'est donc **pas embarqué dans l'installeur Simloom** (construit par la CI, sans composant propriétaire,
   condition de la signature SignPath). Il est publié à part :

   ```powershell
   # version identique dans ArchivixBridge.csproj (<Version>) et Plugin.Version
   .\publier.ps1 -FMDir "G:\Steam\steamapps\common\Football Manager 27"
   ```

   Le script compile en local, calcule les empreintes SHA-256 et crée la release `fm-bridge-vX.Y.Z`
   (`ArchivixBridge.dll`, `chemins.json`, `fm-bridge.json`) **sans la marquer « latest »** : ce statut reste à la
   release de l'appli, que `tauri-plugin-updater` lit.
3. **Côté joueur** : carte « Plugin FM27 » dans une partie Football Manager. Simloom compare la version installée
   à la dernière release, télécharge, vérifie les empreintes, puis installe — seulement sur demande et jeu fermé
   (`src-tauri/src/fm_bridge.rs`).

## Prérequis côté joueur

BepInEx 6 « bleeding edge » pour Unity IL2CPP win-x64 dézippé à côté de `fm.exe`, puis un premier lancement du jeu
pour générer `BepInEx\interop`. Simloom n'installe pas BepInEx lui-même.

## Compiler en local

```powershell
dotnet build -c Release -p:FMDir="G:\Steam\steamapps\common\Football Manager 27"
```

`FMDir` peut aussi venir de la variable d'environnement `FM27_DIR`. La cartographie des données du jeu
(chemins, types, limites connues) est décrite dans le rapport `cartographie.md` produit pendant le développement.
