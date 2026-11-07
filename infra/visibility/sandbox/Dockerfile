# oia-sandbox — image Crawlie confinée (S5 du mandat de correctifs).
#
# Rôle : exécuter `crawlie` dans un environnement où le réseau sortant
# refuse les plages privées / locales / de liaison. Crawlie suit lui-même
# les liens d'un site, donc même si l'URL de départ est publique, un
# serveur malveillant peut rediriger vers une IP interne (SSRF). Le
# conteneur ajoute une défense en profondeur côté réseau en plus de la
# fonction `safe-fetch` côté application.
#
# Usage, depuis infra/visibility :
#   docker build -t oia-sandbox -f sandbox/Dockerfile .
#   docker run --rm --network=oia-vis-egress-public oia-sandbox crawlie site https://example.com
#
# Le réseau `oia-vis-egress-public` est créé par le compose fragment
# `sandbox/compose.yaml` ; il publie uniquement la sortie vers les
# plages publiques (via les règles iptables de l'host Mac). Sur Docker
# Desktop Mac, la restriction stricte des plages privées sortantes se
# fait dans les paramètres du daemon. Voir README.md de ce dossier.

FROM node:20-bookworm-slim

# Crawlie dépend de @crawlseo/crawlie-darwin-arm64 côté Mac, et d'un
# binaire natif correspondant côté Linux ; on prend la version épinglée
# dans infra/visibility/package.json.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini dnsutils \
 && rm -rf /var/lib/apt/lists/*

# Non-root : le conteneur ne doit pas écrire hors /work.
RUN useradd --uid 1000 --create-home --shell /bin/bash oia
USER oia
WORKDIR /work

# Installe crawlie à la version épinglée.
RUN npm install --no-save --no-fund --no-audit crawlie@0.5.3

ENV CRAWLSEO_UPDATE_CHECK=false \
    DISABLE_TELEMETRY=1 \
    NODE_OPTIONS="--dns-result-order=verbatim"

ENTRYPOINT ["/usr/bin/tini", "--", "node_modules/.bin/crawlie"]
CMD ["--help"]
