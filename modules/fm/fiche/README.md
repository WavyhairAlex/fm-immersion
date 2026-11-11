# FM Immersion Fiche, plugin FM27

Plugin **BepInEx 6 (Unity IL2CPP)** pour Football Manager 27. Il ajoute un bouton **FM Immersion** à côté du bouton
« Actions » de la fiche d'un joueur. Un clic ouvre la fiche de ce joueur dans FM Immersion, qui passe au premier plan.

## Comment ça marche

- FM27 n'a plus IMGUI : le bouton est un `Button` UI Toolkit inséré dans l'arbre de l'interface du jeu
  (`MainUIDocument`), à côté de l'élément `FrameActions` du bandeau `report-player-banner-max` (repérés par la sonde
  de lecture du 11/11/2026). Le texte du bouton prend la police du jeu.
- Le clic écrit `fmimmersion-demande.json` (format `fmimmersion-demande/1` : `id`, `action: "ouvrir"`, `nom` du
  joueur affiché, `quand`) dans le dossier d'Archivix Bridge (clé `Dossier` de `fr.archivix.bridge.cfg`).
- FM Immersion relit ce fichier toutes les 2 s (`fm_read_request`, `src/lib/game-request.ts`), retrouve le joueur
  dans l'effectif par son nom (`playerForRequest`) et ouvre sa fiche. Une demande de plus de 2 minutes est ignorée.

Lecture seule : aucune action de jeu, aucun patch Harmony, rien d'écrit dans le jeu ni dans la sauvegarde. Après
20 erreurs, le plugin s'arrête.

## Compilation et installation (test)

```
dotnet build -c Release -p:FM="<dossier BepInEx du jeu>"
```

Copier `FMImmersion.Fiche.dll` dans `BepInEx\plugins\FMImmersionFiche\` ; il se charge au lancement suivant de FM27.
Pour le retirer, supprimer ce dossier.
