/**
 * Acteurs nommés dans les réponses de la journée de reconnaissance (mandat v15, bloc A,
 * étape 7b). Leçon de la première étude : les concurrents réels sont ceux que les IA citent.
 *
 * Méthode (celle d'une extraction faite à la main sur J0, rendue générique et déterministe) :
 *  1. candidats : les noms mis en gras (`**…**`, `__…__`) et les titres markdown des réponses,
 *     nettoyés (numéro, ponctuation, précision après un tiret ou une parenthèse) ; les libellés
 *     génériques (« Prix », « Pros », « Pourquoi… »), les montants, la marque, ses alias et les
 *     lieux des marchés sont écartés ;
 *  2. recompte dans le TEXTE COMPLET de chaque réponse, en mot entier, accents et casse ignorés :
 *     nombre de réponses, par moteur et par question ;
 *  3. type : personne, structure ou plateforme, par votes sur le nom (forme, mots d'organisation)
 *     et sur le contexte de chaque mention (« coach », « app », « académie »…) ;
 *  4. réponse d'exemple (la première, par identifiant, qui met le nom en gras), passage, et source
 *     citée : lien écrit à côté du nom, sinon citation dont l'adresse reprend le nom.
 * Tout reste `extrait` : la liste suivie n'existe qu'après validation.
 */
import { z } from "zod";
import { type AnswerRow, fold, hostOf, nameKey, offsetsOf, passageAt, urlsIn } from "./text.js";

export const ACTOR_TYPES = ["personne", "structure", "plateforme"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ActorSchema = z
  .object({
    name: z.string().min(2),
    variantes: z.array(z.string()),
    type: z.enum(ACTOR_TYPES),
    statut: z.literal("extrait"),
    reponses: z.number().int().min(1),
    parMoteur: z.record(z.number().int()),
    parQuestion: z.record(z.number().int()),
    exemple: z.string(),
    passage: z.string(),
    source: z.string().nullable(),
    votes: z.object({ personne: z.number(), structure: z.number(), plateforme: z.number() }),
  })
  .strict();
export type Actor = z.infer<typeof ActorSchema>;

export const ActorsFileSchema = z
  .object({ format: z.literal(1), le: z.string(), reponsesLues: z.number().int(), seuil: z.number().int(), acteurs: z.array(ActorSchema), ecartesSousSeuil: z.number().int() })
  .strict();
export type ActorsFile = z.infer<typeof ActorsFileSchema>;

/** Premiers mots qui font d'un passage en gras un libellé, pas un nom. */
const GENERIC_FIRST = new Set(
  (
    "a an the le la les un une des du de best top meilleur meilleurs meilleure meilleures how why what which who where when comment pourquoi quel quels quelle quelles qui où quand " +
    "pros cons advantages disadvantages avantages inconvenients inconvénients price prices pricing cost costs prix tarif tarifs cout coût couts coûts budget " +
    "location locations lieu lieux adresse address contact website site web phone telephone téléphone email note notes tip tips conseil conseils astuce " +
    "summary overview résumé resume synthèse conclusion verdict final bottom key important option options alternative alternatives recommendation recommendations recommandation recommandations " +
    "step étape etape why pourquoi services service offre offres offer offers features fonctionnalités specialty spécialité specialties highlights points point rating ratings avis reviews review " +
    "here voici also aussi for pour with avec without sans if si in en on sur at à and et or ou but mais yes no oui non"
  ).split(/\s+/),
);

/** Mots d'organisation dans un nom. */
const ORG_WORDS = /\b(academy|academie|club|gym|gyms|studio|studios|centre|center|clinic|clinique|fitness|wellness|sports?|school|ecole|institut|institute|agency|agence|group|groupe|company|ltd|llc|inc|sarl|sas|sa|gmbh|fzco|fze|dmcc|partners|associates|immobilier|realty|properties|homes|hotel|hôtel|resort|spa|team|equipe|collective|lab|labs|hub|house|maison|cabinet|federation|association)\b/;
/** Indices de plateforme, dans le nom ou à côté. */
const PLATFORM_CUES = /\b(app|apps|application|appli|platform|plateforme|marketplace|place de marche|annuaire|directory|portal|portail|online service|service en ligne|website|site web|booking|reservation|subscription|abonnement|software|logiciel)\b/;
const PERSON_CUES = /\b(coach|trainer|entraineur|entraineuse|coach personnel|personal trainer|instructor|instructeur|moniteur|monitrice|founder|fondateur|fondatrice|ceo|owner|proprietaire|consultant|consultante|expert|experte|agent immobilier|architecte|he|she|his|her|him|il|elle|lui|certified|certifie|certifiee|ne a|nee a|born|mr|mrs|dr|mme)\b/;
const STRUCTURE_CUES = /\b(gym|studio|academy|academie|club|centre|center|agency|agence|company|societe|entreprise|clinic|clinique|school|ecole|chain|chaine|branches|locations|sites|venue|facility|facilities|courts|terrains|cabinet|reseau|network|team|equipe|brand|marque)\b/;

const MONEY = /(€|\$|£|\b(aed|eur|usd|gbp|chf|dhs?|dirhams?|euros?)\b|\d{2,})/i;

/** Nettoie un passage en gras : numéro, lien, ponctuation, précision après un tiret ou deux-points. */
export function cleanCandidate(raw: string): string | null {
  let s = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();
  s = s.replace(/^\d+[.)]\s*/, "").replace(/^[-–—•·]\s*/, "");
  s = s.split(/\s[–—-]\s|\s\|\s|:\s|\s\(|,\s/)[0]!.trim();
  s = s.replace(/[.:;,!?)\]]+$/, "").replace(/^["'“”«»]+|["'“”«»]+$/g, "").trim();
  if (s.length < 2 || s.length > 60) return null;
  const words = s.split(/\s+/);
  if (words.length > 6) return null;
  if (!/^[\p{Lu}\p{N}]/u.test(s)) return null;
  if (MONEY.test(s)) return null;
  if (GENERIC_FIRST.has(fold(words[0]!))) return null;
  if (/[?]/.test(s)) return null;
  return s;
}

const BOLD = /\*\*([^*\n]{2,90})\*\*|__([^_\n]{2,90})__/g;
const HEADING = /^#{2,5}\s+(.+)$/gm;

export function candidatesIn(text: string): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = [];
  for (const m of text.matchAll(BOLD)) {
    const c = cleanCandidate(m[1] ?? m[2]!);
    if (c) out.push({ name: c, at: m.index ?? 0 });
  }
  for (const m of text.matchAll(HEADING)) {
    const c = cleanCandidate(m[1]!);
    if (c) out.push({ name: c, at: m.index ?? 0 });
  }
  return out;
}

export interface ActorOptions {
  /** Marque, alias et domaines : jamais proposés comme concurrents. */
  brandTerms: string[];
  /** Lieux (marchés, villes) : écartés. */
  places: string[];
  /** Nombre minimal de réponses qui nomment l'acteur (défaut 2). */
  minReponses?: number;
  now?: () => Date;
}

function classify(name: string, contexts: string[]): { type: ActorType; votes: Actor["votes"] } {
  const n = fold(name);
  const votes = { personne: 0, structure: 0, plateforme: 0 };
  if (/\.(com|io|app|net|org|co|ae|fr|uk)\b/.test(n) || PLATFORM_CUES.test(n)) votes.plateforme += 3;
  if (ORG_WORDS.test(n)) votes.structure += 3;
  const words = name.split(/\s+/);
  const nameLike = words.length >= 2 && words.length <= 4 && words.every((w) => /^\p{Lu}[\p{Ll}'’-]+$/u.test(w));
  if (nameLike && !ORG_WORDS.test(n)) votes.personne += 2;
  if (words.length === 1) votes.structure += 0.5;
  for (const c of contexts) {
    if (PLATFORM_CUES.test(c)) votes.plateforme += 1;
    if (STRUCTURE_CUES.test(c)) votes.structure += 1;
    if (PERSON_CUES.test(c)) votes.personne += 1;
  }
  const order: ActorType[] = ["plateforme", "personne", "structure"];
  const best = Math.max(votes.personne, votes.structure, votes.plateforme);
  // Égalité : structure (le cas le moins engageant), sinon l'ordre ci-dessus.
  const type = votes.structure === best ? "structure" : order.find((t) => votes[t] === best)!;
  return { type, votes };
}

/** Contexte d'une mention : le nom et les 100 caractères qui suivent (là où les réponses présentent l'acteur). */
const contextAt = (folded: string, at: number, len: number) => folded.slice(Math.max(0, at - 30), at + len + 100);

function sourceFor(name: string, answer: AnswerRow, at: number): string | null {
  // Lien écrit sur la ligne du nom, ou sur les deux suivantes (détail d'un élément de liste).
  const lineStart = answer.rawText.lastIndexOf("\n", at - 1) + 1;
  let end = lineStart;
  for (let i = 0; i < 3; i++) {
    const next = answer.rawText.indexOf("\n", end + 1);
    end = next < 0 ? answer.rawText.length : next;
    if (next < 0) break;
  }
  const near = urlsIn(answer.rawText.slice(lineStart, end));
  if (near.length) return near[0]!;
  const slugs = [nameKey(name).replace(/[^a-z0-9]+/g, "-"), nameKey(name).replace(/[^a-z0-9]+/g, "")].filter((s) => s.length >= 4);
  const cited = answer.citations.find((c) => {
    const u = fold(c.url);
    return slugs.some((s) => u.includes(s)) || (c.label ? offsetsOf(c.label, name).length > 0 : false);
  });
  return cited?.url ?? null;
}

/** Acteurs nommés dans un corpus de réponses, du plus cité au moins cité. */
export function extractActors(answers: AnswerRow[], opts: ActorOptions): ActorsFile {
  const minReponses = opts.minReponses ?? 2;
  const brandKeys = opts.brandTerms.map(nameKey).filter(Boolean);
  // Lieux : écartés seulement tels quels (« Paris »), jamais dans un nom (« Paris Padel Club » reste).
  const excluded = new Set([...brandKeys, ...opts.places.map(nameKey)].filter(Boolean));
  const brandHosts = opts.brandTerms.map((t) => hostOf(t.includes("://") ? t : `https://${t}`)).filter((h): h is string => !!h && h.includes("."));
  const sorted = [...answers].sort((a, b) => a.id.localeCompare(b.id));

  // 1. Candidats, regroupés par clé ; forme affichée = la plus fréquente (puis la première).
  const groups = new Map<string, { forms: Map<string, number>; firstBold: { answer: AnswerRow; at: number } }>();
  for (const a of sorted) {
    for (const c of candidatesIn(a.rawText)) {
      const key = nameKey(c.name);
      if (excluded.has(key) || brandKeys.some((x) => x.length >= 4 && key.includes(x))) continue;
      if (brandHosts.some((h) => key.includes(h))) continue;
      const g = groups.get(key) ?? { forms: new Map(), firstBold: { answer: a, at: c.at } };
      g.forms.set(c.name, (g.forms.get(c.name) ?? 0) + 1);
      groups.set(key, g);
    }
  }

  // 2. Recompte dans le texte complet.
  const actors: Actor[] = [];
  let underThreshold = 0;
  for (const [, g] of groups) {
    const forms = [...g.forms.entries()].sort((x, y) => y[1] - x[1]);
    const name = forms[0]![0];
    const parMoteur: Record<string, number> = {};
    const parQuestion: Record<string, number> = {};
    const contexts: string[] = [];
    let reponses = 0;
    for (const a of sorted) {
      const offsets = offsetsOf(a.rawText, name);
      if (!offsets.length) continue;
      reponses++;
      parMoteur[a.engine] = (parMoteur[a.engine] ?? 0) + 1;
      parQuestion[a.promptId] = (parQuestion[a.promptId] ?? 0) + 1;
      const folded = fold(a.rawText);
      for (const at of offsets) contexts.push(contextAt(folded, at, name.length));
    }
    if (reponses < minReponses || reponses === 0) {
      underThreshold++;
      continue;
    }
    const { type, votes } = classify(name, contexts);
    const ex = g.firstBold;
    actors.push({
      name,
      variantes: forms.slice(1).map(([f]) => f),
      type,
      statut: "extrait",
      reponses,
      parMoteur: Object.fromEntries(Object.entries(parMoteur).sort(([x], [y]) => x.localeCompare(y))),
      parQuestion: Object.fromEntries(Object.entries(parQuestion).sort(([x], [y]) => x.localeCompare(y))),
      exemple: ex.answer.id,
      passage: passageAt(ex.answer.rawText, ex.at).text,
      source: sourceFor(name, ex.answer, ex.at),
      votes,
    });
  }
  actors.sort((a, b) => b.reponses - a.reponses || a.name.localeCompare(b.name));
  return { format: 1, le: (opts.now ?? (() => new Date()))().toISOString(), reponsesLues: answers.length, seuil: minReponses, acteurs: actors, ecartesSousSeuil: underThreshold };
}

const LABEL: Record<ActorType, string> = { personne: "Personnes", structure: "Structures", plateforme: "Plateformes" };

export function renderActors(f: ActorsFile): string {
  const L = [
    "# Acteurs nommés dans la journée de reconnaissance",
    "",
    `Le ${f.le}. ${f.reponsesLues} réponse(s) lue(s) ; seuil : ${f.seuil} réponse(s) ; ${f.ecartesSousSeuil} nom(s) sous le seuil. Tout est « extrait » : à valider.`,
    "",
  ];
  for (const t of ACTOR_TYPES) {
    const list = f.acteurs.filter((a) => a.type === t);
    L.push(`## ${LABEL[t]} (${list.length})`, "");
    if (!list.length) {
      L.push("Aucun.", "");
      continue;
    }
    L.push("| Nom | Réponses | Par moteur | Par question | Exemple | Source |", "|---|---|---|---|---|---|");
    const kv = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(", ");
    for (const a of list) L.push(`| ${a.name}${a.variantes.length ? ` (${a.variantes.join(", ")})` : ""} | ${a.reponses} | ${kv(a.parMoteur)} | ${kv(a.parQuestion)} | ${a.exemple} | ${a.source ?? "aucune source citée à côté du nom"} |`);
    L.push("");
  }
  return L.join("\n");
}
