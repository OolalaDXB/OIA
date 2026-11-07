"use client";

import { useRef } from "react";

/**
 * Affiche une page actuelle de la console dans la nouvelle coquille, sans la
 * réécrire ni la modifier (mandat v7, F2) : un cadre de même origine, dont on
 * masque seulement le rail, puisque la colonne des modules le remplace. La
 * page garde ses données, sa connexion, ses exports, son stockage local et
 * son bouton de langue.
 */
export const STYLE_INTEGRE = ".rail{display:none!important}.shell{width:100%!important}";

export function PageExistante({ href, titre }: { href: string; titre: string }) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const masquerRail = () => {
    const doc = cadre.current?.contentDocument;
    if (!doc || doc.getElementById("oia-integre")) return;
    const style = doc.createElement("style");
    style.id = "oia-integre";
    style.textContent = STYLE_INTEGRE;
    doc.head.appendChild(style);
  };
  return (
    <div className="card overflow-hidden p-0">
      <iframe ref={cadre} src={href} title={titre} onLoad={masquerRail} className="block h-[calc(100dvh-260px)] min-h-[520px] w-full border-0" />
      <p className="border-t border-border px-4 py-2 text-xs text-tertiary">
        Page actuelle de la console, reprise telle quelle · <a href={href} className="underline underline-offset-4">ouvrir seule</a>
      </p>
    </div>
  );
}
