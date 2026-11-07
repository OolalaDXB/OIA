"use client";

// Porté du prototype Lovable « OIA Dashoard » (commit c6470e86), route TanStack devenue vue Next.
import { Link } from "@/lib/router";
import { LockKeyhole } from "lucide-react";
import { Shell, Fictif } from "@/components/oia/ui";
import { modulesPersonnels } from "@/data/demo";



export function PersonnelPage({ module }: { module: string }) {
  const nom = modulesPersonnels.find((m) => m.slug === module)?.nom ?? "Personnel";
  return <Shell><Fictif /><p className="mt-6 flex items-center gap-2 text-xs text-tertiary"><LockKeyhole className="size-3" />Personnel · privé</p><h1 className="mt-2 text-3xl">{nom}</h1><section className="mt-10 border-t border-border py-8"><h2 className="text-xl">Module en préparation</h2><p className="mt-4 text-sm text-muted-foreground">Aucune donnée personnelle n’est enregistrée dans ce prototype.</p><Link to="/" className="mt-6 inline-block text-sm underline underline-offset-4">Retour à l’accueil</Link></section></Shell>;
}