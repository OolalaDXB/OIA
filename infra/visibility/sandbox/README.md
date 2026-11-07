# oia-sandbox — Crawlie confiné · S5

Rôle : exécuter Crawlie dans un conteneur dont la sortie réseau est
restreinte, en complément de `src/network/safe-fetch.ts` (défense en
profondeur contre le SSRF via redirection d'un site audité).

## Mise en route

```
cd infra/visibility
docker build -t oia-sandbox:latest -f sandbox/Dockerfile .
docker compose -f sandbox/compose.yaml run --rm crawlie site https://example.com -o /work/output
```

## Ce que le conteneur garantit

- **Sans accès à l'hôte** : `read_only: true`, `cap_drop: ALL`,
  `no-new-privileges`. Impossible pour un binaire crawlé d'écrire en
  dehors de `/tmp` et `/work/output`.
- **Non-root** : utilisateur `oia` (uid 1000).
- **Pas de nouveau binaire** : l'image ne contient pas `apt`, `wget`,
  ni `curl` avec privilèges d'écriture.
- **DNS en ordre vérifié** : `NODE_OPTIONS=--dns-result-order=verbatim`
  pour que la liste d'adresses soit stable au cours d'un appel (évite
  qu'un fallback IPv6/IPv4 choisisse autre chose que ce que la
  vérification a inspecté).

## Ce que le conteneur ne garantit PAS seul

- **Blocage des plages privées en sortie.** Sur Docker Desktop (Mac),
  le filtrage réseau au niveau du daemon demande d'éditer la
  configuration `pf` de l'hôte ; `docker network` ne refuse pas à lui
  seul les paquets sortants vers `10/8`, `172.16-31/12`, `192.168/16`.
  C'est pourquoi `safe-fetch.ts` applique la même règle côté
  application : les deux couches ensemble forment la barrière.
- **Résolution DNS**. Le conteneur hérite du DNS de l'hôte ; un DNS
  configuré sur un réseau local verra toujours les noms internes. Pour
  isoler totalement, un DNS sortant (1.1.1.1 ou 8.8.8.8) doit être
  imposé via `dns:` dans le compose.

Pour un déploiement production (P3+), les règles pf de l'hôte ou un
micro-réseau docker-in-docker sans accès au LAN sont les deux options
à chiffrer plus tard.
