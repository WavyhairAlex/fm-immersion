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
`RelectureSecondes` (300 par défaut, 60 au minimum : relecture complète même sans changement de date).

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
