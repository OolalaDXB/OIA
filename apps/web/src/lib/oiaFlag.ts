/**
 * Bascule de l'interface web OIA (route /oia).
 *
 * Désactivée par défaut. Elle ne s'allume qu'avec la valeur exacte "on" au
 * moment du build (export statique) :
 *
 *   NEXT_PUBLIC_OIA_INTERFACE=on pnpm --filter @oia/web build
 *
 * Toute autre valeur, absente comprise, laisse la route en mode « désactivée »
 * et retire l'entrée du rail. La variable est lue littéralement pour que Next
 * l'inline dans le bundle client (le rail est un composant client).
 */
export const OIA_INTERFACE_FLAG = "NEXT_PUBLIC_OIA_INTERFACE";

export function oiaInterfaceEnabled(value: string | undefined = process.env.NEXT_PUBLIC_OIA_INTERFACE): boolean {
  return value === "on";
}
