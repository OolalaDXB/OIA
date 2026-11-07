"use client";

// Accueil OIA (mandat v7, F3). Mise en page du prototype Lovable « OIA Dashoard » (commit c6470e86) ;
// données tirées des sources existantes de la console (veille du jour, tâches, journal de revue).
import { useMemo } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { applyFreshnessAll } from "@oia/ingestion/freshness";
import { buildDigest, type DigestReason } from "@oia/workspace";
import { Link } from "@/lib/router";
import { Shell, Section, Fictif, Statut } from "@/components/oia/ui";
import { Button } from "@/components/ui/button";
import { aDecider, modules, utilisateur } from "@/data/demo";
import { depenseDuMois } from "@/config/navigation";
import { useAuditLog, useProjectTags, useTasks } from "../../lib/workspaceStore";
import { useLedger } from "../../lib/watchData";

const RAISON: Record<DigestReason, string> = {
  TASK_OVERDUE: "Tâche en retard",
  TASK_DUE: "Tâche à faire sous peu",
  JUST_EXPIRED: "Clos depuis ta dernière visite",
  CLOSING_SOON: "Bientôt clos",
  APPROVED_BUT_BLOCKED: "Approuvé mais bloqué par un contrôle",
  UNREVIEWED: "En attente de tri",
};

const ACTION: Record<string, string> = { APPROVE: "Approuvé", REJECT: "Rejeté", NEEDS_VERIFICATION: "À vérifier", COMMENT: "Commentaire" };

function VueDuJour({ data }: { data: ConsoleData }) {
  const audit = useAuditLog();
  const tags = useProjectTags();
  const tasks = useTasks();
  const ledger = useLedger(data);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const digest = useMemo(
    () => buildDigest(today, { records: applyFreshnessAll(ledger.records, `${today}T00:00:00Z`), tasks: tasks.tasks, auditLog: audit.log, tags: tags.tags, horizonDays: 14, maxUnreviewed: 5 }),
    [today, ledger.records, tasks.tasks, audit.log, tags.tags],
  );
  const entrees = digest.entries.slice(0, 8);
  const recente = [...audit.log].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const titre = (id: string) => ledger.records.find((r) => r.id === id)?.title ?? id;
  return { entrees, total: digest.entries.length, recente, titre };
}

export function Accueil({ data }: { data: ConsoleData | null }) {
  return (
    <Shell fictif={false}>
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl">Bonjour {utilisateur.prenom}</h1>
        <p className="mt-2 text-muted-foreground">Ce qui demande ton attention aujourd'hui.</p>
      </div>
      {data ? <AccueilDonnees data={data} /> : <p className="text-sm text-muted-foreground">Aucune donnée de console : relance la génération de la console.</p>}
    </Shell>
  );
}

function AccueilDonnees({ data }: { data: ConsoleData }) {
  const { entrees, total, recente, titre } = VueDuJour({ data });
  return (
    <>
      <Section titre="À décider" aside={<span className="num text-sm text-tertiary">{total + aDecider.length}</span>}>
        <h3 className="mb-1 text-xs text-tertiary">Tâches et opportunités · console</h3>
        <ol>
          {entrees.length === 0 && <li className="py-3 text-sm text-muted-foreground">Rien d'urgent : aucune tâche due, rien de bloqué, rien à trier.</li>}
          {entrees.map((e, i) => (
            <li key={`${e.reason}-${e.recordId}-${i}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-t border-border py-3 first:border-0">
              <span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-xs text-tertiary">{RAISON[e.reason]}</p>
                <p className="text-sm">{e.headline}</p>
                <p className="text-sm text-tertiary">{e.nextAction}</p>
              </div>
              <a href="/digest/" className="text-sm underline-offset-4 hover:underline">Ouvrir</a>
            </li>
          ))}
          {total > entrees.length && <li className="border-t border-border py-3 text-sm text-tertiary">Et {total - entrees.length} autres dans la veille du jour.</li>}
        </ol>
        <h3 className="mb-1 mt-6 flex items-center gap-3 text-xs text-tertiary">Décisions de Visibility <Fictif /></h3>
        <ol>
          {aDecider.map((a, i) => (
            <li key={a.titre} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-t border-border py-3 first:border-0">
              <span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-sm">{a.titre}</p>
                <p className="text-sm text-tertiary">{a.detail}</p>
              </div>
              <Button asChild variant="link" className="px-0 font-normal"><Link to="/visibility">Ouvrir</Link></Button>
            </li>
          ))}
        </ol>
      </Section>
      <section className="my-8">
        <h2 className="mb-5 text-lg">Modules</h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <article key={m.slug} className={`card flex min-w-0 flex-col border-t-2 border-t-${m.couleur} p-5`}>
              <h3 className="text-lg">{m.nom}</h3>
              <p className="mt-3 min-h-12 text-sm text-muted-foreground">{m.role}</p>
              <div className="mt-4"><Statut etat={m.statut} label={m.etat} /></div>
              <p className="mt-4 min-h-10 text-sm text-tertiary">{m.cle}</p>
              <Button asChild variant="link" className="mt-4 self-start px-0 font-normal"><Link to={`/${m.slug}`}>Ouvrir</Link></Button>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Section titre="Dépense du mois" aside={depenseDuMois.source === "démonstration" ? <Fictif /> : undefined}>
          <div className="num text-6xl font-normal">{depenseDuMois.montant} $</div>
          <div className="mt-3 h-1.5 rounded-full bg-track" />
          <p className="num mt-3 text-sm text-tertiary">Plafond de {depenseDuMois.plafond} $. La dépense réelle se lit chez chaque fournisseur.</p>
        </Section>
        <Section titre="Activité récente">
          <ol>
            {recente.length === 0 && <li className="py-3 text-sm text-muted-foreground">Aucune décision consignée dans ce navigateur.</li>}
            {recente.map((a) => (
              <li key={a.id} className="flex gap-4 border-t border-border py-3 first:border-0">
                <span className="num text-xs text-tertiary">{a.at.slice(0, 16).replace("T", " ")}</span>
                <div>
                  <p className="text-xs text-tertiary">{ACTION[a.action] ?? a.action}</p>
                  <p className="mt-1 text-sm">{titre(a.recordId)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
