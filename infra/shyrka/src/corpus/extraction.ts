import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lecture locale d'un document déposé (mandat Corpus local, connecteur 1).
 *
 * Tout se fait en mémoire : le document arrive en octets, les parseurs
 * (textutil et PDFKit, fournis par macOS) le lisent sur leur entrée standard ;
 * aucune copie en clair dans /tmp, Downloads ou le dépôt.
 *
 * Le type est établi par le CONTENU (signature), pas par l'extension ; les
 * deux doivent concorder. Refusés : exécutables, HTML, archives, macros,
 * double extension trompeuse, PDF sans couche texte (« OCR requis »), audio
 * (« prochain jalon »).
 */

export const TAILLE_MAX = 25 * 1024 * 1024;
export const LOT_MAX = 100 * 1024 * 1024;
const PAGES_MAX = 500;
const DELAI_PARSEUR_MS = 20_000;
/** Taille des extraits indexés (mesures de l'ADR 0005 : 900 caractères, chevauchement 150). */
export const TAILLE_EXTRAIT = 900;
const CHEVAUCHEMENT = 150;

export type TypeDocument = "txt" | "md" | "pdf" | "docx";

export interface Passage {
  /** Titre de la section (Markdown) ou du document. */
  section: string;
  /** Référence vérifiable : « ligne 12 », « page 3 », « § 4–7 ». Jamais un numéro de ligne inventé. */
  ref: string;
  /** Première ligne (texte, Markdown) ; 0 pour PDF et DOCX. */
  ligne: number;
  texte: string;
}

export interface DocumentLu {
  type: TypeDocument;
  empreinte: string;
  taille: number;
  passages: Passage[];
  /** Texte complet extrait (vérification des citations, prévisualisation). */
  texte: string;
  pages?: number;
}

export class RefusDocument extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export const empreinte = (o: Uint8Array | string) => createHash("sha256").update(o).digest("hex");

const AUDIO = /\.(m4a|mp3|wav|aac|ogg|opus|flac|caf|aiff?)$/i;
const ACCEPTES: Record<string, TypeDocument> = { txt: "txt", md: "md", markdown: "md", pdf: "pdf", docx: "docx" };

/** Nom d'affichage nettoyé : jamais un chemin, jamais une autorisation. */
export function nomAffichage(nom: string): string {
  const base = nom.split(/[\\/]/).pop() ?? "";
  return base.normalize("NFC").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120);
}

/** Type déclaré par l'extension ; refus des extensions doubles trompeuses (« bilan.pdf.app »). */
export function typeDeclare(nom: string): TypeDocument {
  const n = nomAffichage(nom).toLowerCase();
  if (!n || n.startsWith(".")) throw new RefusDocument("nom_invalide", "Nom de fichier invalide ou caché.");
  if (AUDIO.test(n)) throw new RefusDocument("audio_prochain_jalon", "Audio : prochain jalon. Les notes vocales ne sont pas encore acceptées.");
  const parties = n.split(".");
  const ext = parties.length > 1 ? parties.pop()! : "";
  const t = ACCEPTES[ext];
  if (!t) throw new RefusDocument("type_refuse", `Type « .${ext || "?"} » non pris en charge : .txt, .md, .pdf ou .docx seulement.`);
  // « contrat.docx.exe » est refusé plus haut (extension finale) ; « note.exe.txt » ici.
  if (parties.slice(1).some((p) => /^(exe|app|command|sh|bat|js|scpt|pkg|dmg|zip|html?|docm|xlsm)$/.test(p))) throw new RefusDocument("double_extension", "Double extension suspecte : renomme le fichier.");
  return t;
}

const commence = (o: Uint8Array, sig: number[]) => sig.every((b, i) => o[i] === b);
const contient = (o: Uint8Array, s: string) => Buffer.from(o.buffer, o.byteOffset, o.byteLength).includes(s, 0, "latin1");

/** Type réel d'après le contenu ; il doit concorder avec l'extension. */
export function verifierContenu(octets: Uint8Array, declare: TypeDocument): void {
  if (octets.byteLength === 0) throw new RefusDocument("vide", "Fichier vide.");
  if (octets.byteLength > TAILLE_MAX) throw new RefusDocument("trop_grand", `25 Mo au plus par document.`);
  const pdf = commence(octets, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const zip = commence(octets, [0x50, 0x4b, 0x03, 0x04]);
  const executable = commence(octets, [0x7f, 0x45, 0x4c, 0x46]) || commence(octets, [0xcf, 0xfa, 0xed, 0xfe]) || commence(octets, [0xca, 0xfe, 0xba, 0xbe]) || commence(octets, [0x4d, 0x5a]);
  if (executable) throw new RefusDocument("executable", "Exécutable refusé.");
  if (declare === "pdf") {
    if (!pdf) throw new RefusDocument("type_incoherent", "L'extension dit PDF, le contenu non.");
    if (contient(octets, "/JavaScript") || contient(octets, "/Launch") || contient(octets, "/EmbeddedFile")) throw new RefusDocument("pdf_actif", "PDF avec script, lancement ou pièce jointe : refusé. Exporte une version simple.");
    return;
  }
  if (declare === "docx") {
    if (!zip) throw new RefusDocument("type_incoherent", "L'extension dit DOCX, le contenu non.");
    if (contient(octets, "vbaProject.bin") || contient(octets, "macroEnabled")) throw new RefusDocument("macro", "Document avec macros (DOCM) : refusé.");
    if (!contient(octets, "word/document.xml") || !contient(octets, "[Content_Types].xml")) throw new RefusDocument("type_incoherent", "Archive qui n'est pas un document Word : refusée.");
    if (contient(octets, "word/embeddings/")) throw new RefusDocument("objet_incorpore", "Document avec objets incorporés : refusé. Exporte une version simple.");
    return;
  }
  // Texte : UTF-8 valide, sans octet nul, sans signature binaire ni HTML actif.
  if (pdf || zip) throw new RefusDocument("type_incoherent", "Fichier binaire déclaré comme texte : refusé.");
  if (octets.includes(0)) throw new RefusDocument("binaire", "Fichier binaire déclaré comme texte : refusé.");
  let texte: string;
  try {
    texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    throw new RefusDocument("encodage", "Texte non UTF-8 : enregistre-le en UTF-8.");
  }
  if (/^\s*<(!doctype html|html|head|body)\b/i.test(texte)) throw new RefusDocument("html", "Page HTML refusée : .txt ou .md seulement.");
}

/** Découpe un texte en extraits de 900 caractères environ, chevauchants, aux limites de ligne ou de phrase ; `debut` = position dans le texte. */
export function morceaux(texte: string): { texte: string; debut: number }[] {
  const out: { texte: string; debut: number }[] = [];
  let i = 0;
  while (i < texte.length) {
    let fin = Math.min(texte.length, i + TAILLE_EXTRAIT);
    if (fin < texte.length) {
      const coupe = Math.max(texte.lastIndexOf("\n", fin), texte.lastIndexOf(". ", fin));
      if (coupe > i + TAILLE_EXTRAIT / 2) fin = coupe + 1;
    }
    const brut = texte.slice(i, fin);
    const lead = brut.length - brut.trimStart().length;
    if (brut.trim()) out.push({ texte: brut.trim(), debut: i + lead });
    if (fin >= texte.length) break;
    i = Math.max(fin - CHEVAUCHEMENT, i + 1);
  }
  return out;
}

export const decouper = (texte: string) => morceaux(texte).map((m) => m.texte);

/** Markdown et texte : sections (titres) ; chaque extrait cite la ligne réelle où il commence. */
function passagesTexte(texte: string, titreDoc: string): Passage[] {
  const lignes = texte.split("\n");
  const out: Passage[] = [];
  let cur = { titre: titreDoc, premiere: 0, corps: [] as string[] };
  const pousser = () => {
    const corps = cur.corps.join("\n");
    for (const m of morceaux(corps)) {
      const ligne = cur.premiere + corps.slice(0, m.debut).split("\n").length;
      out.push({ section: cur.titre, ref: `ligne ${ligne}`, ligne, texte: m.texte });
    }
  };
  lignes.forEach((l, i) => {
    const h = /^#{1,4}\s+(.+)$/.exec(l);
    if (h) {
      pousser();
      cur = { titre: h[1]!.trim(), premiere: i + 1, corps: [] };
    } else cur.corps.push(l);
  });
  pousser();
  return out;
}

/** DOCX : paragraphes numérotés (textutil perd les styles de titre). */
function passagesParagraphes(texte: string, titreDoc: string): Passage[] {
  const paras = texte.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: Passage[] = [];
  let debut = 0;
  let corps: string[] = [];
  const pousser = (fin: number) => {
    if (!corps.length) return;
    const ref = debut + 1 === fin ? `§ ${fin}` : `§ ${debut + 1}–${fin}`;
    for (const m of decouper(corps.join("\n"))) out.push({ section: titreDoc, ref, ligne: 0, texte: m });
    corps = [];
  };
  paras.forEach((p, i) => {
    if (corps.join("\n").length + p.length > TAILLE_EXTRAIT && corps.length) {
      pousser(i);
      debut = i;
    }
    corps.push(p);
  });
  pousser(paras.length);
  return out;
}

const OUTILS = join(homedir(), "oia-shyrka-data", "outils");
const SOURCE_PDF = fileURLToPath(new URL("../../outils/pdf-texte.swift", import.meta.url));

/** Lecteur PDF (PDFKit), compilé depuis `outils/pdf-texte.swift` avec le compilateur d'Apple, une fois par version de la source. */
export function lecteurPdf(): string {
  const h = empreinte(readFileSync(SOURCE_PDF)).slice(0, 12);
  const bin = join(OUTILS, `pdf-texte-${h}`);
  if (!existsSync(bin)) {
    mkdirSync(OUTILS, { recursive: true, mode: 0o700 });
    execFileSync("swiftc", ["-O", SOURCE_PDF, "-o", bin], { timeout: 180_000, stdio: "pipe" });
    chmodSync(bin, 0o700);
  }
  return bin;
}

function parseur(bin: string, args: string[], octets: Uint8Array): Promise<string> {
  return new Promise((ok, ko) => {
    const p = execFile(bin, args, { timeout: DELAI_PARSEUR_MS, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }, (e, sortie) => (e ? ko(e) : ok(sortie)));
    p.stdin?.end(Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength));
  });
}

export interface Parseurs {
  pdf: (octets: Uint8Array) => Promise<{ pages: { page: number; texte: string }[]; chiffre: boolean }>;
  docx: (octets: Uint8Array) => Promise<string>;
}

export const parseursMac: Parseurs = {
  pdf: async (o) => JSON.parse(await parseur(lecteurPdf(), [String(PAGES_MAX)], o)) as { pages: { page: number; texte: string }[]; chiffre: boolean },
  docx: (o) => parseur("/usr/bin/textutil", ["-stdin", "-stdout", "-format", "docx", "-convert", "txt", "-encoding", "UTF-8"], o),
};

/** Lit un document déposé : type vérifié, texte extrait, passages référencés. Aucune écriture. */
export async function lireDocument(nom: string, octets: Uint8Array, parseurs: Parseurs = parseursMac): Promise<DocumentLu> {
  const type = typeDeclare(nom);
  verifierContenu(octets, type);
  const titre = nomAffichage(nom).replace(/\.[^.]+$/, "");
  const base = { type, empreinte: empreinte(octets), taille: octets.byteLength };
  if (type === "txt" || type === "md") {
    const texte = new TextDecoder("utf-8").decode(octets).replace(/\r\n?/g, "\n");
    const passages = passagesTexte(texte, titre);
    if (!passages.length) throw new RefusDocument("texte_absent", "Aucun texte dans ce fichier.");
    return { ...base, texte, passages };
  }
  if (type === "docx") {
    let texte: string;
    try {
      texte = (await parseurs.docx(octets)).replace(/\r\n?/g, "\n");
    } catch {
      throw new RefusDocument("parseur", "Document Word illisible (fichier abîmé ou format inattendu).");
    }
    const passages = passagesParagraphes(texte, titre);
    if (!passages.length) throw new RefusDocument("texte_absent", "Aucun texte dans ce document Word.");
    return { ...base, texte, passages };
  }
  let lu: Awaited<ReturnType<Parseurs["pdf"]>>;
  try {
    lu = await parseurs.pdf(octets);
  } catch (e) {
    const m = (e as { code?: number; stderr?: string }).code === 3 ? "plus de 500 pages" : "PDF illisible ou malformé";
    throw new RefusDocument("parseur", `${m[0]!.toUpperCase()}${m.slice(1)} : refusé.`);
  }
  if (lu.chiffre) throw new RefusDocument("pdf_chiffre", "PDF protégé par mot de passe : refusé.");
  const avecTexte = lu.pages.filter((p) => p.texte.replace(/\s/g, "").length >= 20);
  if (!avecTexte.length) throw new RefusDocument("ocr_requis", "Texte absent : PDF scanné, OCR requis. Il n'est pas réputé lu.");
  const passages: Passage[] = [];
  for (const p of avecTexte) for (const m of decouper(p.texte)) passages.push({ section: titre, ref: `page ${p.page}`, ligne: 0, texte: m });
  return { ...base, texte: avecTexte.map((p) => p.texte).join("\n\n"), passages, pages: lu.pages.length };
}
