import { useState } from "react";
import { useActionMoney, useVueMoney } from "@/lib/donnees/money";
import { apercuSauvegarde, ESPACE_OIA, dateMoney } from "@/lib/money-contrat";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/oia/ui";
import { EtatMoney, ResultatJson } from "./money-commun";

export function RepriseMoney() {
  const imports = useVueMoney("ml_imports_v1"); const importer = useActionMoney("oia_importer_sauvegarde");
  const preview = useActionMoney("oia_apercu_annulation"); const cancel = useActionMoney("oia_annuler_import");
  const [backup, setBackup] = useState<Json | null>(null); const [counts, setCounts] = useState<Record<string, number> | null>(null); const [error, setError] = useState<string | null>(null); const [target, setTarget] = useState<string | null>(null);
  const editable = ["owner", "editor", "proprietaire", "editeur"].includes(imports.acces.data ?? "");
  const modified = preview.data && typeof preview.data === "object" && !Array.isArray(preview.data) ? preview.data["modifies_depuis_import"] : null;
  const count = typeof modified === "number" ? modified : modified && typeof modified === "object" ? Object.values(modified).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : Array.isArray(v) ? v.length : 0), 0) : 0;
  return <Section titre="Reprendre le travail de l'ancienne console"><p className="mb-5 text-sm text-muted-foreground">Ce fichier vient du bouton de sauvegarde de l'ancienne console. Rien n'est effacé de ton navigateur. Tu peux annuler l'import ensuite.</p>
    <label className="block text-sm">Fichier de sauvegarde JSON<input aria-label="Fichier de sauvegarde JSON" type="file" accept=".json,application/json" className="my-3 block max-w-full text-sm" onChange={async (event) => {
      setBackup(null); setCounts(null); setError(null); importer.reset(); const file = event.target.files?.[0]; if (!file) return;
      try { const parsed: unknown = JSON.parse(await file.text()); setCounts(apercuSauvegarde(parsed)); setBackup(parsed as Json); } catch (e) { setError(e instanceof Error ? e.message : "Fichier non reconnu."); }
    }} /></label>
    {counts && <dl className="my-4 grid grid-cols-2 gap-2 text-sm">{Object.entries(counts).map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-border py-2"><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>}
    <Button disabled={!backup || !editable || importer.isPending} onClick={() => { if (backup) importer.mutate({ p_espace: ESPACE_OIA, p_sauvegarde: backup }); }}>{importer.isPending ? "Import…" : "Importer dans l'espace OIA"}</Button>
    {(error || importer.error) && <p role="alert" className="mt-3 text-sm text-block">{error || importer.error?.message}</p>}
    {importer.isSuccess && <div role="status"><h3 className="mt-5 text-sm">Bilan de l'import</h3><ResultatJson value={importer.data} /></div>}
    <h3 className="mb-3 mt-8 text-base">Historique des imports</h3><EtatMoney loading={imports.isPending || imports.isFetching} error={imports.error} empty={!imports.data?.length} message="Aucun import dans cet espace." retry={imports.refetch}><ul>{imports.data?.map((item) => <li key={item.id} className="border-t border-border py-4 text-sm"><p>{dateMoney(item.importe_le)} · auteur : {item.importe_par} · {item.actif ? "Actif" : `Annulé le ${dateMoney(item.annule_le)}`}</p><ResultatJson value={item.bilan} />{item.actif && item.id && <Button variant="outline" disabled={preview.isPending} onClick={() => { if (!item.id) return; setTarget(item.id); cancel.reset(); preview.mutate({ p_import: item.id }); }}>Annuler cet import</Button>}</li>)}</ul></EtatMoney>
    {target && <div className="mt-6 border-t border-border pt-5" role="region" aria-label="Confirmation d'annulation"><h3 className="text-base">Aperçu de l'annulation</h3>{preview.isPending && <p role="status">Chargement de l'aperçu…</p>}{preview.error && <p role="alert">{preview.error.message}</p>}{preview.isSuccess && <><ResultatJson value={preview.data} /><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate({ p_import: target })}>Confirmer l'annulation</Button><Button variant="ghost" onClick={() => { setTarget(null); preview.reset(); cancel.reset(); }}>Conserver cet import</Button></div></>}{cancel.error && <p role="alert" className="my-3 text-sm text-block">{cancel.error.message}</p>}{cancel.error?.code === "55000" && <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate({ p_import: target, p_confirmer_modifications: true })}>Supprimer aussi les {count} éléments modifiés depuis l'import</Button>}{cancel.isSuccess && <p role="status" className="mt-3 text-sm">Import annulé.<ResultatJson value={cancel.data} /></p>}</div>}
  </Section>;
}