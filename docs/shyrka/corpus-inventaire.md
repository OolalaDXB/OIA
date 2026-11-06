# Shyrka – Inventaire du corpus

7 novembre 2026 · Mickaël Thomas

> Référence : `docs/shyrka/corpus-inventaire.md` dans le repo OolalaDXB/OIA. Le Claude Doc du même nom en est une copie de lecture.

Tout ce qui peut apprendre à Shyrka comment tu penses, classé en quatre paliers, du plus utile et du moins sensible au plus délicat.

## Les règles du tri

Rien n'entre dans le corpus sans passer par trois états : brut, extrait, validé.

- **Brut** : l'export tel qu'il arrive, archivé en lecture seule dans le volume chiffré. Il ne sert qu'à retrouver une source.
- **Extrait** : les règles, décisions, méthodes et formules tirées du brut, au statut « à valider ».
- **Validé** : ce que tu as relu et gardé. Seul cet état alimente Shyrka.

Quatre règles s'appliquent avant tout import :

1. **Swift reste dehors** : ni e-mails, ni fichiers, ni messages professionnels de ton employeur, à trier avant l'import, pas après.
2. **Les tiers sont protégés** : on garde ta façon de répondre, pas la vie de tes interlocuteurs ; les noms et détails personnels des autres sont retirés à l'extraction.
3. **Le local d'abord** : le brut ne quitte jamais le Mac ; seuls des extraits choisis peuvent être confiés à un modèle en ligne, avec ton accord.
4. **Aucun secret** : mots de passe, numéros de compte et pièces d'identité n'entrent dans aucun état du corpus.

## Palier 1 · Maintenant : tes échanges avec les IA

C'est la source la plus riche et la moins sensible : tes raisonnements, tes arbitrages et tes décisions y sont déjà écrits. Les exports mettent souvent quelques heures à quelques jours : demande-les tous maintenant, sans les traiter.

| Élément | Où l'obtenir | Ce qu'on en garde |
| --- | --- | --- |
| Conversations ChatGPT | Réglages, contrôles des données, export ; lien envoyé par e-mail | Décisions, arbitrages, méthodes, corrections que tu as faites |
| Conversations Claude | Réglages, confidentialité, export des données | Même chose, plus les documents de cadrage |
| Conversations Gemini | Google Takeout, activité des applications Gemini | Même chose |
| Conversations Grok | Réglages de données du compte | Même chose |
| Autres assistants (Perplexity, DeepSeek, Le Chat) | Export depuis leurs réglages s'il existe, sinon copie des fils importants | Seulement les échanges qui portent une décision |
| Mémoires enregistrées des assistants | Pages « mémoire » de ChatGPT et de Claude | Faits déjà condensés sur toi, à relire en premier |

Les chemins d'export changent régulièrement : vérifie-les dans chaque service. Les conversations qui touchent à Swift seront retirées à l'extraction.

## Palier 2 · À la mémoire Souffleur : tes écrits de travail

Ce palier s'importe quand la mémoire Souffleur (P5) existe. D'ici là, il suffit de savoir où chaque élément se trouve.

| Élément | Où il se trouve | Ce qu'on en garde |
| --- | --- | --- |
| Roadmaps, mandats, cadrages | Dépôts GitHub (`docs/`), Claude Docs | Tes décisions datées et leurs raisons |
| ADR, README, spécifications | Dépôts GitHub, la documentation seulement, pas le code | Ta manière de structurer un produit |
| Présentations et propositions commerciales | Ton Mac, tes documents personnels | Ton argumentaire, tes prix et leurs principes |
| CV et profils professionnels | Fichiers CV, export des données LinkedIn | Ton parcours, raconté comme tu veux qu'il le soit |
| Notes personnelles | Notes Apple, autres carnets | Idées, listes, réflexions en cours |
| Fichiers OneDrive personnels | OneDrive, compte personnel uniquement | Après tri, ce qui relève de tes projets |
| Préférences et règles déjà écrites | Tes fichiers d'instructions pour les IA, ta mémoire Claude | Tes règles de style et de travail, déjà formulées |

Un OneDrive lié à Swift reste entièrement hors du corpus, même pour un document qui te semble personnel.

## Palier 3 · En parallèle : ce que tu expliques toi-même

C'est la source qui vaut le plus, parce que tu y donnes tes raisons. Elle commence dès que tu veux, indépendamment des autres paliers.

| Élément | Comment le produire | Ce qu'on en garde |
| --- | --- | --- |
| Les dix séances d'entretien | Selon `docs/shyrka/entretiens.md` | Règles, exemples, formules, paliers de réponse |
| Mémos vocaux spontanés | Deux minutes enregistrées quand une idée ou une décision te vient | La pensée sur le moment, avant qu'elle soit polie |
| Journal de décision | Une ligne par décision importante : quoi, pourquoi, ce que tu as écarté | Le lien entre tes choix et leurs résultats, plus tard |
| Réponses modèles | Tes meilleurs messages envoyés, choisis par toi, nettoyés des noms | Ton style réel, par canal et par langue |

## Palier 4 · Plus tard et trié : communications et souvenirs

Ces sources contiennent surtout la vie des autres. Elles n'entrent qu'après les trois premiers paliers, par morceaux choisis, jamais en bloc.

| Élément | Où l'obtenir | Ce qu'on en garde |
| --- | --- | --- |
| E-mails personnels | Google Takeout ou export de ta messagerie personnelle | Tes messages envoyés, pour ton style et tes décisions ; jamais le contenu reçu des autres |
| WhatsApp | Export conversation par conversation, sans les médias | Les conversations que tu choisis, pour la façon dont tu réponds |
| Messages LinkedIn | Export des données LinkedIn | Tes échanges professionnels hors Swift |
| SMS et iMessage | Sauvegarde du téléphone, extraction sélective | Seulement si un besoin précis apparaît |
| Agenda personnel | Export du calendrier | Tes rythmes et tes habitudes, pas le détail des rendez-vous |
| Photos | Photothèque | Dates, lieux, albums et légendes ; les images elles-mêmes restent hors du corpus |

Les souvenirs familiaux servent à ce que Shyrka connaisse ta vie, pas à ce qu'elle en parle : ils restent dans le périmètre global, jamais accessibles aux agents qui travaillent pour des clients.

## Ce qui reste exclu

Ces éléments n'entrent dans aucun état du corpus, pas même le brut.

| Exclu | Pourquoi |
| --- | --- |
| Tout ce qui vient de Swift : messagerie, Teams, OneDrive, documents, clients | Obligations de confidentialité envers ton employeur |
| Données des clients de tes projets | Elles appartiennent à tes clients, cloisonnées dans leurs propres espaces |
| Mots de passe, clés d'API, codes d'accès | Leur place est Proton Pass, jamais un corpus lisible par une IA |
| Numéros de compte, de carte, pièces d'identité | Un corpus volé ne doit rien permettre d'usurper |
| Images et vidéos de tes enfants | Leurs souvenirs leur appartiennent ; seules les métadonnées choisies peuvent entrer |

La santé et les finances personnelles n'entrent que sous forme de principes, si tu le décides, jamais sous forme de résultats, de montants ou de documents.

## Organisation du volume chiffré

Un seul volume, « Shyrka-corpus », rangé par état puis par source. Le brut n'est jamais modifié ; l'extrait et le validé citent toujours le fichier brut d'origine.

```
Shyrka-corpus/
  brut/
    ia/chatgpt/  ia/claude/  ia/gemini/  ia/grok/
    ecrits/      entretiens/  memos-vocaux/
    messages/    agenda/      photos-metadonnees/
  extrait/
    regles/  exemples/  formules/  decisions/
  valide/
    regles/  exemples/  formules/  decisions/
  journal/
    imports.md   retraits.md
```

`journal/imports.md` note chaque import (date, source, volume), et `journal/retraits.md` chaque suppression (motif seulement, jamais le contenu retiré).

## Premières actions

Ces actions ne demandent ni code ni dépense, et préparent les trois premiers paliers.

- [ ] Créer le volume chiffré « Shyrka-corpus » et ranger son mot de passe dans Proton Pass.
- [ ] Demander l'export des conversations ChatGPT.
- [ ] Demander l'export des conversations Claude.
- [ ] Demander l'export Gemini via Google Takeout.
- [ ] Demander l'export Grok.
- [ ] Copier les pages « mémoire » de ChatGPT et de Claude.
- [ ] Lister les autres assistants que tu as utilisés et ce qu'ils permettent d'exporter.
- [ ] Ranger chaque export dans `brut/ia/`, sans l'ouvrir ni le trier.
- [ ] Planifier les deux premières séances d'entretien.
- [ ] Commencer le journal de décision : une ligne par décision importante, dès cette semaine.
