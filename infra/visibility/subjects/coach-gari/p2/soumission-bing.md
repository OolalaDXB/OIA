# Soumission de coachgari28.com à Bing · préparée, rien d'envoyé

Préparée le 2026-11-16 (recommandation `rec-cg-bing-index`, TECH_FIX). **Rien n'est soumis avant l'accord de Mickaël**, et rien ne modifie le site ni le dépôt CoachGari.

## Constat

- Recherche publique Bing du 2026-11-10 : aucune page du domaine (`site:coachgari28.com`, `"coachgari28.com"`) ; détail dans `~/oia-visibility-data/j0/constats/bing-2026-11-10.md`. Indicatif : l'état réel est dans Bing Webmaster Tools, que Mickaël vérifie.
- ChatGPT, dont la recherche web s'appuie sur Bing, n'a jamais cité coachgari28.com pendant J0.
- Relevé du 2026-11-16 (lecture seule) : `robots.txt` autorise tout sauf `/admin`, `/r/`, `/c/`, et déclare le plan du site ; la page d'accueil répond 200 à l'agent `bingbot`.

## Ce qui sera soumis

Plan du site : `https://coachgari28.com/sitemap.xml` (7 adresses) :

```
https://coachgari28.com/
https://coachgari28.com/padel-coaching-dubai
https://coachgari28.com/personal-training-dubai
https://coachgari28.com/online-coaching
https://coachgari28.com/corporate-wellness-dubai
https://coachgari28.com/legal
https://coachgari28.com/privacy
```

## Trois voies, par Mickaël, dans cet ordre

1. **Bing Webmaster Tools**, connexion par Mickaël : ajouter le site par **import depuis Google Search Console** (aucune vérification à poser sur le site, donc aucune modification du site) ; sinon, vérification par enregistrement DNS (CNAME), toujours sans toucher au site. Puis **Sitemaps → Soumettre** `https://coachgari28.com/sitemap.xml`, et **Inspection d'URL → Demander l'indexation** pour la page d'accueil et les quatre pages de service.
2. **Soumission d'URL** dans Bing Webmaster Tools (quota quotidien) pour les 7 adresses ci-dessus, si l'indexation tarde après le plan du site.
3. **IndexNow** : exige un fichier de clé à la racine du site (`https://coachgari28.com/<clé>.txt`, absent aujourd'hui) ; c'est une modification du site, donc **hors de ce mandat** : à décider par Mickaël et à faire dans le dépôt CoachGari, hors gel. Requête prête, à n'envoyer qu'après la publication de la clé :

```
POST https://api.indexnow.org/indexnow
Content-Type: application/json; charset=utf-8

{"host":"coachgari28.com","key":"<clé>","keyLocation":"https://coachgari28.com/<clé>.txt",
 "urlList":["https://coachgari28.com/","https://coachgari28.com/padel-coaching-dubai",
 "https://coachgari28.com/personal-training-dubai","https://coachgari28.com/online-coaching",
 "https://coachgari28.com/corporate-wellness-dubai"]}
```

## À consigner une fois fait

Dans `recommendations.yaml`, sous `rec-cg-bing-index` : `decision` (accepted, par Mickaël, date) puis `execution` (`executedAt`, `proof` : capture ou URL de Bing Webmaster Tools, `declaredBy: Mickaël`, `measuredBy: j1`). Aucune fenêtre n'est en cours : la soumission n'enfreint aucun gel ; elle sera mesurée par J1.
