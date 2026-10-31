# Simloom

Le compagnon de tes parties de jeux de gestion : un seul tableau de bord pour suivre toutes tes parties,
plus besoin de 36 feuilles Excel. Application Windows gratuite et open source.

Modules : Transport Fever 3 et Planet Zoo 2 (en cours), puis Football Manager.

> Simloom est un projet indépendant, sans lien avec les éditeurs des jeux cités.
> Les noms des jeux appartiennent à leurs propriétaires.

## Installer

Télécharge le dernier `Simloom_x.y.z_x64-setup.exe` dans les [releases](https://github.com/amnesix-nt/simloom/releases/latest).
L'installation se fait dans ton profil Windows, sans droits administrateur. Ensuite, Simloom se met à jour
tout seul au démarrage quand une nouvelle version est publiée.

Désinstaller : Paramètres Windows › Applications › Simloom › Désinstaller.
Tes données sont dans `%APPDATA%\app.simloom.desktop\simloom.db` : supprime ce dossier pour tout effacer.

## Confidentialité

Simloom ne collecte, ne stocke à distance ni n'envoie aucune donnée personnelle. Tes parties restent dans
une base SQLite sur ton PC. Simloom ne se connecte qu'à GitHub (`github.com/amnesix-nt/simloom/releases`) :
pour chercher ses mises à jour au démarrage et, seulement si tu le demandes, pour télécharger le plugin FM27.
GitHub voit alors ton adresse IP, comme pour toute visite de son site.

## Politique de signature du code

Les versions publiées seront signées gratuitement grâce à SignPath, une fois le projet accepté par
la SignPath Foundation. La mention officielle sera alors :
*Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).*

Seuls les binaires construits par GitHub Actions à partir de ce dépôt sont signés, et chaque signature
est approuvée manuellement. Le plugin FM27 (`modules/fm/bridge`) n'en fait pas partie : il se compile contre des
fichiers du jeu qui ne peuvent pas être publiés, il est donc compilé en local et distribué à part, non signé,
avec une empreinte SHA-256 vérifiée par Simloom avant installation.

| Rôle | Membres |
|---|---|
| Auteurs (committers) | [@amnesix-nt](https://github.com/amnesix-nt) |
| Relecteurs | [@amnesix-nt](https://github.com/amnesix-nt) |
| Approbateurs | [@amnesix-nt](https://github.com/amnesix-nt) |

## Développer

Prérequis : Node 22, pnpm 9 (`corepack enable`), Rust stable, et sous Windows WebView2 (déjà présent sur Windows 10/11).

```bash
pnpm install
pnpm app            # lance l'application en mode développement
pnpm test           # tests TypeScript
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml   # tests Rust
```

Voir [CLAUDE.md](./CLAUDE.md) pour l'architecture et les conventions.

## Licence

[MIT](./LICENSE)
