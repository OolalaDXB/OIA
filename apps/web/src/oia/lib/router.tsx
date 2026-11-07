"use client";

/**
 * Cale de routage : le prototype Lovable utilise TanStack Router ; la console
 * est une application Next. Cette cale reproduit la petite partie de l'API
 * dont les composants portés se servent (Link, useRouter().subscribe,
 * useRouterState), pour que ces composants restent tels quels. Toutes les
 * routes du prototype vivent sous /oia.
 */
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type AnchorHTMLAttributes, type ReactNode } from "react";

export const BASE = "/oia";

/** Chemin du prototype (« /visibility », « /sites/$slug ») vers l'URL réelle (« /oia/visibility/ »). */
export function href(to: string, params?: Record<string, string>): string {
  let path = to;
  for (const [k, v] of Object.entries(params ?? {})) path = path.replace(`$${k}`, encodeURIComponent(v));
  return path === "/" ? `${BASE}/` : `${BASE}${path.replace(/\/+$/, "")}/`;
}

/** Chemin courant, vu du prototype : « /oia/shyrka/ » devient « /shyrka ». */
export function cheminRelatif(pathname: string | null): string {
  const p = (pathname ?? "/").replace(/\/+$/, "");
  const rel = p.startsWith(BASE) ? p.slice(BASE.length) : p;
  return rel === "" ? "/" : rel;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  params?: Record<string, string>;
  activeProps?: { className?: string };
  activeOptions?: { exact?: boolean };
  children?: ReactNode;
};

export function Link({ to, params, activeProps, activeOptions, className, ...rest }: LinkProps) {
  const courant = cheminRelatif(usePathname());
  const cible = cheminRelatif(href(to, params));
  const actif = activeOptions?.exact || cible === "/" ? courant === cible : courant === cible || courant.startsWith(`${cible}/`);
  const classes = [className, actif ? activeProps?.className : undefined].filter(Boolean).join(" ") || undefined;
  return <NextLink href={href(to, params)} className={classes} {...rest} />;
}

const abonnes = new Set<() => void>();

/** Seul l'événement « onResolved » sert : il est émis après chaque changement de page. */
export function useRouter() {
  return {
    subscribe(_evenement: "onResolved", rappel: () => void) {
      abonnes.add(rappel);
      return () => {
        abonnes.delete(rappel);
      };
    },
  };
}

/** À placer une fois dans le layout : émet « onResolved » à chaque changement de page. */
export function NotificateurDeRoute() {
  const pathname = usePathname();
  useEffect(() => {
    for (const rappel of [...abonnes]) rappel();
  }, [pathname]);
  return null;
}

export function useRouterState<T>({ select }: { select: (s: { location: { pathname: string } }) => T }): T {
  return select({ location: { pathname: cheminRelatif(usePathname()) } });
}
