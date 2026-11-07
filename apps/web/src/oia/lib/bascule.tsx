"use client";

import { useEffect } from "react";
import { BASCULE_ACCUEIL, REDIRECTIONS } from "../config/navigation";
import { oiaInterfaceEnabled } from "../../lib/oiaFlag";

/** Adresse de destination après la bascule, ou null tant qu'elle est désactivée. */
export function destinationApresBascule(chemin: string, bascule: boolean = BASCULE_ACCUEIL, oiaAllumee: boolean = oiaInterfaceEnabled()): string | null {
  if (!bascule || !oiaAllumee) return null;
  const cle = chemin.endsWith("/") ? chemin : `${chemin}/`;
  return REDIRECTIONS[cle] ?? null;
}

/**
 * Bascule (mandat v7, F6) : placée dans le layout de la console, elle ne fait
 * rien tant que BASCULE_ACCUEIL vaut false. Le jour où Mickaël bascule, elle
 * redirige les anciennes adresses vers /oia.
 */
export function Bascule() {
  useEffect(() => {
    // Une page de la console affichée dans /oia (cadre) ne redirige jamais : sinon, boucle.
    if (window.self !== window.top) return;
    const cible = destinationApresBascule(window.location.pathname);
    if (cible) window.location.replace(cible);
  }, []);
  return null;
}
