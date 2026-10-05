# TED discovery run (multi-project)

## Per project
- **bawaba** — OK · 100 biddable of 100 retrieved
  - query: `classification-cpv IN (72212190 72224100 72226000 72254000 72600000 48218000 79417000) AND buyer-country IN (FRA LUX BEL DEU) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **beau** — OK · 11 biddable of 11 retrieved
  - query: `classification-cpv IN (48812000 66170000 72212443 72212190) AND buyer-country IN (FRA LUX) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **lesvieillespierres** — OK · 64 biddable of 64 retrieved
  - query: `classification-cpv IN (92522000 92521000 45212350 79952000) AND buyer-country IN (FRA) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **ludography** — OK · 85 biddable of 85 retrieved
  - query: `classification-cpv IN (48520000 92312000 79822500 92500000) AND buyer-country IN (FRA) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **maisons-co** — ERROR: TED search HTTP 429: <html>
<head><title>429 Too Many Requests</title></head>
<body>
<center><h1>429 Too Many Requests</h1></center>
<hr><center>nginx/1.31.4</center>
</body>
</html>

  - query: `classification-cpv IN (72212517 48812000 55100000 70330000) AND buyer-country IN (FRA) AND publication-date>=20260707`
- **myoolala** — OK · 11 biddable of 11 retrieved
  - query: `classification-cpv IN (72212517 48219700 72413000 72212224) AND buyer-country IN (FRA) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **padel-design** — OK · 100 biddable of 100 retrieved
  - query: `classification-cpv IN (71241000 79314000 79419000 92600000) AND buyer-country IN (ESP FRA ITA PRT BEL NLD DEU SWE) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **rls-guard** — OK · 77 biddable of 77 retrieved
  - query: `classification-cpv IN (72212730 79417000 72267000 48218000) AND buyer-country IN (FRA LUX BEL) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`
- **sillon** — OK · 42 biddable of 64 retrieved (22 set aside: qualification systems, corrigenda, award notices)
  - query: `classification-cpv IN (48451000 72212450 72212443 48812000 92500000) AND buyer-country IN (FRA) AND publication-date>=20260707`
- **thestudio-mt** — OK · 100 biddable of 100 retrieved
  - query: `classification-cpv IN (72212517 72230000 72267000 72413000 79421000 72224000) AND buyer-country IN (FRA LUX BEL) AND publication-date>=20260707 AND notice-type IN (cn-standard cn-social)`

- unique notices across projects: 433
- matchable text per record (the S2 measure): median 1600 characters over 20 record(s)
- candidates processed (cap 25): 25
- qualified at MANUAL_REVIEW_REQUIRED: 20
- notice-page fetch failures: 5

## Candidates (each with official source URL)
- **466007-2026** — France – Computer-related services – Prestation d'infogérance et d'Hébergement : La présente consultation concerne la 1ère phase : présélection de 5 candidats admis à soumissionner
  - source: https://ted.europa.eu/en/notice/466007-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **467100-2026** — France – Computer back-up services – PRESTATIONS D'ASSISTANCE ET D'EXPERTISE INFORMATIQUE
  - source: https://ted.europa.eu/en/notice/467100-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **471799-2026** — France – Technical computer support services – AOO Prestation de développement pour la refonte du Système d’Information de l’US10-CépiDC Inserm
  - source: https://ted.europa.eu/en/notice/471799-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **478020-2026** — France – License management software package – Groupement de commandes pour l'externalisation des outils de communication interne
  - source: https://ted.europa.eu/en/notice/478020-2026/html
  - discovered for: bawaba, rls-guard
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **480676-2026** — France – Health and safety consultancy services – Mission de Coordination SPS de Niveau 1 pour la desserte du Môle Central - RP 541 et RP 539
  - source: https://ted.europa.eu/en/notice/480676-2026/html
  - discovered for: bawaba, rls-guard
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **491518-2026** — Germany – Systems consultancy services – SAP S/4HANA Utilities
  - source: https://ted.europa.eu/en/notice/491518-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **494531-2026** — Germany – Health and safety services – Landkreis Northeim - sicherheitstechnische und brandschutzrechtliche Betreuung
  - source: https://ted.europa.eu/en/notice/494531-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **496268-2026** — Germany – Services provided by medical personnel – Rahmenvertrag für die arbeitsmedizinische und sicherheitstechnische Betreuung 2027-2030
  - source: https://ted.europa.eu/en/notice/496268-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **500358-2026** — France – Technical computer support services – Prestation de support et de maitrise d'ouvrage du système d'information bancaire de l'IEOM.
  - source: https://ted.europa.eu/en/notice/500358-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **500966-2026** — France – Computer back-up services – PRESTATIONS D'ASSISTANCE ET D'EXPERTISE INFORMATIQUE
  - source: https://ted.europa.eu/en/notice/500966-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **502549-2026** — France – Systems consultancy services – Analyse de risques et accompagnement SMSI V2
  - source: https://ted.europa.eu/en/notice/502549-2026/html
  - discovered for: bawaba, rls-guard
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **505248-2026** — France – Technical computer support services – Prestation d'assistance technique informatique pour l'agence IEDOM de Guadeloupe.
  - source: https://ted.europa.eu/en/notice/505248-2026/html
  - discovered for: bawaba
  - verification: SOURCE_UNAVAILABLE · live fetch: SOURCE_UNAVAILABLE
- **506438-2026** — France – Computer support and consultancy services – Contrat-cadre Conseil IT 2027
  - source: https://ted.europa.eu/en/notice/506438-2026/html
  - discovered for: bawaba, thestudio-mt
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **506669-2026** — France – Technical computer support services – Prestation d'assistance technique informatique pour l'agence IEDOM de Guyane
  - source: https://ted.europa.eu/en/notice/506669-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **506980-2026** — Germany – Health and safety services – Landkreis Northeim - sicherheitstechnische und brandschutzrechtliche Betreuung
  - source: https://ted.europa.eu/en/notice/506980-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **507986-2026** — France – Computer-related services – Acquisition de prestation de sécurité pour le système d'information de Manche Numérique, ses membres et sa Centrale d'Achat
  - source: https://ted.europa.eu/en/notice/507986-2026/html
  - discovered for: bawaba
  - verification: SOURCE_UNAVAILABLE · live fetch: SOURCE_UNAVAILABLE
- **510724-2026** — France – Security services – Prestations de surveillance et de protection des bâtiments du Département
  - source: https://ted.europa.eu/en/notice/510724-2026/html
  - discovered for: bawaba, rls-guard
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **515847-2026** — France – Safety consultancy services – PRESTATIONS DE SECURISATION DES SYSTEMES D'INFORMATION
  - source: https://ted.europa.eu/en/notice/515847-2026/html
  - discovered for: bawaba, rls-guard
  - verification: SOURCE_UNAVAILABLE · live fetch: SOURCE_UNAVAILABLE
- **516067-2026** — Germany – Software-related services – Beschaffung einer Beratungsdienstleistung zur Leitung eines Identity and Access Management (IAM) Projektes für die Stadtwerke Bielefeld (SWB)
  - source: https://ted.europa.eu/en/notice/516067-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **522668-2026** — France – Computer back-up services – PRESTATIONS D'ASSISTANCE ET D'EXPERTISE INFORMATIQUE
  - source: https://ted.europa.eu/en/notice/522668-2026/html
  - discovered for: bawaba
  - verification: SOURCE_UNAVAILABLE · live fetch: SOURCE_UNAVAILABLE
- **524786-2026** — France – Supply services of personnel including temporary staff – Prestations de mise à disposition de personnel intérimaire pour le compte du Centre Départemental Enfance Familles (CDEF)
  - source: https://ted.europa.eu/en/notice/524786-2026/html
  - discovered for: bawaba
  - verification: SOURCE_UNAVAILABLE · live fetch: SOURCE_UNAVAILABLE
- **524958-2026** — Germany – License management software package – Verlängerung VMware Lizenzen 2026-2029
  - source: https://ted.europa.eu/en/notice/524958-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **525961-2026** — Germany – Computer-related management services – Sachbezugskarte
  - source: https://ted.europa.eu/en/notice/525961-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **529129-2026** — Germany – Safety consultancy services – "Koordination von Projekten im Bereich Informationssicherheit"
  - source: https://ted.europa.eu/en/notice/529129-2026/html
  - discovered for: bawaba
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK
- **529497-2026** — France – System maintenance services – Maintenance et supervision des systèmes de vidéosurveillance de LOGIREP
  - source: https://ted.europa.eu/en/notice/529497-2026/html
  - discovered for: bawaba, rls-guard
  - verification: MANUAL_REVIEW_REQUIRED · live fetch: OK

> Discovery via the TED Search API (official primary source), one query per project profile. No item is VERIFIED without a human. `discovered for` is the query that surfaced the notice — not a match verdict.
