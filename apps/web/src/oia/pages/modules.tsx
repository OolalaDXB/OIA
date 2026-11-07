"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import NextLink from "next/link";
import { Shell, Fictif, Statut } from "@/components/oia/ui";
import { PageExistante } from "@/components/oia/page-existante";
import { modules } from "@/config/navigation";

function Onglets({ slug }: { slug: string }) {
  const m = modules.find((x) => x.slug === slug)!;
  const params = useSearchParams();
  const pages = m.pages ?? [];
  const actif = pages.find((p) => p.id === params.get("onglet")) ?? pages[0]!;
  return (
    <>
      {pages.length > 1 && (
        <nav aria-label={`Pages ${m.nom}`} className="mb-6 flex flex-wrap gap-x-4 border-b border-border">
          {pages.map((p) => (
            <NextLink
              key={p.id}
              href={`/oia/${m.slug}/?onglet=${p.id}`}
              replace
              scroll={false}
              aria-current={p.id === actif.id ? "page" : undefined}
              className={`inline-flex min-h-12 items-center border-b-2 px-2 py-3 text-sm text-muted-foreground ${p.id === actif.id ? `border-${m.couleur} text-foreground` : "border-transparent"}`}
            >
              {p.label}
            </NextLink>
          ))}
        </nav>
      )}
      <PageExistante key={actif.href} href={actif.href} titre={`${m.nom}, ${actif.label}`} />
    </>
  );
}

/** Module dont les pages existent déjà dans la console : elles sont reprises, onglet par onglet. */
export function ModuleAvecPages({ slug }: { slug: string }) {
  const m = modules.find((x) => x.slug === slug);
  if (!m) return null;
  return (
    <Shell large fictif={false}>
      <h1 className="text-3xl">{m.nom}</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">{m.role}</p>
      <Suspense fallback={null}>
        <Onglets slug={slug} />
      </Suspense>
    </Shell>
  );
}

/** Module sans page : « Module en préparation ». */
export function ModuleEnPreparation({ slug }: { slug: string }) {
  const m = modules.find((x) => x.slug === slug);
  if (!m) return null;
  return (
    <Shell>
      <Fictif />
      <h1 className="mt-2 text-3xl">{m.nom}</h1>
      <p className="mt-4 text-sm text-muted-foreground">{m.role}</p>
      <section className="mt-10 border-t border-border py-8">
        <h2 className="text-xl">Module en préparation</h2>
        <div className="mt-4"><Statut etat={m.statut} label={m.etat} /></div>
        <p className="mt-4 text-sm">{m.cle}</p>
      </section>
    </Shell>
  );
}
