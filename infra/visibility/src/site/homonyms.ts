/**
 * Alias et homonymes du nom de marque dans les réponses de la journée de reconnaissance
 * (mandat v15, bloc A, étape 8) : une personne ou une entité qui porte le même prénom, le
 * même nom ou un nom voisin (exemple fictif : la marque « Coach Zed » face à « Zed Harrow »,
 * professeur de step), et les domaines voisins. Chaque homonyme est signalé avec la réponse
 * et le passage, pour la désambiguïsation ; rien n'est décidé ici (statut `extrait`).
 */
import { z } from "zod";
import { type AnswerRow, fold, hostOf, nameKey, passageAt, urlsIn } from "./text.js";

export const HomonymSchema = z
  .object({
    nom: z.string(),
    type: z.enum(["nom", "domaine"]),
    terme: z.string(),
    statut: z.literal("extrait"),
    reponses: z.number().int().min(1),
    occurrences: z.array(z.object({ reponse: z.string(), moteur: z.string(), question: z.string(), passage: z.string() }).strict()),
  })
  .strict();
export type Homonym = z.infer<typeof HomonymSchema>;

export const HomonymsFileSchema = z
  .object({ format: z.literal(1), le: z.string(), marque: z.string(), termes: z.array(z.string()), reponsesLues: z.number().int(), homonymes: z.array(HomonymSchema) })
  .strict();
export type HomonymsFile = z.infer<typeof HomonymsFileSchema>;

/** Mots trop courants pour qu'un homonyme sur eux veuille dire quelque chose. */
const GENERIC = new Set(
  "the and of by for le la les de du des et pour par chez au aux un une coach co inc ltd llc sas sarl sa gmbh group groupe official officiel www com".split(" "),
);

export interface HomonymOptions {
  brand: string;
  /** Autres noms de la marque (alias de type name ou person). */
  aliases: string[];
  /** Domaines de la marque (jamais signalés). */
  domains: string[];
  /** Lieux et mots génériques tolérés à côté du nom de marque (« Coach Zed Dubai » n'est pas un homonyme). */
  places: string[];
  now?: () => Date;
  maxOccurrences?: number;
}

/** Mots de la marque qui peuvent porter un homonyme : nom, alias, radical du domaine. */
export function brandTokens(o: Pick<HomonymOptions, "brand" | "aliases" | "domains">): string[] {
  const words = [o.brand, ...o.aliases].flatMap((n) => n.split(/[\s.\-_'’&]+/));
  const stems = o.domains.flatMap((d) => (hostOf(d.includes("://") ? d : `https://${d}`) ?? d).split(".")[0]!.split(/[-_]+/));
  return [...new Set([...words, ...stems].map(nameKey).filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w)))];
}

const CAPITALIZED = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}'’-]*(?:[ \t]+\p{Lu}[\p{L}\p{N}'’-]*){0,3}/gu;
const BARE_DOMAIN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ae|fr|uk|de|es|it|be|ch|ca|us|app|info|biz)\b/gi;

export function findHomonyms(answers: AnswerRow[], o: HomonymOptions): HomonymsFile {
  const tokens = brandTokens(o);
  const brandWords = new Set(nameKey(o.brand).split(" "));
  const known = new Set([o.brand, ...o.aliases].map(nameKey));
  const tolerated = new Set([...o.places.flatMap((p) => nameKey(p).split(" ")), ...GENERIC]);
  const brandHosts = new Set(o.domains.map((d) => hostOf(d.includes("://") ? d : `https://${d}`)).filter((h): h is string => !!h));
  const max = o.maxOccurrences ?? 5;
  const found = new Map<string, Homonym & { seen: Set<string> }>();

  const record = (key: string, nom: string, type: Homonym["type"], terme: string, a: AnswerRow, at: number) => {
    const h = found.get(key) ?? { nom, type, terme, statut: "extrait" as const, reponses: 0, occurrences: [], seen: new Set<string>() };
    if (!h.seen.has(a.id)) {
      h.seen.add(a.id);
      h.reponses++;
      if (h.occurrences.length < max) h.occurrences.push({ reponse: a.id, moteur: a.engine, question: a.promptId, passage: passageAt(a.rawText, at).text });
    }
    found.set(key, h);
  };

  for (const a of [...answers].sort((x, y) => x.id.localeCompare(y.id))) {
    // Noms voisins : une suite de mots à majuscule qui contient un mot de la marque.
    for (const m of a.rawText.matchAll(CAPITALIZED)) {
      const seq = m[0].replace(/[’'-]+$/, "");
      const key = nameKey(seq);
      const words = key.split(" ");
      const hit = words.find((w) => tokens.includes(w));
      if (!hit || known.has(key)) continue;
      // Une partie du nom de marque (« Zed », « Coach Zed ») est la marque, pas un homonyme.
      if (words.every((w) => brandWords.has(w) || GENERIC.has(w))) continue;
      // Le nom de marque complet suivi d'un lieu (« Coach Zed Dubai ») n'en est pas un non plus.
      const hasWholeBrand = [...brandWords].every((w) => words.includes(w));
      if (hasWholeBrand && words.filter((w) => !brandWords.has(w)).every((w) => tolerated.has(w))) continue;
      record(`nom:${key}`, seq, "nom", hit, a, m.index ?? 0);
    }
    // Domaines voisins : un domaine qui reprend un mot de la marque sans être celui de la marque.
    const hosts = new Map<string, number>();
    for (const u of urlsIn(a.rawText)) {
      const h = hostOf(u);
      if (h && !hosts.has(h)) hosts.set(h, a.rawText.indexOf(u));
    }
    for (const m of a.rawText.matchAll(BARE_DOMAIN)) {
      const h = m[0].toLowerCase().replace(/^www\./, "");
      if (!hosts.has(h)) hosts.set(h, m.index ?? 0);
    }
    for (const c of a.citations) {
      const h = hostOf(c.url);
      if (h && !hosts.has(h)) hosts.set(h, Math.max(0, a.rawText.indexOf(c.url)));
    }
    for (const [h, at] of hosts) {
      if (brandHosts.has(h) || [...brandHosts].some((b) => h.endsWith(`.${b}`))) continue;
      const label = fold(h.split(".").slice(0, -1).join("."));
      const hit = tokens.find((t) => t.length >= 4 && label.includes(t));
      if (hit) record(`domaine:${h}`, h, "domaine", hit, a, at);
    }
  }

  const homonymes = [...found.values()]
    .map(({ seen: _seen, ...h }) => h)
    .sort((x, y) => y.reponses - x.reponses || x.nom.localeCompare(y.nom));
  return { format: 1, le: (o.now ?? (() => new Date()))().toISOString(), marque: o.brand, termes: tokens, reponsesLues: answers.length, homonymes };
}

export function renderHomonyms(f: HomonymsFile): string {
  const L = [
    `# Homonymes et noms voisins de « ${f.marque} »`,
    "",
    `Le ${f.le}. ${f.reponsesLues} réponse(s) lue(s). Mots de la marque cherchés : ${f.termes.join(", ") || "aucun"}. Tout est « extrait » : à désambiguïser.`,
    "",
  ];
  if (!f.homonymes.length) L.push("Aucun homonyme trouvé.", "");
  for (const h of f.homonymes) {
    L.push(`## ${h.nom} (${h.type}, mot « ${h.terme} », ${h.reponses} réponse(s))`, "");
    for (const o of h.occurrences) L.push(`- ${o.reponse} (${o.moteur}, ${o.question}) : « ${o.passage} »`);
    L.push("");
  }
  return L.join("\n");
}
