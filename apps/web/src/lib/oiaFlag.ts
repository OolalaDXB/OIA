/**
 * Bascule de l'interface web OIA (route /oia).
 *
 * La valeur est calculée au build par `oia-flag.mjs` et inlinée par Next
 * (`env.OIA_INTERFACE` dans next.config.mjs) :
 * - production Vercel : toujours éteinte ;
 * - Preview Vercel : allumée ;
 * - local et CI : éteinte, sauf `NEXT_PUBLIC_OIA_INTERFACE=on`.
 */
export const OIA_INTERFACE_FLAG = "NEXT_PUBLIC_OIA_INTERFACE";

export function oiaInterfaceEnabled(value: string | undefined = process.env.OIA_INTERFACE): boolean {
  return value === "on";
}
