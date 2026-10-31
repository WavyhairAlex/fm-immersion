# Simloom — contexte pour Claude Code

Simloom est une **application de bureau Windows gratuite et open source (MIT)** : le tableau de bord personnel
des jeux de gestion d'un joueur. On remplace les « 36 feuilles Excel » qu'on tient à côté de ses parties par
un cockpit unique, avec un module par jeu. Projet loisir, publié à titre personnel, financé par dons (Buy Me a Coffee).

Le cadrage complet est dans le document « Simloom — Cadrage » (Claude Docs). Ce fichier en reprend l'essentiel pour le code.

## Choix structurants

- **Appli de bureau, pas de site web** : aucun serveur à payer ni à maintenir. (Une première version web avec
  comptes et API a été abandonnée en octobre 2026 pour cette raison.)
- **Tout est local** : pas de compte, pas de connexion, aucune donnée envoyée. Les parties sont dans une base
  SQLite sur le PC (`%APPDATA%\app.simloom.desktop\simloom.db`). Les seules requêtes réseau vont vers GitHub
  Releases : la recherche de mise à jour au démarrage, et, à la demande du joueur, le téléchargement du plugin FM27
  (`modules/fm/bridge`, vérifié par SHA-256, voir son README).
- **Mises à jour automatiques** au lancement (`UpdateGate`) via `tauri-plugin-updater`. Les fichiers de mise à
  jour sont signés avec une clé minisign (secret GitHub `TAURI_SIGNING_PRIVATE_KEY`, clé publique dans
  `tauri.conf.json`). **Perdre cette clé = plus aucune mise à jour possible pour les installations existantes.**
- **Signature Windows** : visée via SignPath Foundation (gratuit pour l'open source). Conditions : licence OSI,
  build entièrement fait par la CI depuis le dépôt, approbation manuelle de chaque release, pas de composant
  propriétaire, réputation vérifiable avant candidature, section « Code signing policy » et déclaration de
  confidentialité (dans le README). Tant que ce n'est pas accepté, l'installeur n'est pas signé.
- **Lecture des sauvegardes** des jeux : côté Rust, en local. Jamais d'envoi des fichiers.
- Windows uniquement pour l'instant (Tauri permettra macOS plus tard).

## Feuille de route

1. Socle : appli Tauri, base locale, parties, mise à jour automatique, release Windows. ← on est ici
2. Modules **Transport Fever 3** (`modules/tf3`) et **Planet Zoo 2** (`modules/pz2`).
3. Module **Football Manager** (`fm`) en novembre/décembre (sortie du jeu le 10 novembre).
4. Lecture des fichiers de sauvegarde (Rust), puis candidature SignPath une fois des utilisateurs réels.

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
| `brand/source` | Sources de l'identité (PNG mascottes, SVG logo) — ne pas embarquer directement |

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
`src-tauri/Cargo.toml`, fusion sur main (la CI crée le tag et le brouillon dans amnesix-nt/simloom),
puis publication manuelle du brouillon de release.

## Identité visuelle — règles strictes
- **Rester loin d'Amazon** : aucune courbe orange sous le mot, **pas d'orange dans le logo ni dans l'interface**.
- Logo : vrai SVG (`apps/desktop/public/brand/logo.svg`), fil vert `#2FA88A`, point du i = pelote, « oo » remplacé par un infini incliné.
- Mascotte (esprit à capuche, besace, fil) : illustrations **PNG/WebP**, jamais vectorisées.
- Palette (tokens Tailwind) :
  - `canard` #0F4B58 — texte principal, fonds sombres
  - `eau` #63D1B1 — boutons secondaires (texte canard, 5,2) ; `eau-soutenu` #2FA88A — fil du logo uniquement (texte blanc dessus : 2,96, interdit)
  - `eau-fonce` #1B7F67 — boutons principaux, texte blanc (4,9)
  - `ambre` #FFB347 — **illustrations et pastilles d'alerte uniquement**
  - `corail` #FF6B6B — erreurs, suppression
  - `creme` #F7EFE3 — fond
  - `brun` #8B5E3C — texte secondaire
  - Le texte est toujours en canard ou brun.
- Polices embarquées (`@fontsource`) : **Fraunces** pour les titres, **Nunito** pour le texte.
- Jeux : toujours écrire « pour <Jeu> », mention de non-affiliation, **aucun logo ni visuel des jeux**.

## Conventions
- Interface : **français et anglais dès le départ**. Aucune chaîne en dur dans les composants :
  tout passe par `apps/desktop/src/i18n/{fr,en}.json` (mêmes clés dans les deux).
- Commentaires et messages de commit en français.
- Validation des entrées avec les schémas zod de `@simloom/shared`.
- Imports internes sans extension (`./games`, pas `./games.js`).
- Pas de données de jeu propriétaires dans le dépôt, pas de dépendance propriétaire (condition SignPath).
- CSP stricte dans `tauri.conf.json` : aucun contenu distant dans la webview.

## Commandes
```bash
pnpm install
pnpm app                 # appli en mode développement (Vite + fenêtre Tauri)
pnpm typecheck && pnpm test && pnpm build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm db:generate         # après modification d'un schéma
pnpm app:bundle          # installeur local (sous Windows)
```
