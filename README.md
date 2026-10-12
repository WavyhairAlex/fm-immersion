# Simloom

Le compagnon de tes parties de jeux de gestion : un seul tableau de bord pour suivre toutes tes parties,
plus besoin de 36 feuilles Excel.

Modules prévus : Transport Fever 3, Planet Zoo 2, puis Football Manager.

> Simloom est un projet indépendant, sans lien avec les éditeurs des jeux cités.

## Démarrer en local

Prérequis : Node 22, pnpm 9, Docker.

```bash
cp .env.example .env            # renseigner AUTH_SECRET : openssl rand -hex 32
docker compose up -d            # Postgres + Mailpit
pnpm install
pnpm db:migrate
pnpm dev
```

- Front : http://localhost:5173
- API : http://localhost:3001/health
- Emails reçus (codes de connexion) : http://localhost:8025

Voir [CLAUDE.md](./CLAUDE.md) pour l'architecture et les conventions.
