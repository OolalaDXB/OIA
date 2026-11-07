import { couleurs, etats, modules, ombres, rayons, shyrka, typographie } from "./tokens.js";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Génère les variables CSS (préfixe --oia-) à partir des constantes. */
export function genererCss(): string {
  const lignes: string[] = [];
  const bloc = (prefixe: string, obj: Record<string, string | number>) => {
    for (const [k, v] of Object.entries(obj)) lignes.push(`  --oia-${prefixe}${kebab(k)}: ${v};`);
  };
  bloc("", couleurs);
  bloc("etat-", etats);
  bloc("module-", modules);
  bloc("shyrka-", shyrka);
  bloc("police-", typographie);
  bloc("rayon-", rayons);
  bloc("ombre-", ombres);
  return [
    "/* Jetons de design d'OIA, style « Salon, version sobre ».",
    " * Fichier généré depuis packages/ui-tokens/src/tokens.ts : ne pas modifier à la main.",
    " * Régénérer : pnpm --filter @oia/ui-tokens css */",
    ":root {",
    ...lignes,
    "}",
    "",
  ].join("\n");
}
