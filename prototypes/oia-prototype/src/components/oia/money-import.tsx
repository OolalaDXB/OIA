import { useState } from "react";
import { useActionMoney, useVueMoney } from "@/lib/donnees/money";
import { apercuSauvegarde, ESPACE_OIA, dateMoney } from "@/lib/money-contrat";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/oia/ui";
import { EtatMoney } from "./money-commun";
import { risqueAnnulation } from "@/lib/money-import";
import { ChevronDown, ChevronRight } from "lucide-react";

const collectionsImport = { decisions: "Décisions", etiquettes: "Étiquettes", notes: "Notes", taches: "Tâches", contacts: "Contacts", vues: "Vues enregistrées" };
function objetBilan(value: Json | undefined | null): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function resumeBilan(value: Json | undefined | null) {
  const bilan = objetBilan(value);
  const entries = Object.entries(collectionsImport).flatMap(([key, label]) => typeof bilan[key] === "number" && bilan[key] > 0 ? [`${bilan[key]} ${label.toLocaleLowerCase("fr-FR")}`] : []);
  return entries.join(" · ") || "Aucun élément importé";
}
function BilanImport({ value, annulation = false }: { value: Json | undefined | null; annulation?: boolean }) {
  const bilan = objetBilan(value);
  const groupes = annulation
    ? [["a_supprimer", "Éléments à supprimer"]]
    : [["", "Éléments importés"], ["deja_presents", "Déjà présents"], ["conflits", "Conflits, éléments non écrasés"]];
  const risk = risqueAnnulation(value ?? undefined);
  return <div className="space-y-4 py-4 text-sm">{groupes.map(([key, title]) => {
    const data = key ? objetBilan(bilan[key]) : bilan;
    return <div key={key}><h4 className="mb-2 font-medium">{title}</h4><dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(collectionsImport).map(([field, label]) => {
      const item = data[field];
      const count = typeof item === "number" ? item : Array.isArray(item) ? item.length : null;
      return <div key={field} className="flex justify-between gap-4 border-b border-border py-1"><dt className="text-muted-foreground">{label}</dt><dd className="num">{count ?? "Non renseigné"}</dd></div>;
    })}</dl></div>;
  })}{annulation && <p>{risk.modifies} éléments modifiés depuis l’import · {risk.nonVerifiables} éléments non vérifiables</p>}</div>;
}

function LigneImport({ item, editable, pending, onCancel }: { item: { id: string | null; importe_le: string | null; importe_par: string | null; actif: boolean | null; annule_le: string | null; bilan: Json | null }; editable: boolean; pending: boolean; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <li className="border-t border-border text-sm"><div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"><Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start whitespace-normal px-0 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}<span>{dateMoney(item.importe_le)} · {item.actif ? "Actif" : "Annulé"} · {resumeBilan(item.bilan)}</span></Button>{item.actif && item.id && <Button variant="outline" disabled={!editable || pending} onClick={() => { if (item.id) onCancel(item.id); }}>Annuler cet import</Button>}</div>{open && <div className="pb-3"><p className="break-words text-xs text-muted-foreground">Auteur : {item.importe_par ?? "Non renseigné"}{!item.actif && ` · Annulé le ${dateMoney(item.annule_le)}`}</p><BilanImport value={item.bilan} /></div>}</li>;
}

export function RepriseMoney() {
  const imports = useVueMoney("ml_imports_v1"); const importer = useActionMoney("oia_importer_sauvegarde");
  const preview = useActionMoney("oia_apercu_annulation"); const cancel = useActionMoney("oia_annuler_import");
  const [backup, setBackup] = useState<Json | null>(null); const [counts, setCounts] = useState<Record<string, number> | null>(null); const [error, setError] = useState<string | null>(null); const [target, setTarget] = useState<string | null>(null);
  const editable = ["owner", "editor", "proprietaire", "editeur"].includes(imports.acces.data ?? "");
  const risk = risqueAnnulation(preview.data);
  const [confirmed, setConfirmed] = useState(false);
  return <Section titre="Reprendre le travail de l'ancienne console"><p className="mb-5 text-sm text-muted-foreground">Ce fichier vient du bouton de sauvegarde de l'ancienne console. Rien n'est effacé de ton navigateur. Tu peux annuler l'import ensuite.</p>
    <label className="block text-sm">Fichier de sauvegarde JSON<input aria-label="Fichier de sauvegarde JSON" type="file" accept=".json,application/json" className="my-3 block max-w-full text-sm" onChange={async (event) => {
      setBackup(null); setCounts(null); setError(null); importer.reset(); const file = event.target.files?.[0]; if (!file) return;
      try { const parsed: unknown = JSON.parse(await file.text()); setCounts(apercuSauvegarde(parsed)); setBackup(parsed as Json); } catch (e) { setError(e instanceof Error ? e.message : "Fichier non reconnu."); }
    }} /></label>
    {counts && <dl className="my-4 grid grid-cols-2 gap-2 text-sm">{Object.entries(counts).map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-border py-2"><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>}
    <Button disabled={!backup || !editable || importer.isPending || importer.isSuccess} onClick={() => { if (backup) importer.mutate({ p_espace: ESPACE_OIA, p_sauvegarde: backup }); }}>{importer.isPending ? "Import…" : "Importer dans l'espace OIA"}</Button>
    {!editable && !imports.acces.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Ton compte n'a pas le droit d'écriture dans l'espace OIA (rôle actuel : {imports.acces.data || "aucun"}). Il faut le rôle propriétaire ou éditeur.</p>}
    {editable && !backup && !error && <p className="mt-3 text-sm text-muted-foreground">Choisis d'abord le fichier de sauvegarde pour activer l'import.</p>}
    {(error || importer.error) && <p role="alert" className="mt-3 text-sm text-block">{error || importer.error?.message}</p>}
    {importer.isSuccess && <div role="status"><h3 className="mt-5 text-sm">Bilan de l'import</h3><BilanImport value={importer.data} /></div>}
    <h3 className="mb-3 mt-8 text-base">Historique des imports</h3><EtatMoney loading={imports.isPending || imports.isFetching} error={imports.error} empty={!imports.data?.length} message="Aucun import dans cet espace." retry={imports.refetch}><ul>{imports.data?.map((item) => <LigneImport key={item.id} item={item} editable={editable} pending={preview.isPending || cancel.isPending} onCancel={(id) => { setTarget(id); setConfirmed(false); cancel.reset(); preview.reset(); preview.mutate({ p_import: id }); }} />)}</ul></EtatMoney>
    {target && <div className="mt-6 border-t border-border pt-5" role="region" aria-label="Confirmation d'annulation"><h3 className="text-base">Aperçu de l'annulation</h3>{preview.isPending && <p role="status">Chargement de l'aperçu…</p>}{preview.error && <p role="alert">{preview.error.message}</p>}{preview.isSuccess && !cancel.isSuccess && <><BilanImport value={preview.data} annulation />{(risk.modifies > 0 || risk.nonVerifiables > 0) && <label className="my-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />Je confirme la suppression de {risk.modifies} éléments modifiés et de {risk.nonVerifiables} éléments non vérifiables.</label>}<div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!editable || cancel.isPending || ((risk.modifies > 0 || risk.nonVerifiables > 0) && !confirmed)} onClick={() => cancel.mutate({ p_import: target, p_confirmer_modifications: confirmed }, { onError: (failure) => { if (failure.code === "55000") { setConfirmed(false); preview.reset(); preview.mutate({ p_import: target }); } } })}>Confirmer l'annulation</Button><Button variant="ghost" disabled={cancel.isPending} onClick={() => { setTarget(null); setConfirmed(false); preview.reset(); cancel.reset(); }}>Conserver cet import</Button></div></>}{cancel.error && <p role="alert" className="my-3 text-sm text-block">{cancel.error.message}</p>}{cancel.isSuccess && <div role="status" className="mt-3 text-sm">Import annulé.</div>}</div>}
  </Section>;
}