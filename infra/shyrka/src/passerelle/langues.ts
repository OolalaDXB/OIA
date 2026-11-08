import type { Speaker } from "../types.js";

/**
 * Langue de chaque tour (demande de Mickaël, 8 novembre 2026 : Shyrka ne
 * parlait que français). La langue d'une prise vient de Whisper (détection
 * locale) ; celle d'un texte tapé, de son alphabet quand il n'est pas latin.
 * Le modèle local répond dans cette langue, et la voix du Mac est choisie
 * d'après la langue de ce qu'elle doit dire : jamais un texte russe lu par
 * une voix française. Sans voix installée pour une langue, Shyrka n'en lit
 * aucune et le dit.
 */

export const NOMS: Record<string, string> = {
  fr: "français", en: "anglais", ru: "russe", uk: "ukrainien", es: "espagnol", de: "allemand", it: "italien", pt: "portugais", nl: "néerlandais",
  pl: "polonais", tr: "turc", ar: "arabe", he: "hébreu", zh: "chinois", ja: "japonais", ko: "coréen", hi: "hindi", fa: "persan", el: "grec",
};
export const nomLangue = (code: string) => NOMS[code] ?? code;

/** Langue d'après l'alphabet, si elle s'en déduit sans ambiguïté ; null pour l'alphabet latin. */
export function langueDuTexte(texte: string): string | null {
  const lettres = [...texte].filter((c) => /\p{L}/u.test(c));
  if (!lettres.length) return null;
  const part = (re: RegExp) => lettres.filter((c) => re.test(c)).length / lettres.length;
  if (part(/\p{Script=Cyrillic}/u) > 0.5) return /[іїєґІЇЄҐ]/.test(texte) ? "uk" : "ru";
  if (part(/\p{Script=Arabic}/u) > 0.5) return "ar";
  if (part(/\p{Script=Hebrew}/u) > 0.5) return "he";
  if (part(/\p{Script=Greek}/u) > 0.5) return "el";
  if (part(/\p{Script=Hangul}/u) > 0.5) return "ko";
  if (part(/[\p{Script=Hiragana}\p{Script=Katakana}]/u) > 0.2) return "ja";
  if (part(/\p{Script=Han}/u) > 0.5) return "zh";
  if (part(/\p{Script=Devanagari}/u) > 0.5) return "hi";
  return null;
}

/** Consigne du tour pour le modèle : vide en français (règle du cadre). */
export function consigneLangue(code: string): string {
  if (code === "fr") return "";
  const n = nomLangue(code);
  return `Langue de ce tour : Mickaël te parle en ${n}. Pour ce tour, réponds en ${n}, pas en français, avec les mêmes règles (court, la conclusion d'abord, faits tirés des sources).`;
}

export interface VoixInstallee {
  nom: string;
  locale: string;
}

/** `say -v ?` : nom exact et locale de chaque voix. */
export function voixParLocale(sortie: string): VoixInstallee[] {
  return sortie.split("\n").flatMap((l) => {
    const m = /^(.+?)\s{2,}([a-z]{2,3}_[A-Z0-9]{2,3})\b/.exec(l);
    return m ? [{ nom: m[1]!.trim(), locale: m[2]! }] : [];
  });
}

/** Voix gadgets de macOS (effets, caricatures) : jamais pour Shyrka (« Albert » rendait l'anglais effrayant). */
const GADGETS = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Good News|Jester|Junior|Organ|Superstar|Ralph|Trinoids|Whisper|Zarvox|Fred|Grandma|Grandpa|Rocko|Eddy|Reed)\b/;

/** Voix voulues par langue, dans l'ordre : des voix féminines posées, proches d'Aurélie. */
const PREFEREES: Record<string, string[]> = {
  en: ["Ava", "Samantha", "Allison", "Karen", "Moira", "Serena", "Kate", "Susan", "Tessa", "Kathy", "Flo", "Shelley", "Sandy"],
  ru: ["Milena", "Katya"],
  es: ["Mónica", "Paulina", "Marisol"],
  de: ["Anna", "Petra", "Helena"],
  it: ["Alice", "Federica"],
  pt: ["Joana", "Luciana"],
};

/** Voix d'une langue : la préférée installée (Premium, puis Enhanced, puis de base), sans voix gadget. Null si aucune. */
export function voixPourLangue(code: string, installees: VoixInstallee[]): string | null {
  const candidates = installees.filter((v) => v.locale.split("_")[0] === code && !GADGETS.test(v.nom));
  if (!candidates.length) return null;
  const qualite = (vs: VoixInstallee[]) => vs.find((v) => /\(Premium\)$/.test(v.nom)) ?? vs.find((v) => /\(Enhanced\)$/.test(v.nom)) ?? vs[0];
  for (const nom of PREFEREES[code] ?? []) {
    const memes = candidates.filter((v) => v.nom === nom || v.nom.startsWith(`${nom} (`));
    if (memes.length) return qualite(memes)!.nom;
  }
  return qualite(candidates)!.nom;
}

/**
 * Voix multilingue : la langue de la réplique (alphabet, sinon langue du
 * tour) choisit la voix. Chaque voix est un `Speaker` créé à la demande.
 */
export class VoixMultilingue implements Speaker {
  private courante = "fr";
  private active: Speaker | null = null;
  private readonly cache = new Map<string, Speaker | null>();

  constructor(
    private readonly voixDe: (code: string) => string | null,
    private readonly creer: (voix: string) => Speaker,
    private readonly signaler: (message: string) => void = () => undefined,
  ) {}

  /** Langue du tour à venir. */
  langue(code: string): void {
    this.courante = code;
  }

  private pour(code: string): Speaker | null {
    if (!this.cache.has(code)) {
      const v = this.voixDe(code);
      this.cache.set(code, v ? this.creer(v) : null);
    }
    return this.cache.get(code)!;
  }

  async speak(text: string): Promise<void | "interrompu"> {
    const code = langueDuTexte(text) ?? this.courante;
    const s = this.pour(code);
    if (!s) {
      this.signaler(`aucune voix ${nomLangue(code)} installée sur ce Mac : réponse affichée, non lue`);
      return;
    }
    this.active = s;
    try {
      return await s.speak(text);
    } finally {
      this.active = null;
    }
  }

  interrompre(): void {
    this.active?.interrompre?.();
  }
}

const LANGUES_DEMANDEES: [RegExp, string][] = [
  [/anglais|english/, "en"], [/fran[cç]ais|french/, "fr"], [/russe|russian/, "ru"], [/espagnol|spanish/, "es"], [/allemand|german/, "de"],
  [/italien|italian/, "it"], [/portugais|portuguese/, "pt"], [/arabe|arabic/, "ar"], [/ukrainien|ukrainian/, "uk"], [/chinois|chinese/, "zh"], [/japonais|japanese/, "ja"],
];

/**
 * « Parle-moi en anglais », « réponds en russe », « utilise ta voix anglaise », « speak English » :
 * langue demandée pour la suite de la conversation (jusqu'à « parle en français »). Null sinon.
 */
export function langueDemandee(texte: string): string | null {
  const n = texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!/\b(parle|parler|parles|reponds|repondre|reponse|voix|speak|talk|answer|switch|passe|passer)\b/.test(n)) return null;
  const m = /\b(?:en|in|ta voix|voix|to)\s+([a-z]+)/.exec(n) ?? /\b(english|french|russian|spanish|german|italian)\b/.exec(n);
  if (!m) return null;
  for (const [re, code] of LANGUES_DEMANDEES) if (re.test(m[1]!)) return code;
  return null;
}

const MOTS_OUTILS: Record<string, RegExp> = {
  fr: /\b(le|la|les|et|est|je|tu|de|des|une|pour|que|pas|avec|dans|sur|ce|vous|nous|mais|ou)\b/g,
  en: /\b(the|and|you|is|are|to|of|it|for|with|your|this|that|in|on|be|have|will|can|i)\b/g,
  es: /\b(el|los|las|y|es|que|de|para|con|una|no|por|como|pero|tu|usted)\b/g,
  de: /\b(der|die|das|und|ist|ich|du|nicht|mit|ein|eine|zu|auf|sie|wir)\b/g,
  it: /\b(il|che|di|per|non|una|sono|con|della|questo|ma|anche|ti)\b/g,
  pt: /\b(o|os|e|que|de|para|com|uma|nao|voce|muito|isso)\b/g,
};

/** Langue d'un texte en alphabet latin, d'après ses mots outils (pour choisir la voix de la réponse). Null si incertain. */
export function langueLatine(texte: string): string | null {
  const n = ` ${texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")} `;
  const scores = Object.entries(MOTS_OUTILS).map(([code, re]) => [code, (n.match(re) ?? []).length] as const).sort((a, b) => b[1] - a[1]);
  const [premier, second] = scores;
  return premier && premier[1] >= 3 && premier[1] >= (second?.[1] ?? 0) * 1.5 ? premier[0] : null;
}
