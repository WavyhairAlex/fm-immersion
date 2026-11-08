# FM Immersion CoachPhoto, plugin FM27

Plugin **BepInEx 6 (Unity IL2CPP)** pour Football Manager 27. Il affiche la photo du coach choisie dans FM Immersion
à la place du portrait 3D du manager humain.

## Comment ça marche

FM27 n'a aucun fichier image pour le manager humain. `ManagerCloseupShotGenerator` (FM.UI) rend l'avatar 3D du créateur
de personnage en gros plan (`Texture2D`) et le garde dans son cache `m_closeupCache` (clé : identifiant unique du
manager). Les écrans reçoivent la texture de ce cache.

Toutes les 0,5 s, le plugin remplace chaque gros plan du cache par une texture faite de `photo-coach.png`. FM Immersion
écrit ce fichier dans le dossier des instantanés d'Archivix Bridge dès que le joueur choisit une photo, et le retire
quand il la retire (le plugin rend alors l'avatar).

- Aucun patch Harmony, aucune écriture dans la sauvegarde ni dans les fichiers du jeu.
- Un écran déjà ouvert garde l'avatar jusqu'à ce qu'on le rouvre.
- Après 20 erreurs, le plugin s'arrête et remet les portraits d'origine.

## Réglage

`BepInEx\config\fr.fmimmersion.coachphoto.cfg` :

- `Active` : `false` = observation seule (le journal BepInEx liste les gros plans sans rien changer).
- `Photo` : chemin de la photo (PNG carré de 256 px recadré dans FM Immersion). Par défaut `<Dossier d'Archivix Bridge>\photo-coach.png`.
- `Manager` : identifiant du manager à remplacer, `0` = tous les managers humains.

## Installation (test)

Copier `FMImmersion.CoachPhoto.dll` dans `BepInEx\plugins\FMImmersion\`, FM27 fermé. Pour le retirer, supprimer ce
dossier.

## Compilation

Contre les DLL d'interop générées par BepInEx dans le dossier du jeu (elles ne sont jamais versionnées) :

```
dotnet build -c Release -p:FMDir="G:\Steam\steamapps\common\Football Manager 27"
```
