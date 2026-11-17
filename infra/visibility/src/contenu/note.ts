/**
 * Note du contenu d'un site, sur trois axes : technique, fonctionnel, commercial (0 à 100).
 *
 * - Chaque axe est une grille de critères à points. Un critère vaut « ok », « non » ou
 *   « non mesuré » (null) ; la note est la part des points obtenus sur les points mesurés.
 * - Technique et fonctionnel : critères déterministes, lus dans le HTML servi et, si le
 *   dépôt est lié, dans le dépôt (lecture seule, sans exécution).
 * - Commercial (et le parcours d'achat) : grille fixe notée par un modèle (Mistral), qui doit
 *   citer le passage du site qui justifie chaque note. Une citation introuvable dans le texte
 *   du site annule la note du critère (« non vérifiable ») : pas de note sans preuve.
 * - Chaque critère manqué devient un constat (cle `contenu:<id>`), avec sa correction.
 */
import { z } from "zod";
import type { LLMProvider } from "../../../../packages/providers/src/types.js";
import { enveloppe } from "../llm-forme.js";
import { estSensible, type LectureDepot } from "../repo/github.js";
import { decodeEntities, pricesIn } from "../site/pages.js";

export type Axe = "technique" | "fonctionnel" | "commercial";

export interface PageBrute {
  url: string;
  html: string;
}

export interface Critere {
  id: string;
  axe: Axe;
  titre: string;
  points: number;
  ok: boolean | null;
  /** Ce qui a été mesuré (lisible). */
  valeur: string;
  /** Pages, fichiers ou citation qui fondent le résultat. */
  preuve: Record<string, unknown>;
  explication: string;
  correction: string;
  gravite: "critique" | "important" | "mineur";
  effort: "XS" | "S" | "M" | "L" | "XL";
  qui: "client" | "equipe";
  source: "html" | "depot" | "modele";
}

export interface NoteContenu {
  notes: Record<Axe, number | null>;
  criteres: Critere[];
  pages: string[];
  depot: { depot: string; sha: string; branche: string } | null;
}

// ------------------------------------------------------------------ lecture du HTML

const balises = (html: string, nom: string): string[] => html.match(new RegExp(`<${nom}\\b[^>]*>`, "gi")) ?? [];
const attr = (tag: string, a: string): string | null => {
  const m = new RegExp(`\\b${a}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const titre = (html: string) => /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
const meta = (html: string, nom: string) => balises(html, "meta").find((t) => (attr(t, "name") ?? attr(t, "property"))?.toLowerCase() === nom);
const h1s = (html: string) => (html.match(/<h1\b[\s\S]*?<\/h1>/gi) ?? []).length;
const liens = (html: string) => balises(html, "a").map((t) => ({ href: attr(t, "href") ?? "", tag: t }));
const texteVisible = (html: string) =>
  decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const chemin = (u: string) => {
  try {
    return new URL(u).pathname.replace(/\/$/, "") || "/";
  } catch {
    return u;
  }
};
const court = (urls: string[], n = 6) => urls.slice(0, n).map(chemin);

const OFFRE = /(tarif|prix|price|pricing|offre|offer|service|programme|program|coaching|training|cours|class|padel|wellness|formation)/i;
const LEGAL = /(mentions|legal|privacy|confidentialit|cgv|terms|conditions|cookies?)/i;
const CTA = /\b(book|réserv|reserv|contact|start|commencer|essai|trial|devis|quote|buy|acheter|payer|pay|inscri|sign ?up|join|rejoindre|whatsapp|call|appeler)/i;
const PREUVE_SOCIALE = /(t[ée]moignage|testimonial|avis|reviews?|★|⭐|\b\d+\s*(clients?|members?|élèves|students)\b|trustpilot|google reviews|case stud)/i;

// ------------------------------------------------------------------ critères déterministes

function critere(c: Omit<Critere, "ok"> & { ok: boolean | null }): Critere {
  return c;
}

export function criteresDeterministes(pages: PageBrute[], depot: LectureDepot | null): Critere[] {
  const out: Critere[] = [];
  const home = pages[0];
  const n = pages.length;
  const fichiers = depot?.fichiers ?? [];
  const contenuDepot = (re: RegExp) => fichiers.filter((f) => f.contenu !== undefined && /\.(html?|jsx|tsx|vue|svelte|astro)$/i.test(f.chemin) && re.test(f.contenu!));
  const aFichier = (re: RegExp) => fichiers.some((f) => re.test(f.chemin));
  /** Fichier écrit à la construction par un script du dépôt (writeFile… "sitemap.xml"). */
  const generePar = (nom: RegExp) => fichiers.some((f) => f.contenu !== undefined && /^scripts\/|^src\/prerender\//.test(f.chemin) && /writeFile/.test(f.contenu) && nom.test(f.contenu));

  // --- Technique
  const sansTitre = pages.filter((p) => titre(p.html).length < 10).map((p) => p.url);
  const titres = pages.map((p) => titre(p.html)).filter(Boolean);
  const doublons = titres.length - new Set(titres).size;
  out.push(critere({
    id: "titres", axe: "technique", titre: "Un titre distinct et parlant sur chaque page", points: 3, source: "html",
    ok: n ? sansTitre.length === 0 && doublons === 0 : null,
    valeur: `${n - sansTitre.length}/${n} pages avec titre, ${doublons} doublon(s)`, preuve: { pages: court(sansTitre) },
    explication: "Le titre est la première chose que lisent Google et les assistants IA pour comprendre une page.",
    correction: "Donner à chaque page un <title> unique de 30 à 60 caractères : offre, lieu, marque.", gravite: "important", effort: "XS", qui: "equipe",
  }));
  const sansDesc = pages.filter((p) => (attr(meta(p.html, "description") ?? "", "content") ?? "").length < 50).map((p) => p.url);
  out.push(critere({
    id: "descriptions", axe: "technique", titre: "Une description sur chaque page", points: 2, source: "html",
    ok: n ? sansDesc.length === 0 : null, valeur: `${n - sansDesc.length}/${n} pages`, preuve: { pages: court(sansDesc) },
    explication: "La description résume la page dans les résultats et sert de réponse courte aux IA.",
    correction: "Ajouter <meta name=\"description\"> de 120 à 160 caractères, propre à chaque page.", gravite: "mineur", effort: "XS", qui: "equipe",
  }));
  const h1Faux = pages.filter((p) => h1s(p.html) !== 1).map((p) => p.url);
  out.push(critere({
    id: "h1", axe: "technique", titre: "Un seul titre principal (h1) par page", points: 2, source: "html",
    ok: n ? h1Faux.length === 0 : null, valeur: `${n - h1Faux.length}/${n} pages`, preuve: { pages: court(h1Faux) },
    explication: "Le h1 dit de quoi parle la page ; zéro ou plusieurs h1 brouillent le sujet.",
    correction: "Garder exactement un <h1> par page, qui nomme l'offre.", gravite: "mineur", effort: "XS", qui: "equipe",
  }));
  const sansLang = pages.filter((p) => !attr(balises(p.html, "html")[0] ?? "", "lang")).map((p) => p.url);
  out.push(critere({
    id: "langue", axe: "technique", titre: "Langue déclarée (attribut lang)", points: 1, source: "html",
    ok: n ? sansLang.length === 0 : null, valeur: `${n - sansLang.length}/${n} pages`, preuve: { pages: court(sansLang) },
    explication: "Sans langue déclarée, les moteurs devinent, parfois mal, à qui servir la page.",
    correction: "Ajouter lang=\"fr\" ou lang=\"en\" sur la balise <html>.", gravite: "mineur", effort: "XS", qui: "equipe",
  }));
  const avecLd = pages.filter((p) => /application\/ld\+json/i.test(p.html)).length;
  out.push(critere({
    id: "donnees-structurees", axe: "technique", titre: "Données structurées (JSON-LD)", points: 3, source: "html",
    ok: n ? avecLd > 0 : null, valeur: `${avecLd}/${n} pages`, preuve: { pages_avec: avecLd },
    explication: "Les données structurées disent aux IA, sans ambiguïté, qui vous êtes, où, et ce que vous vendez.",
    correction: "Ajouter un bloc JSON-LD LocalBusiness (ou Organization) sur l'accueil et Service/Offer sur les pages d'offre.", gravite: "important", effort: "S", qui: "equipe",
  }));
  const viewportManquant = pages.filter((p) => !meta(p.html, "viewport")).map((p) => p.url);
  out.push(critere({
    id: "viewport", axe: "technique", titre: "Affichage mobile déclaré (viewport)", points: 2, source: "html",
    ok: n ? viewportManquant.length === 0 : null, valeur: `${n - viewportManquant.length}/${n} pages`, preuve: { pages: court(viewportManquant) },
    explication: "Sans viewport, le site s'affiche en miniature sur téléphone, où se fait la majorité des visites.",
    correction: "Ajouter <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.", gravite: "important", effort: "XS", qui: "equipe",
  }));
  const imgs = pages.flatMap((p) => balises(p.html, "img").map((t) => ({ url: p.url, alt: attr(t, "alt") })));
  const sansAlt = imgs.filter((i) => i.alt === null);
  out.push(critere({
    id: "images-alt", axe: "technique", titre: "Texte alternatif sur les images", points: 1, source: "html",
    ok: imgs.length ? sansAlt.length / imgs.length <= 0.1 : null, valeur: `${imgs.length - sansAlt.length}/${imgs.length} images`, preuve: { pages: court([...new Set(sansAlt.map((i) => i.url))]) },
    explication: "Le texte alternatif rend les images lisibles par les lecteurs d'écran et les moteurs.",
    correction: "Ajouter alt=\"…\" décrivant chaque image (alt=\"\" pour une image décorative).", gravite: "mineur", effort: "S", qui: "equipe",
  }));
  const placeholders = [
    ...pages.flatMap((p) => liens(p.html).filter((l) => l.href === "#" || /SOCIAL_URL|TODO|example\.com|lorem/i.test(l.href)).map(() => chemin(p.url))),
    ...(depot ? contenuDepot(/href\s*=\s*["'](#|[^"']*(SOCIAL_URL|TODO)[^"']*)["']/i).map((f) => f.chemin) : []),
  ];
  out.push(critere({
    id: "liens-factices", axe: "technique", titre: "Aucun lien factice (#, SOCIAL_URL, TODO)", points: 2, source: depot ? "depot" : "html",
    ok: n ? placeholders.length === 0 : null, valeur: `${placeholders.length} occurrence(s)`, preuve: { ou: [...new Set(placeholders)].slice(0, 8) },
    explication: "Un lien qui ne mène nulle part fait perdre le visiteur et signale un site inachevé.",
    correction: "Remplacer chaque lien factice par la vraie adresse (réseaux, réservation) ou retirer le lien.", gravite: "important", effort: "XS", qui: "equipe",
  }));
  const admin = pages.filter((p) => liens(p.html).some((l) => /(^|\/)(admin|wp-admin|dashboard|backoffice)(\/|$|\.html)/i.test(l.href))).map((p) => p.url);
  out.push(critere({
    id: "admin-public", axe: "technique", titre: "Pas de lien public vers l'administration", points: 2, source: "html",
    ok: n ? admin.length === 0 : null, valeur: `${admin.length} page(s) avec lien`, preuve: { pages: court(admin) },
    explication: "Un lien visible vers l'administration invite les tentatives d'intrusion et n'apporte rien au client.",
    correction: "Retirer le lien de la navigation publique ; garder l'accès par adresse directe et authentification.", gravite: "important", effort: "XS", qui: "equipe",
  }));
  if (depot) {
    // Servis à la racine du site : à la racine du dépôt, dans public/ ou static/ ; ou générés
    // par un script de construction (un fichier rangé ailleurs ne compte pas).
    const sitemap = aFichier(/^(public\/|static\/)?sitemap[^/]*\.xml$/i) || aFichier(/^(src\/)?app\/sitemap\.(ts|js)$/) || generePar(/sitemap\.xml/);
    out.push(critere({
      id: "sitemap", axe: "technique", titre: "Plan du site (sitemap.xml) versionné", points: 2, source: "depot", ok: sitemap, valeur: sitemap ? "présent" : "absent", preuve: {},
      explication: "Le plan du site liste les pages à indexer ; sans lui, les pages profondes sont découvertes tard.",
      correction: "Ajouter sitemap.xml à la racine et le déclarer dans robots.txt.", gravite: "mineur", effort: "XS", qui: "equipe",
    }));
    const llms = aFichier(/^(public\/|static\/)?llms\.txt$/i) || generePar(/llms\.txt/);
    out.push(critere({
      id: "llms-txt", axe: "technique", titre: "Fichier llms.txt pour les assistants IA", points: 1, source: "depot", ok: llms, valeur: llms ? "présent" : "absent", preuve: {},
      explication: "llms.txt résume le site pour les assistants IA : offres, lieux, prix, pages clés.",
      correction: "Ajouter /llms.txt (Markdown court : qui, quoi, où, prix, liens).", gravite: "mineur", effort: "S", qui: "equipe",
    }));
    // IndexNow : fichier clé servi à la racine (son contenu est son propre nom) et envoi automatique
    // des pages modifiées (script ou workflow qui appelle l'API IndexNow).
    const clesIndexNow = depot.fichiers
      .filter((f) => /^(public\/)?[A-Za-z0-9-]{8,128}\.txt$/.test(f.chemin) && f.contenu?.trim() === f.chemin.replace(/^public\//, "").slice(0, -4))
      .map((f) => f.chemin);
    const envoiIndexNow = depot.fichiers
      .filter((f) => f.contenu !== undefined && /\.(m?js|cjs|ts|ya?ml|json|sh|py)$/i.test(f.chemin) && /indexnow\.org|bing\.com\/indexnow|\/indexnow\b/i.test(f.contenu))
      .map((f) => f.chemin);
    out.push(critere({
      id: "indexnow", axe: "technique", titre: "Pages annoncées à Bing par IndexNow", points: 1, source: "depot",
      ok: clesIndexNow.length > 0 && envoiIndexNow.length > 0,
      valeur: clesIndexNow.length && envoiIndexNow.length ? "clé et envoi automatique" : clesIndexNow.length ? "clé présente, aucun envoi automatique trouvé" : envoiIndexNow.length ? "envoi trouvé, fichier clé absent" : "absent",
      preuve: { cle: clesIndexNow.slice(0, 2), envoi: envoiIndexNow.slice(0, 4) },
      explication: "IndexNow prévient Bing dès qu'une page change ; Bing alimente la recherche de ChatGPT et Copilot. Sans lui, il faut attendre le prochain passage du robot. Google ne l'utilise pas (Search Console).",
      correction: "Publier le fichier clé /<clé>.txt à la racine et, après chaque déploiement en production, envoyer les adresses modifiées du sitemap à api.indexnow.org (workflow sur le statut de déploiement).",
      gravite: "mineur", effort: "S", qui: "equipe",
    }));
    const sensibles = depot.fichiers.filter((f) => estSensible(f.chemin)).map((f) => f.chemin);
    out.push(critere({
      id: "secrets-versionnes", axe: "technique", titre: "Aucun fichier secret versionné", points: 4, source: "depot", ok: sensibles.length === 0,
      valeur: `${sensibles.length} fichier(s)`, preuve: { fichiers: sensibles.slice(0, 8), note: "contenu jamais lu" },
      explication: "Un fichier .env ou une clé dans le dépôt peut exposer des accès (paiement, base, e-mail), surtout si le dépôt est public.",
      correction: "Retirer ces fichiers du dépôt, les ajouter à .gitignore et changer immédiatement les clés concernées.", gravite: "critique", effort: "S", qui: "client",
    }));
  }

  // --- Fonctionnel
  const tous = pages.flatMap((p) => liens(p.html).map((l) => l.href));
  const contact = tous.filter((h) => /^(tel:|mailto:|https:\/\/(wa\.me|api\.whatsapp\.com)\/)/i.test(h));
  out.push(critere({
    id: "contact-direct", axe: "fonctionnel", titre: "Contact direct en un clic (téléphone, e-mail, WhatsApp)", points: 3, source: "html",
    ok: n ? contact.length > 0 : null, valeur: `${new Set(contact.map((c) => c.split(":")[0])).size} canal(aux)`, preuve: { canaux: [...new Set(contact.map((c) => c.replace(/^(tel:|mailto:).*/i, "$1").replace(/^https:\/\/([^/]+).*/, "$1")))] },
    explication: "Le visiteur décidé doit pouvoir joindre l'entreprise sans chercher.",
    correction: "Ajouter un bouton WhatsApp ou téléphone (lien tel:/wa.me) visible sur chaque page.", gravite: "important", effort: "XS", qui: "equipe",
  }));
  const conversion = pages.some((p) => /<form\b/i.test(p.html)) || tous.some((h) => /(book|reserv|calendly|cal\.com|pay|checkout|stripe|inscri|sign-?up)/i.test(h));
  out.push(critere({
    id: "conversion", axe: "fonctionnel", titre: "Un chemin de réservation ou de paiement", points: 3, source: "html", ok: n ? conversion : null,
    valeur: conversion ? "présent" : "absent", preuve: {},
    explication: "Sans formulaire, réservation ni paiement, l'intérêt du visiteur retombe avant de devenir une vente.",
    correction: "Ajouter un formulaire court ou un lien de réservation (Calendly, page de paiement) depuis chaque offre.", gravite: "critique", effort: "M", qui: "client",
  }));
  if (home) {
    const origin = new URL(home.url).origin;
    const lienAccueil = new Set(liens(home.html).map((l) => { try { return chemin(new URL(l.href, home.url).toString()); } catch { return ""; } }));
    const offres = pages.slice(1).filter((p) => OFFRE.test(p.url) && new URL(p.url).origin === origin);
    const orphelines = offres.filter((p) => !lienAccueil.has(chemin(p.url))).map((p) => p.url);
    out.push(critere({
      id: "accueil-vers-offres", axe: "fonctionnel", titre: "L'accueil mène à chaque page d'offre", points: 2, source: "html",
      ok: offres.length ? orphelines.length === 0 : null, valeur: `${offres.length - orphelines.length}/${offres.length} offres liées`, preuve: { pages: court(orphelines) },
      explication: "Une offre que l'accueil ne relie pas est peu visitée et peu comprise par les moteurs.",
      correction: "Lier chaque page d'offre depuis l'accueil (bloc « Nos offres » avec un lien par offre).", gravite: "important", effort: "XS", qui: "equipe",
    }));
  }
  const legal = tous.some((h) => LEGAL.test(h)) || aFichier(/(legal|privacy|mentions|terms|cgv)[^/]*\.(html?|tsx|jsx|md)$/i);
  out.push(critere({
    id: "pages-legales", axe: "fonctionnel", titre: "Mentions légales et confidentialité accessibles", points: 2, source: depot ? "depot" : "html", ok: n ? legal : null,
    valeur: legal ? "présentes" : "absentes", preuve: {},
    explication: "Obligatoires dans la plupart des pays, elles rassurent aussi avant un paiement.",
    correction: "Publier mentions légales et politique de confidentialité, liées depuis le pied de page.", gravite: "important", effort: "S", qui: "client",
  }));
  if (depot) {
    const p404 = aFichier(/(^|\/)(404\.html?|not-found\.(tsx|jsx|js)|404\.(tsx|jsx|astro))$/i) || /"(?:status|statusCode)"\s*:\s*404/.test(depot.fichiers.find((f) => f.chemin === "vercel.json")?.contenu ?? "");
    out.push(critere({
      id: "page-404", axe: "fonctionnel", titre: "Page d'erreur 404 utile", points: 1, source: "depot", ok: p404, valeur: p404 ? "présente" : "absente", preuve: {},
      explication: "Une adresse erronée doit ramener le visiteur vers les offres, pas vers une page blanche.",
      correction: "Ajouter 404.html avec la navigation et un lien vers les offres.", gravite: "mineur", effort: "XS", qui: "equipe",
    }));
  }

  // --- Commercial (part déterministe)
  const texte = pages.map((p) => texteVisible(p.html)).join("\n");
  const prix = pricesIn(texte, 10);
  out.push(critere({
    id: "prix-visibles", axe: "commercial", titre: "Prix ou point de départ affichés", points: 3, source: "html", ok: n ? prix.length > 0 : null,
    valeur: prix.length ? prix.slice(0, 4).join(", ") : "aucun prix lisible", preuve: { prix: prix.slice(0, 6) },
    explication: "Les assistants IA répondent aux questions de prix ; sans prix lisible, ils citent un concurrent qui en affiche.",
    correction: "Afficher un prix « à partir de » par offre, en texte (pas seulement dans une image ou après JavaScript).", gravite: "important", effort: "XS", qui: "client",
  }));
  const preuveSociale = PREUVE_SOCIALE.test(texte);
  out.push(critere({
    id: "preuve-sociale", axe: "commercial", titre: "Preuve sociale (avis, témoignages, chiffres)", points: 3, source: "html", ok: n ? preuveSociale : null,
    valeur: preuveSociale ? "présente" : "absente", preuve: {},
    explication: "Avis et résultats chiffrés décident les hésitants et nourrissent les réponses des IA.",
    correction: "Ajouter 3 témoignages nommés et une note Google, avec un lien vers la source.", gravite: "important", effort: "S", qui: "client",
  }));
  const ctas = pages.flatMap((p) => (p.html.match(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? []).map((b) => texteVisible(b)).filter((t) => CTA.test(t) && t.length < 60));
  out.push(critere({
    id: "appels-action", axe: "commercial", titre: "Appels à l'action clairs", points: 2, source: "html", ok: n ? ctas.length >= Math.max(1, Math.ceil(n / 2)) : null,
    valeur: `${ctas.length} bouton(s) d'action sur ${n} page(s)`, preuve: { exemples: [...new Set(ctas)].slice(0, 5) },
    explication: "Chaque page doit dire quoi faire ensuite : réserver, écrire, payer.",
    correction: "Placer un bouton d'action explicite (« Réserver une séance d'essai ») en haut et en bas de chaque page.", gravite: "important", effort: "XS", qui: "equipe",
  }));
  return out;
}

// ------------------------------------------------------------------ grille notée par le modèle

export const GRILLE_MODELE: { id: string; axe: Axe; titre: string; points: number; consigne: string; correction: string; gravite: Critere["gravite"]; effort: Critere["effort"] }[] = [
  { id: "proposition-valeur", axe: "commercial", titre: "Proposition de valeur claire dès l'accueil", points: 3, consigne: "En lisant le début de l'accueil, comprend-on qui, quoi, pour qui et où ?", correction: "Réécrire l'accroche : « [offre] pour [public] à [lieu] — [bénéfice] ».", gravite: "critique", effort: "S" },
  { id: "public-cible", axe: "commercial", titre: "Public cible explicite", points: 2, consigne: "Le site dit-il clairement à qui s'adressent les offres (niveau, âge, entreprise, particulier) ?", correction: "Nommer les publics dans chaque offre (« débutants », « entreprises », « juniors »).", gravite: "mineur", effort: "XS" },
  { id: "differenciation", axe: "commercial", titre: "Différenciation face aux concurrents", points: 2, consigne: "Le site dit-il ce qui le distingue (méthode, diplômes, résultats, lieu) ?", correction: "Ajouter un bloc « Pourquoi nous » avec 3 différences vérifiables.", gravite: "important", effort: "S" },
  { id: "offres-detaillees", axe: "commercial", titre: "Offres détaillées (contenu, durée, résultat attendu)", points: 3, consigne: "Chaque offre décrit-elle son contenu, sa durée ou son format, et le résultat attendu ?", correction: "Pour chaque offre : format, durée, déroulé, résultat attendu, prix.", gravite: "important", effort: "M" },
  { id: "objections", axe: "commercial", titre: "Réponses aux objections (FAQ)", points: 2, consigne: "Le site répond-il aux questions fréquentes (prix, annulation, niveau requis, lieu, matériel) ?", correction: "Ajouter une FAQ de 6 à 10 questions réelles, balisée FAQPage.", gravite: "mineur", effort: "S" },
  { id: "confiance", axe: "commercial", titre: "Signes de confiance (diplômes, références, garanties)", points: 2, consigne: "Le site montre-t-il des diplômes, certifications, références, partenaires ou garanties ?", correction: "Afficher diplômes et certifications, logos de références, conditions d'annulation.", gravite: "mineur", effort: "S" },
  { id: "parcours-achat", axe: "fonctionnel", titre: "Parcours d'achat compréhensible", points: 3, consigne: "Un visiteur comprend-il en quelques secondes comment passer de l'intérêt à la réservation ou à l'achat ?", correction: "Rendre le parcours explicite en 3 étapes (choisir, réserver, payer) avec un bouton à chaque étape.", gravite: "important", effort: "M" },
];

const NoteModele = z.preprocess((x) => enveloppe("criteres")(grilleEnTableau(x)), z.object({
  criteres: z.array(z.object({
    id: z.string(),
    note: z.coerce.number().int().min(0).max(2),
    citation: z.string().nullable().default(null).transform((x) => (x ? x.slice(0, 400) : null)),
    justification: z.string().default("").transform((x) => x.slice(0, 400)),
  })),
  synthese: z.string().default("").transform((x) => x.slice(0, 1200)),
}));
/** Grille rendue en objet ({ "proposition-valeur": { note, … } }) : remise en tableau avec l'id. */
function grilleEnTableau(x: unknown): unknown {
  if (!x || typeof x !== "object" || Array.isArray(x)) return x;
  const o = x as Record<string, unknown>;
  const ids = new Set(GRILLE_MODELE.map((g) => g.id));
  const versTableau = (v: Record<string, unknown>) =>
    Object.entries(v).filter(([k, c]) => ids.has(k) && c && typeof c === "object").map(([k, c]) => ({ id: k, ...(c as Record<string, unknown>) }));
  if (o.criteres && typeof o.criteres === "object" && !Array.isArray(o.criteres)) return { ...o, criteres: versTableau(o.criteres as Record<string, unknown>) };
  if (!("criteres" in o) && Object.keys(o).some((k) => ids.has(k))) return { ...o, criteres: versTableau(o) };
  return x;
}
export type NoteModeleSortie = z.infer<typeof NoteModele>;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[“”«»"’']/g, "").replace(/\s+/g, " ").trim();

/** Grille commerciale notée par le modèle ; chaque note > 0 doit citer le site, sinon elle est annulée. */
export async function criteresModele(llm: LLMProvider, o: { nom: string; pages: PageBrute[]; modele: string }): Promise<{ criteres: Critere[]; synthese: string }> {
  const textes = o.pages.map((p) => `### ${chemin(p.url)}\n${texteVisible(p.html).slice(0, 3500)}`).join("\n\n").slice(0, 24_000);
  const r = await llm.extract({
    schema: NoteModele,
    schemaName: "NoteContenu",
    purpose: "note-contenu",
    model: o.modele,
    system: [
      `Tu évalues le contenu commercial du site de « ${o.nom} », comme un consultant exigeant.`,
      "Pour chaque critère de la grille, donne une note : 0 absent, 1 partiel, 2 satisfaisant.",
      "Pour toute note de 1 ou 2, « citation » doit être un extrait EXACT (copié mot pour mot, 5 à 30 mots) du texte fourni qui la justifie ; sinon null.",
      "« justification » : une phrase concrète. Ne suppose rien qui ne soit pas dans le texte.",
      "« synthese » : 3 à 5 phrases, forces et priorités. Réponds en français, en JSON.",
      'Format exact : {"criteres":[{"id":"proposition-valeur","note":2,"citation":"…","justification":"…"}],"synthese":"…"} — un élément par critère de la grille, avec son id tel quel.',
      "Grille :",
      ...GRILLE_MODELE.map((g) => `- ${g.id} : ${g.consigne}`),
    ].join("\n"),
    input: textes,
  });
  const corpus = norm(o.pages.map((p) => texteVisible(p.html)).join(" "));
  const criteres = GRILLE_MODELE.map((g): Critere => {
    const x = r.data.criteres.find((c) => c.id === g.id);
    const citee = x?.citation ? corpus.includes(norm(x.citation)) : false;
    const verifiable = x && (x.note === 0 || citee);
    const ok = !x || !verifiable ? null : x.note === 2;
    return {
      id: g.id, axe: g.axe, titre: g.titre, points: g.points, source: "modele",
      ok,
      valeur: !x ? "non évalué" : !verifiable ? "non vérifiable (citation absente du site)" : ["absent", "partiel", "satisfaisant"][x.note]!,
      preuve: x ? { note: x.note, citation: citee ? x.citation : null, justification: x.justification } : {},
      explication: x?.justification ?? g.consigne,
      correction: g.correction, gravite: g.gravite, effort: g.effort, qui: "client",
    };
  });
  return { criteres, synthese: r.data.synthese };
}

// ------------------------------------------------------------------ notes et constats

export function notes(criteres: Critere[]): Record<Axe, number | null> {
  const out = { technique: null, fonctionnel: null, commercial: null } as Record<Axe, number | null>;
  for (const axe of Object.keys(out) as Axe[]) {
    const mesures = criteres.filter((c) => c.axe === axe && c.ok !== null);
    const total = mesures.reduce((s, c) => s + c.points, 0);
    out[axe] = total ? Math.round((100 * mesures.filter((c) => c.ok).reduce((s, c) => s + c.points, 0)) / total) : null;
  }
  return out;
}

/** Constats (contrat v3) pour les critères manqués. */
export function constatsContenu(criteres: Critere[]): Record<string, unknown>[] {
  return criteres
    .filter((c) => c.ok === false)
    .map((c) => ({
      cle: `contenu:${c.id}`,
      source: "contenu",
      categorie: c.axe === "technique" ? "technique" : c.axe === "fonctionnel" ? "fonctionnel" : "commercial",
      gravite: c.gravite,
      titre: `À corriger : ${c.titre.charAt(0).toLowerCase()}${c.titre.slice(1)}`.slice(0, 200),
      explication: c.explication.length >= 10 ? c.explication : `${c.titre} : ${c.valeur}`,
      correction: c.correction,
      impact: null,
      effort: c.effort,
      qui: c.qui,
      valeur: c.valeur.slice(0, 200),
      preuve: { ...c.preuve, mesure: c.source },
    }));
}

export function noterContenu(pages: PageBrute[], depot: LectureDepot | null, modele: Critere[] = []): NoteContenu {
  const criteres = [...criteresDeterministes(pages, depot), ...modele];
  return { notes: notes(criteres), criteres, pages: pages.map((p) => p.url), depot: depot ? { depot: depot.depot, sha: depot.sha, branche: depot.branche } : null };
}
