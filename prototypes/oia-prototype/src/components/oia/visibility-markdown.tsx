import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

function echapperRegExp(valeur: string) {
  return valeur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lienSecurise(url: string) {
  return /^https?:\/\//i.test(url) ? url : null;
}

function texteSurligne(texte: string, passages: string[], marque?: string): ReactNode[] {
  const termes = [...new Set([...passages, ...(marque ? [marque] : [])].filter((v) => v.trim().length > 1))].sort((a, b) => b.length - a.length);
  if (!termes.length) return [texte];
  const regle = new RegExp(`(${termes.map(echapperRegExp).join("|")})`, "gi");
  return texte.split(regle).filter((part) => part !== "").map((part, index) => {
    const passage = passages.some((p) => p.toLocaleLowerCase("fr-FR") === part.toLocaleLowerCase("fr-FR"));
    const nom = marque?.toLocaleLowerCase("fr-FR") === part.toLocaleLowerCase("fr-FR");
    return passage || nom
      ? <mark key={index} className="rounded-sm bg-track px-0.5 text-foreground underline decoration-module-visibility underline-offset-4">{part}</mark>
      : <span key={index}>{part}</span>;
  });
}

function inlineMarkdown(texte: string, passages: string[], marque?: string): ReactNode[] {
  const regle = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  return texte.split(regle).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{texteSurligne(part.slice(2, -2), passages, marque)}</strong>;
    const lien = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (lien) {
      const href = lienSecurise(lien[2] ?? "");
      if (href) return <a key={index} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">{texteSurligne(lien[1] ?? "", passages, marque)}</a>;
    }
    return <span key={index}>{texteSurligne(part, passages, marque)}</span>;
  });
}

/** Le Markdown est converti en nœuds React. Aucun HTML brut n'est injecté ni exécuté. */
export function nettoyerTexteMarkdown(texte: string) {
  return texte
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "");
}

export function MarkdownSecurise({ texte, passage, marque }: { texte: string; passage?: string | null | undefined; marque?: string | undefined }) {
  const passages = passage?.trim() ? [passage.trim()] : [];
  const lignes = nettoyerTexteMarkdown(texte).replace(/\r\n/g, "\n").split("\n");
  const blocs: ReactNode[] = [];
  let liste: string[] = [];
  let cleListe = 0;
  const viderListe = () => {
    if (!liste.length) return;
    const elements = liste;
    blocs.push(<ul key={`liste-${cleListe++}`} className="my-2 list-disc space-y-1 pl-5">{elements.map((item, index) => <li key={index}>{inlineMarkdown(item, passages, marque)}</li>)}</ul>);
    liste = [];
  };
  lignes.forEach((ligne, index) => {
    const puce = ligne.match(/^\s*[-*]\s+(.+)$/);
    const numerotee = ligne.match(/^\s*\d+[.)]\s+(.+)$/);
    if (puce || numerotee) {
      liste.push((puce?.[1] ?? numerotee?.[1])!);
      return;
    }
    viderListe();
    if (!ligne.trim()) return;
    const titre = ligne.match(/^#{1,3}\s+(.+)$/);
    blocs.push(titre
      ? <h4 key={`titre-${index}`} className="mt-3 font-medium first:mt-0">{inlineMarkdown(titre[1] ?? "", passages, marque)}</h4>
      : <p key={`paragraphe-${index}`} className="my-2 first:mt-0 last:mb-0">{inlineMarkdown(ligne, passages, marque)}</p>);
  });
  viderListe();
  return <div className="leading-relaxed">{blocs}</div>;
}

export function ReponseMarkdown({ texte, passage, marque }: { texte: string; passage?: string | null | undefined; marque?: string | undefined }) {
  const [ouvert, setOuvert] = useState(false);
  const long = texte.length > 280 || texte.split("\n").length > 4;
  return <div>
    <div className={!ouvert && long ? "max-h-28 overflow-hidden" : undefined} data-testid="contenu-markdown">
      <MarkdownSecurise texte={texte} passage={passage} marque={marque} />
    </div>
    {long && <Button type="button" variant="ghost" className="mt-1 min-h-11 px-0 text-xs" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>{ouvert ? "Réduire" : "Lire la suite"}</Button>}
  </div>;
}
