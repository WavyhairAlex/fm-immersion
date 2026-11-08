# FM Immersion — contexte pour Claude Code

FM Immersion est une **application de bureau Windows gratuite et open source (MIT)** dédiée à Football Manager 27 :
visages photoréalistes, assistant FM Coach, plugin en jeu, et plus tard gazette, live Discord et monde partagé.
Projet loisir, publié à titre personnel. Il est né le 06/11/2026 de la partie FM de **Simloom** (dépôt Archivix),
extraite avec son historique ; Simloom garde Planet Zoo 2 et Transport Fever 3.

## Choix structurants

- **Appli de bureau, pas de site web** : aucun serveur à payer ni à maintenir. (Une première version web avec
  comptes et API a été abandonnée en octobre 2026 pour cette raison.)
- **Tout est local** : pas de compte, pas de connexion, aucune donnée envoyée. Les parties sont dans une base
  SQLite sur le PC (`%APPDATA%\app.fmimmersion.desktop\fm-immersion.db`). Les seules requêtes réseau vont vers GitHub
  Releases : la recherche de mise à jour au démarrage, et, à la demande du joueur, le téléchargement du plugin FM27
  (`modules/fm/bridge`, vérifié par SHA-256, voir son README).
  Exception choisie par le joueur : le **Live Discord** envoie une gazette à son salon par le lien webhook qu'il a
  collé (`src-tauri/src/discord.rs`, seulement vers `discord.com/api/webhooks/`, seulement sur son clic), et un certificat de
  défi joint (`modules/fm/src/challenges.ts`, mode Défis) quand il clique sur « Partager sur Discord ».
  Autre exception choisie par le joueur : la **rédaction par IA** (`src-tauri/src/ai.rs`, `src/lib/ai.ts`), coupée par
  défaut : Ollama local (`127.0.0.1:11434`) ou sa clé API (Mistral, Anthropic, Google, adresses fixes ; clé dans le
  coffre Windows via `keyring`). L'IA ne reçoit que les faits déjà calculés et l'appli vérifie sa réponse (chiffres,
  scores) ; sinon les phrases toutes faites restent. Textes gardés dans `fm_gazette_writing`.
- **Mises à jour automatiques** au lancement (`UpdateGate`) via `tauri-plugin-updater`. Les fichiers de mise à
  jour sont signés avec une clé minisign (secret GitHub `TAURI_SIGNING_PRIVATE_KEY`, clé publique dans
  `tauri.conf.json`). **Perdre cette clé = plus aucune mise à jour possible pour les installations existantes.**
- **Signature Windows** : visée via SignPath Foundation (gratuit pour l'open source). Conditions : licence OSI,
  build entièrement fait par la CI depuis le dépôt, approbation manuelle de chaque release, pas de composant
  propriétaire, réputation vérifiable avant candidature, section « Code signing policy » et déclaration de
  confidentialité (dans le README). Tant que ce n'est pas accepté, l'installeur n'est pas signé.
- **Lecture des sauvegardes** des jeux : côté Rust, en local. Jamais d'envoi des fichiers.
- **FM27, lecture directe en mémoire** (`src-tauri/src/fm_memory.rs`) : FM Immersion ouvre `fm.exe` en lecture seule
  (`PROCESS_VM_READ`) et lit la base native de `game_plugin.dll`, seulement sur action du joueur (bouton, ou option « Lire le CA/PA » qu'il coche : une lecture de l'effectif par date de jeu). Jamais d'écriture
  ni d'injection. Adresses issues de notre propre analyse hors jeu (rien repris de FM27 Live Editor, dont la licence
  interdit l'analyse) ; points d'entrée retrouvés par motifs dans le fichier du module.
- Windows uniquement pour l'instant (Tauri permettra macOS plus tard).
- Mention de non-affiliation partout : « projet indépendant, sans lien avec Sports Interactive ni SEGA ».

## Feuille de route

1. Socle repris de Simloom : appli Tauri, base locale, FM Coach, plugin, mise à jour automatique. ← on est ici
2. Module **Visages photoréalistes** : installation en un clic du pack (bundle + correction du CRC dans le catalogue
   Addressables), désinstallation, détection d'une mise à jour Steam (remplace les .bat du dépôt
   FM27-Photorealistic-Faces).
3. **Gazette** de la semaine (`modules/fm/src/gazette.ts`, brèves calculées à partir des instantanés) et **Live Discord**
   solo (webhook) : première version faite ; ensuite envoi automatique des moments forts, puis bot sur le serveur.
4. **Monde partagé** (multijoueur asynchrone, journal sur le serveur).

## Architecture

Monorepo pnpm + Turborepo.

| Dossier | Rôle |
|---|---|
| `apps/desktop` | Interface React 18 + Vite + Tailwind, TanStack Query, Zustand, i18next FR/EN |
| `apps/desktop/src-tauri` | Cœur Rust Tauri 2 : fenêtre, base SQLite (rusqlite), mise à jour, futur lecteur de sauvegardes |
| `apps/desktop/src-tauri/migrations` | Migrations SQL générées par drizzle-kit, embarquées dans l'exe par `build.rs` |
| `packages/db` | Schéma Drizzle (dialecte SQLite) du socle ; les modules ajoutent le leur |
| `packages/shared` | Schémas zod, types partagés, liste des jeux, contrat des modules |
| `modules/<jeu>` | Un module par jeu : manifeste, `src/schema.ts` (tables préfixées `<jeu>_`), carte de tableau de bord |
| `site` | Site vitrine statique (HTML/CSS, sans script ni contenu distant), publié sur GitHub Pages par `.github/workflows/site.yml` |
| `brand/source` | Source de l'icône (SVG) ; les icônes de `src-tauri/icons` en sont tirées avec `pnpm tauri icon` |

### Accès aux données
- Les requêtes sont écrites en TypeScript avec Drizzle (`drizzle-orm/sqlite-proxy`, `src/lib/db.ts`) et
  exécutées par Rust (`db_query`, `db_batch` dans `src-tauri/src/db.rs`), qui renvoie les lignes en tableaux.
- Modifier un schéma : éditer `packages/db/src/schema/*.ts` ou `modules/<jeu>/src/schema.ts`, puis
  `pnpm db:generate`. **Ne jamais modifier ni renommer une migration déjà publiée** : l'ordre des fichiers
  et `PRAGMA user_version` déterminent ce qui est appliqué chez les joueurs.
- Dates en texte ISO 8601, identifiants en UUID texte, JSON en texte (`mode: 'json'`).
- Tests : `apps/desktop/test` rejoue les migrations et les requêtes Drizzle sur `node:sqlite` avec le même
  protocole que Rust ; `cargo test` couvre l'exécution réelle.

### Contrat d'un module
Défini dans `packages/shared/src/module.ts` (`GameModuleManifest`, `GameModule`). Chaque module :
- a ses tables SQLite préfixées par l'id du jeu, qui référencent `saves.id` ;
- fournit une **carte de tableau de bord** qui montre des **alertes actionnables**, pas des totaux
  (« 3 lignes déficitaires », pas « 42 lignes ») ;
- déclare les versions du jeu prises en charge.

## Publier une version
Voir l'en-tête de `.github/workflows/release.yml` : version dans `apps/desktop/package.json` **et**
`src-tauri/Cargo.toml`, fusion sur main : la CI crée le tag et la release dans ce dépôt,
la publie et la marque « Latest » une fois latest.json envoyé. Plus de publication manuelle.

## Identité visuelle (choix du 06/11/2026)
- **Anthracite et orange**, les couleurs d'Amnesix. Toujours lisible : texte anthracite sur fond clair, texte blanc
  sur anthracite ou sur orange foncé, jamais de texte blanc sur l'orange vif.
- Mise en page (refonte du 07/11/2026, 0.1.48) : **une seule barre latérale** anthracite (`src/components/Sidebar.tsx`).
  En haut, la **carte de carrière** : la partie FM suivie par toute l'appli (`src/lib/career.ts`, choisie une fois),
  la photo du coach (choisie par le joueur), le club et la date de jeu. Puis trois groupes : *Mon club* (les écrans
  de FM Coach à plat, `src/lib/club-nav.ts`, routes `/club/:vue`), *Ma carrière racontée* (Gazette, Live Discord,
  Défis), *Le jeu* (Visages, Plugin et réglages, Monde partagé). L'accueil « Aujourd'hui » (`/`) montre le briefing
  de l'adjoint et un cadre par mode. La lecture du plugin tourne pour toute l'appli (`src/lib/fm-sync.ts`).
  Visages reste utilisable sans carrière.
- Les jetons Tailwind gardent leurs noms hérités de Simloom pour ne pas réécrire les écrans :
  - `canard` #25282D — anthracite : texte principal, fonds sombres, barre latérale
  - `orange` #F26B1D — marque : liserés, sélection, logo ; `orange-fonce` #C2410C — boutons principaux et liens (texte blanc : 5,2) ;
    `orange-clair` #FFE4D3 — boutons secondaires et pastilles (texte anthracite)
  - `eau` / `eau-soutenu` / `eau-fonce` — vert des états « bon / OK » uniquement
  - `ambre` #F5B700 — alertes ; `corail` #D93C3C — erreurs, suppression
  - `creme` #F2F2F0 — fond ; `brun` #5C6067 — texte secondaire
- Polices embarquées (`@fontsource`) : **Fraunces** pour les titres, **Nunito** pour le texte.
- Jeux : mention de non-affiliation, **aucun logo ni visuel du jeu**. La mascotte Simloom n'est plus affichée.

## Conventions
- Interface : **français et anglais dès le départ**. Aucune chaîne en dur dans les composants :
  tout passe par `apps/desktop/src/i18n/{fr,en}.json` (mêmes clés dans les deux).
- Commentaires et messages de commit en français.
- Validation des entrées avec les schémas zod de `@fm-immersion/shared`.
- Imports internes sans extension (`./games`, pas `./games.js`).
- Pas de données de jeu propriétaires dans le dépôt, pas de dépendance propriétaire (condition SignPath).
- CSP stricte dans `tauri.conf.json` : aucun contenu distant dans la webview. Seule souplesse :
  `style-src-attr 'unsafe-inline'` ; aucun script en ligne.

## Héritage de Simloom
- Les migrations SQL publiées par Simloom sont gardées telles quelles (elles créent aussi des tables `pz2_`/`tf3_`
  inutilisées) : ne pas les modifier, ajouter les suivantes après.
- Le fichier local `simloom-roles.json` (dossier du plugin) garde son nom pour rester compatible.

## Commandes
```bash
pnpm install
pnpm app                 # appli en mode développement (Vite + fenêtre Tauri)
pnpm typecheck && pnpm test && pnpm build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm db:generate         # après modification d'un schéma
pnpm app:bundle          # installeur local (sous Windows)
```
