import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/oia/ui";
import { useContexte } from "@/lib/shyrka-contexte";
import { useShyrka } from "@/components/oia/shyrka";
import type { Palier } from "@/lib/donnees/shyrka";
import { useShyrkaDonnees } from "@/lib/donnees/provider";
import { MODES_PRESENCE } from "@/lib/shyrka-locale";

export function BarreContexte() {
  const c = useContexte(); const s = useShyrka();
  const exporter = () => {
    const data = JSON.stringify({ exporte: new Date().toISOString(), contexte: c.elements, sources: c.sources, permissions: c.permissions, cadre: c.cadre, journal: { actions: s.actions, decisions: s.decisions } }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "contexte-shyrka.json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  return <div className="mb-4 flex flex-wrap items-center gap-3"><Button variant="outline" className="min-h-11 font-normal" onClick={exporter}>Exporter mon contexte</Button>
    <label className="flex min-h-11 items-center gap-2 text-sm"><Switch checked={c.prive} onCheckedChange={c.setPrive} aria-describedby="prive-aide" />Mode privé</label>
    <span id="prive-aide" className="text-xs text-tertiary">{c.prive ? "Shyrka n'apprend rien pendant cette session." : "Shyrka propose ce qu'elle apprend, à valider."}</span>
    <PresenceControle /></div>;
}

/** Mode de présence du Mac, toujours visible : seul (tout), entre proches (public, interne), avec un externe (public). Aussi à la voix. */
export function PresenceControle() {
  const { presence, changerPresence } = useShyrka();
  if (!presence) return null;
  const aide = { seul: "Tout est visible.", entre_proches: "Public et interne seulement.", externe: "Public seulement." }[presence];
  return <div role="group" aria-label="Mode de présence" className="flex flex-wrap items-center gap-1 sm:ml-auto">
    <span className="mr-1 text-xs text-tertiary">Présence</span>
    {MODES_PRESENCE.map(([m, l]) => <Button key={m} size="sm" variant={presence === m ? "default" : "outline"} aria-pressed={presence === m} className="min-h-11 font-normal" onClick={() => changerPresence(m)}>{l}</Button>)}
    <span className="ml-1 text-xs text-tertiary" aria-live="polite">{aide}</span>
  </div>;
}

const statutDot = { "À valider": "bg-warn", "Validé": "bg-ok", "Retiré": "bg-track" } as const;
export function ContexteVue() {
  const { categoriesContexte } = useShyrkaDonnees();
  const c = useContexte(); const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  return <div className="grid gap-6">{categoriesContexte.map((cat) => { const items = c.elements.filter((e) => e.categorie === cat); return <Section key={cat} titre={cat} aside={<span className="num text-sm text-tertiary">{items.length}</span>}>
    {items.length === 0 ? <p className="text-sm text-muted-foreground">Rien pour l'instant.</p> : <ul>{items.map((e) => <li key={e.id} className="border-b border-border py-3 last:border-0">
      {edition?.id === e.id ? <form className="flex flex-wrap gap-2" onSubmit={(ev) => { ev.preventDefault(); c.maj(e.id, { texte: edition.texte, statut: "Validé", source: "Correction de Mickaël" }); setEdition(null); }}><label className="sr-only" htmlFor={`edit-${e.id}`}>Corriger</label><input id={`edit-${e.id}`} className="min-h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={edition.texte} onChange={(ev) => setEdition({ id: e.id, texte: ev.target.value })} /><Button type="submit" className="min-h-11">Enregistrer</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setEdition(null)}>Annuler</Button></form>
        : <p className={`text-sm ${e.statut === "Retiré" ? "text-tertiary line-through" : ""}`}>{e.texte}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary"><span>{e.source} · {e.date}</span><span className="inline-flex items-center gap-1.5"><span aria-hidden className={`size-1.5 rounded-full ${statutDot[e.statut]}`} />{e.statut}</span>
        <span className="ml-auto flex flex-wrap gap-1">{e.statut !== "Validé" && <Button variant="ghost" size="sm" className="min-h-11 font-normal" onClick={() => c.maj(e.id, { statut: "Validé" })}>Valider</Button>}<Button variant="ghost" size="sm" className="min-h-11 font-normal" onClick={() => setEdition({ id: e.id, texte: e.texte })}>Corriger</Button>{e.statut !== "Retiré" && <Button variant="ghost" size="sm" className="min-h-11 font-normal" onClick={() => c.maj(e.id, { statut: "Retiré" })}>Retirer</Button>}<Button variant="ghost" size="sm" className="min-h-11 font-normal" onClick={() => c.oublier(e.id)}>Oublier</Button></span></div>
    </li>)}</ul>}</Section>; })}</div>;
}

export function SourcesVue() {
  const { sourcesShyrka } = useShyrkaDonnees();
  const c = useContexte();
  return <Section titre="Ce que Shyrka peut lire">{sourcesShyrka.map((s) => <label key={s.id} className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-3 text-sm last:border-0"><span><span className="block">{s.nom}</span><span className="block text-xs text-tertiary">Périmètre : {s.perimetre}</span></span><Switch checked={!!c.sources[s.id]} onCheckedChange={() => c.basculerSource(s.id)} /></label>)}</Section>;
}

export function PermissionsVue() {
  const { canaux, categoriesPermission, paliers } = useShyrkaDonnees();
  const c = useContexte();
  return <Section titre="Paliers par canal et par catégorie" aside={<span className="text-xs text-tertiary">Tout est fermé par défaut</span>}><p className="mb-4 text-xs text-tertiary">Seul Mickaël peut changer ces paliers. Paliers : {paliers.join(", ")}.</p><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-tertiary"><tr className="border-b border-border"><th className="py-2 pr-3 font-normal">Canal</th>{categoriesPermission.map((k) => <th key={k} className="pr-3 font-normal">{k}</th>)}</tr></thead><tbody>{canaux.map((canal) => <tr key={canal} className="border-b border-border last:border-0"><td className="py-2 pr-3">{canal}</td>{categoriesPermission.map((k) => { const cle = `${canal}|${k}`; return <td key={k} className="pr-3"><select aria-label={`${canal}, ${k}`} className="min-h-11 rounded-md border border-border bg-background px-2 text-sm text-muted-foreground" value={c.permissions[cle] ?? "Aucun"} onChange={(e) => c.setPermission(cle, e.target.value as Palier)}>{paliers.map((p) => <option key={p}>{p}</option>)}</select></td>; })}</tr>)}</tbody></table></div></Section>;
}

export function CadreVue() {
  const c = useContexte(); const [t, setT] = useState(c.cadre); const [ok, setOk] = useState(false);
  return <Section titre="Cadre de Shyrka"><label htmlFor="cadre" className="sr-only">Texte du cadre</label><Textarea id="cadre" rows={8} value={t} onChange={(e) => { setT(e.target.value); setOk(false); }} className="text-sm leading-relaxed" /><div className="mt-3 flex items-center gap-3"><Button className="min-h-11" onClick={() => { c.setCadre(t); setOk(true); }}>Enregistrer le cadre</Button>{ok && <span role="status" className="text-xs text-muted-foreground">Cadre enregistré dans ce navigateur.</span>}</div></Section>;
}

export function IdentiteVue() {
  const { identite } = useShyrkaDonnees();
  return <div className="grid gap-6"><Section titre="Identité actuelle" aside={<span className="text-xs text-tertiary">Lecture seule</span>}><dl className="grid gap-4 text-sm">{([["Apparence", identite.apparence], ["Voix", identite.voix], ["Personnalité", identite.personnalite]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-tertiary">{k}</dt><dd className="mt-1">{v}</dd></div>)}</dl><p className="mt-4 text-xs text-tertiary">C'est Shyrka qui fait évoluer son identité.</p></Section>
    <Section titre="Historique des versions"><ol>{identite.versions.map((v) => <li key={v.version} className="grid grid-cols-[4rem_7rem_1fr] gap-3 border-b border-border py-2.5 text-sm last:border-0"><span className="num">{v.version}</span><span className="num text-tertiary">{v.date}</span><span className="text-muted-foreground">{v.note}</span></li>)}</ol></Section></div>;
}

export function ApplicationsVue() {
  const { applications } = useShyrkaDonnees();
  return <Section titre="Où Shyrka est présente">{applications.map((a) => <div key={a.nom} className="grid gap-1 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[10rem_1fr_1fr] sm:gap-4"><span>{a.nom}<span className="block text-xs text-tertiary">{a.etat}</span></span><span className="text-muted-foreground"><span className="block text-xs text-tertiary">Peut lire</span>{a.lire}</span><span className="text-muted-foreground"><span className="block text-xs text-tertiary">Peut faire</span>{a.faire}</span></div>)}</Section>;
}
