# Image de l'ordonnanceur et du collecteur d'OIA Visibility (mandat v15, bloc F), PRÉPARÉE :
# rien n'est construit ni déployé sans Mickaël. Construite depuis la racine du dépôt :
#   docker build -f infra/visibility/deploy/Dockerfile -t oia-visibility .
# Aucune clé dans l'image : elles arrivent en variables d'environnement au lancement
# (fichier d'environnement du serveur, droits 600, hors image et hors dépôt).
# Données (sujets privés, preuves, journaux) : volume /data, sauvegardé à part.
FROM node:24-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production \
    OIA_VIS_DATA=/data OIA_VIS_SUBJECTS_DIR=/data/sujets
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
 && apt-get update && apt-get install -y --no-install-recommends ca-certificates bash && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY infra/visibility/package.json infra/visibility/
COPY packages/providers/package.json packages/providers/
RUN pnpm install --frozen-lockfile --filter ./infra/visibility... --ignore-scripts
COPY infra/visibility/src infra/visibility/src
COPY infra/visibility/scripts infra/visibility/scripts
COPY infra/visibility/schemas infra/visibility/schemas
COPY infra/visibility/humans.yaml infra/visibility/tsconfig.json infra/visibility/
COPY packages/providers packages/providers
# Utilisateur sans privilège ; aucun port exposé (le processus ne sert rien, il collecte).
RUN useradd --system --uid 10001 oia && mkdir -p /data && chown oia /data
USER oia
WORKDIR /app/infra/visibility
# Un passage par jour, lancé par le planificateur de l'hôte (timer systemd) ou du service
# géré ; --go n'est ajouté qu'après la décision de Mickaël.
ENTRYPOINT ["node_modules/.bin/tsx", "src/scheduler.ts"]
