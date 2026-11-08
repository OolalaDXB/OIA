import { useState, type CSSProperties } from "react";
import { siFacebook, siGoogle, siInstagram, siReddit, siTiktok, siTripadvisor, siYoutube } from "simple-icons";
import { couleurSerie } from "@/components/oia/graphiques";

const reseaux = {
  Instagram: { icone: siInstagram, couleur: "var(--reseau-instagram)" },
  TikTok: { icone: siTiktok, couleur: "var(--reseau-tiktok)" },
  Facebook: { icone: siFacebook, couleur: "var(--reseau-facebook)" },
  YouTube: { icone: siYoutube, couleur: "var(--reseau-youtube)" },
  Reddit: { icone: siReddit, couleur: "var(--reseau-reddit)" },
  Google: { icone: siGoogle, couleur: "var(--reseau-google)" },
  Tripadvisor: { icone: siTripadvisor, couleur: "var(--reseau-tripadvisor)" },
} as const;

function LogoSimple({ nom, petite = false }: { nom: keyof typeof reseaux; petite?: boolean }) {
  const entite = reseaux[nom];
  return <span aria-hidden="true" className={`logo-identite ${petite ? "logo-identite-petite" : ""}`} style={{ "--identite-couleur": entite.couleur } as CSSProperties}>
    <svg viewBox="0 0 24 24" className="size-4 fill-current"><path d={entite.icone.path} /></svg>
  </span>;
}

export function LogoReseau({ nom, petite = false }: { nom: string; petite?: boolean }) {
  return nom in reseaux ? <LogoSimple nom={nom as keyof typeof reseaux} petite={petite} /> : null;
}

export function domaineSource(source: string) {
  try { return new URL(source.includes("://") ? source : `https://${source}`).hostname.replace(/^www\./, ""); }
  catch { return source.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "") ?? source; }
}

const logosSources: [string, keyof typeof reseaux][] = [
  ["instagram.com", "Instagram"], ["tiktok.com", "TikTok"], ["facebook.com", "Facebook"],
  ["youtube.com", "YouTube"], ["reddit.com", "Reddit"], ["google.com", "Google"], ["tripadvisor.", "Tripadvisor"],
];

export function FaviconSource({ source, petite = false }: { source: string; petite?: boolean }) {
  const domaine = domaineSource(source);
  const logo = logosSources.find(([fragment]) => domaine.includes(fragment))?.[1];
  const [erreurDomaine, setErreurDomaine] = useState<string | null>(null);
  const [chargeDomaine, setChargeDomaine] = useState<string | null>(null);
  if (logo) return <LogoSimple nom={logo} petite={petite} />;
  const charge = chargeDomaine === domaine && erreurDomaine !== domaine;
  return <span aria-hidden="true" className={`logo-identite logo-marque ${petite ? "logo-identite-petite" : ""}`} style={{ "--identite-couleur": couleurSerie(domaine) } as CSSProperties}>
    {erreurDomaine !== domaine && <img src={`https://${domaine}/favicon.ico`} alt="" loading="lazy" className={charge ? "size-4 object-contain" : "hidden"} onLoad={(e) => { if (e.currentTarget.naturalWidth > 0) setChargeDomaine(domaine); else setErreurDomaine(domaine); }} onError={() => setErreurDomaine(domaine)} />}
    {!charge && (domaine[0]?.toLocaleUpperCase("fr-FR") ?? "?")}
  </span>;
}
