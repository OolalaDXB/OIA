/**
 * Règle de la bascule de l'interface OIA (/oia), évaluée au build.
 *
 * - Production Vercel (VERCEL_ENV=production) : toujours éteinte, quelle que
 *   soit la variable NEXT_PUBLIC_OIA_INTERFACE. Décision de Mickaël du
 *   2026-11-08 : jamais en production pour l'instant.
 * - Preview Vercel (VERCEL_ENV=preview) : allumée.
 * - Ailleurs (poste local, CI) : éteinte, sauf NEXT_PUBLIC_OIA_INTERFACE=on.
 *
 * Fichier en JavaScript simple : next.config.mjs l'importe, les tests aussi.
 */
export function resolveOiaInterface({ vercelEnv, flag } = {}) {
  if (vercelEnv === "production") return "off";
  if (vercelEnv === "preview") return "on";
  return flag === "on" ? "on" : "off";
}
