# Simloom — contexte pour Claude Code

Simloom est une plateforme web gratuite : le **tableau de bord personnel des jeux de gestion** d'un joueur.
On remplace les « 36 feuilles Excel » qu'on tient à côté de ses parties par un cockpit unique, avec un module par jeu.
Projet loisir, publié à titre personnel (pas via une société), financé par dons (Buy Me a Coffee).

Le cadrage complet est dans le document « Simloom — Cadrage » (Claude Docs). Ce fichier en reprend l'essentiel pour le code.

## Feuille de route

1. Socle : comptes, parties (saves), tableau de bord. ← on est ici
2. Modules **Transport Fever 3** (`modules/tf3`) et **Planet Zoo 2** (`modules/pz2`).
3. Module **Football Manager** (`fm`) en novembre/décembre (sortie du jeu le 10 novembre).
4. Plus tard, en option : lecture des fichiers de sauvegarde **dans le navigateur** (Rust → WASM), jamais côté serveur.

## Architecture

Monorepo pnpm + Turborepo, même pile que Caelio.

| Dossier | Rôle |
|---|---|
| `apps/api` | API Fastify 5 (TypeScript), sous `/api/v1` |
| `apps/web` | Front React 18 + Vite + Tailwind, TanStack Query (données serveur), Zustand (état d'interface), i18next FR/EN |
| `packages/shared` | Schémas zod, types partagés, liste des jeux, contrat des modules |
| `packages/db` | Schéma Drizzle (PostgreSQL 16), migrations, client |
| `modules/<jeu>` | Un module par jeu : manifeste, routes, tables, carte de tableau de bord |
| `brand/source` | Sources de l'identité (PNG mascottes, SVG logo) — ne pas servir directement |

### Contrat d'un module
Défini dans `packages/shared/src/module.ts` (`GameModuleManifest`, `GameModuleServer`). Chaque module :
- a son propre schéma Postgres (`pgSchema('<id>')`), le socle vit dans `core` ;
- fournit une **carte de tableau de bord** qui montre des **alertes actionnables**, pas des totaux
  (« 3 lignes déficitaires », pas « 42 lignes ») ;
- déclare les versions du jeu prises en charge.

## Comptes et sécurité

- **Email uniquement, sans mot de passe** : code à 6 chiffres envoyé par mail, valable 10 min, usage unique,
  5 essais max, 5 codes/heure/adresse, limitation par IP. Pas de connexion Steam, pas de mot de passe.
- Codes stockés en **HMAC(AUTH_SECRET, email:code)**, jetons de session stockés en **SHA-256** : rien en clair en base.
- Session : cookie `simloom_session` httpOnly, Secure en prod, SameSite=Lax, 30 jours glissants.
  L'utilisateur peut lister et révoquer ses appareils (`/auth/sessions`).
- CSRF : SameSite + refus des écritures dont l'en-tête `Origin` ≠ `WEB_ORIGIN`.
- `/auth/request-code` répond **toujours 204** (ne pas révéler si un compte existe).
- **Les parties sont privées** : toute requête sur `saves` (et les tables des modules) filtre par `user_id`.
- Pas de mode invité : une **démo par module** avec des données fictives (non sauvegardées, remises à zéro au rechargement).

## Emails
Nodemailer. Local : Mailpit (docker compose, interface sur http://localhost:8025). Prod : Scaleway Transactional Email
depuis `noreply@simloom.app` (SPF/DKIM/DMARC). Contact humain : `contact@simloom.app` (Zimbra OVH).

## Hébergement
VPS OVH dédié (séparé de Caelio : dépôt, secrets et bucket distincts), Postgres sur la machine,
sauvegardes `pg_dump` vers OVH Object Storage. Domaine principal `simloom.app`.

## Identité visuelle — règles strictes
- **Rester loin d'Amazon** : aucune courbe orange sous le mot, **pas d'orange dans le logo ni dans l'interface**.
- Logo : vrai SVG (`apps/web/public/brand/logo.svg`), fil vert `#2FA88A`, point du i = pelote, « oo » remplacé par un infini incliné.
- Mascotte (esprit à capuche, besace, fil) : illustrations **PNG/WebP**, jamais vectorisées.
- Palette (tokens Tailwind) :
  - `canard` #0F4B58 — texte principal, fonds sombres
  - `eau` #63D1B1 / `eau-soutenu` #2FA88A — fil du logo, boutons (principal : soutenu + texte blanc ; secondaire : eau + texte canard)
  - `ambre` #FFB347 — **illustrations et pastilles d'alerte uniquement**
  - `corail` #FF6B6B — erreurs, suppression
  - `creme` #F7EFE3 — fond
  - `brun` #8B5E3C — texte secondaire
  - Le texte est toujours en canard ou brun.
- Polices auto-hébergées (`@fontsource`, RGPD) : **Fraunces** pour les titres, **Nunito** pour le texte.
- Jeux : toujours écrire « pour <Jeu> », mention de non-affiliation, **aucun logo ni visuel des jeux**.

## Conventions
- Interface et textes : **français et anglais dès le départ**. Aucune chaîne en dur dans les composants :
  tout passe par `apps/web/src/i18n/{fr,en}.json` (mêmes clés dans les deux).
- Commentaires et messages de commit en français.
- Validation des entrées avec les schémas zod de `@simloom/shared`, côté API comme côté front.
- Imports internes sans extension (`./games`, pas `./games.js`) : résolution `Bundler`, build API par tsup.
- Pas de données de jeu propriétaires dans le dépôt.

## Commandes
```bash
cp .env.example .env          # puis renseigner AUTH_SECRET (openssl rand -hex 32)
docker compose up -d          # Postgres 16 + Mailpit
pnpm install
pnpm db:migrate               # applique les migrations Drizzle
pnpm dev                      # API :3001 + front :5173 (proxy /api)
pnpm typecheck && pnpm test && pnpm build
pnpm db:generate              # après modification du schéma
```
