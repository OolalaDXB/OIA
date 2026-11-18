import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, Statut } from "@/components/oia/ui";
import { FaviconSource } from "@/components/oia/identites";
import { libelleVisibility } from "@/components/oia/visibility-ui";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { dollars, type LignePilotage } from "@/lib/donnees/visibility-pilotage";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { erreurTronquee, libelleTypeDemande, peutRelancer } from "@/lib/donnees/visibility-plan";

export const etiquettesEtapes: Record<string, string> = {
  demande: "Demandé", audit_en_cours: "Audit en cours", a_valider: "À valider",
  reconnaissance_en_cours: "Reconnaissance en cours", concurrents_a_valider: "Concurrents à valider",
  pret_pour_go: "Prêt pour le GO", mesure_en_cours: "Mesure en cours", rapport_a_valider: "Rapport à valider",
  actions_en_cours: "Actions en cours", remesure_proposee: "Remesure proposée", bloque: "Bloqué",
};
const quiLabel: Record<string, string> = { mickael: "Mickaël", client: "Client", moteur: "Moteur" };
const peutGerer = (role: string | null) => role === "owner" || role === "approver";

export function ErreurGeste({ erreur }: { erreur: string | null }) {
  return erreur ? <p role="alert" className="mt-3 text-sm text-block">{erreur}</p> : null;
}
export function ChargementPilotage({ children, sujet = false }: { children: ReactNode; sujet?: boolean }) {
  const { globalQuery, sujetQuery } = useVisibilityPilotage();
  const q = sujet ? sujetQuery : globalQuery;
  if (q.isPending) return <p role="status" className="border-t border-border py-8 text-sm text-muted-foreground">Chargement du pilotage…</p>;
  if (q.error) return <div role="alert" className="border-t border-border py-8"><p className="text-sm text-block">{q.error.message}</p><Button variant="outline" className="mt-4 min-h-11" onClick={() => void q.refetch()}>Réessayer</Button></div>;
  return children;
}

export function BandeauMoteur() {
  const { connecte, global } = useVisibilityPilotage();
  if (!connecte || !global) return null;
  const m = global.moteur[0];
  const etat = m?.etat ?? "muet";
  const muet = etat === "muet";
  return <div role={muet ? "alert" : "status"} className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3 text-sm">
    <Statut etat={muet ? "bloquant" : etat === "en_retard" ? "verifier" : "conforme"} label={`Moteur ${libelleVisibility(etat).toLocaleLowerCase("fr-FR")}`} />
    <span className="text-muted-foreground">{muet ? "Les mesures ne tournent pas : le moteur n'est pas encore installé." : `${m?.hote ?? "Hôte non fourni"} · ${global.moteur[0]?.demandes_en_file ?? 0} demande(s) en file`}</span>
    <Link to="/visibility/$onglet" params={{ onglet: "activite" }} className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">Activité du moteur</Link>
  </div>;
}

export function ClocheAlertes() {
  const { connecte, global } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const [ouvert, setOuvert] = useState(false);
  if (!connecte || !global) return null;
  const alertes = global.alertes.filter((a) => !a.acquittee_le);
  return <div className="relative">
    <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Alertes Visibility, ${alertes.length} ouverte(s)`} aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}><Bell aria-hidden="true" />{alertes.length > 0 && <span className="num absolute right-0 top-0 rounded-sm bg-muted px-1 text-[10px]">{alertes.length}</span>}</Button>
    {ouvert && <div className="absolute right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-card">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-sm">Alertes</h2><Button variant="ghost" size="icon" className="size-11" aria-label="Fermer les alertes" onClick={() => setOuvert(false)}><ChevronDown aria-hidden="true" /></Button></div>
      {alertes.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Aucune alerte ouverte.</p> : <ul>{alertes.map((a) => <li key={a.id ?? `${a.type}-${a.cree_le}`} className="border-t border-border py-3 text-sm">
        <Statut etat={a.gravite === "bloquant" ? "bloquant" : a.gravite === "alerte" ? "verifier" : "conforme"} label={a.type ?? "Alerte"} />
        <p className="mt-2">{a.message}</p><p className="mt-1 text-xs text-tertiary">{a.subject_id ?? a.client_id}</p>
        {a.type === "MOTEUR_MUET" ? <p className="mt-2 text-xs text-tertiary">Cette alerte reste ouverte tant que le moteur est muet.</p> : <Button variant="outline" className="mt-2 min-h-11" disabled={geste.enCours || !a.id} onClick={async () => { if (!a.id) return; try { await geste.executer("vis_acquitter_alerte", { p_alerte: a.id }); } catch { /* message affiché ci-dessous */ } }}>Acquitter</Button>}
      </li>)}</ul>}
      <ErreurGeste erreur={geste.erreur} />
    </div>}
  </div>;
}

export function FormulaireSite({ clients, onFerme }: { clients: { id: string; nom: string }[]; onFerme: () => void }) {
  const geste = useGesteVisibility();
  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const client = String(f.get("client") ?? "nouveau");
    const params = {
      p_url: String(f.get("url") ?? ""), p_nom: String(f.get("nom") ?? ""),
      p_langues: String(f.get("langues") ?? "").split(",").map((v) => v.trim()).filter(Boolean),
      p_marches: String(f.get("marches") ?? "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean),
      p_client_id: client === "nouveau" ? null : client,
      p_client_nom: client === "nouveau" ? String(f.get("client_nom") ?? "") : null,
    } as unknown as Parameters<typeof geste.executer<"vis_demander_site">>[1];
    try { await geste.executer("vis_demander_site", params); onFerme(); } catch { /* erreur RPC conservée */ }
  }
  return <form className="mb-6 grid gap-4 rounded-md border border-border p-5" onSubmit={soumettre}>
    <h2 className="text-base">Ajouter un site</h2>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-xs text-tertiary">Adresse https<Input className="min-h-11" name="url" type="url" pattern="https://.*" placeholder="https://exemple.fr" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Nom de la marque<Input className="min-h-11" name="nom" required maxLength={160} /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Langues, séparées par des virgules<Input className="min-h-11" name="langues" defaultValue="fr, en" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Marchés, séparés par des virgules<Input className="min-h-11" name="marches" defaultValue="FR, AE" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Client<FiltreSelect name="client" defaultValue="nouveau"><option value="nouveau">Nouveau client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</FiltreSelect></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Nom du nouveau client<Input className="min-h-11" name="client_nom" maxLength={160} /></label>
    </div>
    <p className="text-xs text-tertiary">Pour un client existant, le nom du nouveau client est ignoré. La base vérifie vos droits et l'adresse publique.</p>
    <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={geste.enCours}>{geste.enCours ? "Demande en cours…" : "Demander l'ajout"}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={onFerme}>Annuler</Button></div>
    <ErreurGeste erreur={geste.erreur} />
  </form>;
}

export function PortefeuilleVisibility() {
  const { global } = useVisibilityPilotage();
  const selection = useSelectionVisibility();
  const [ajout, setAjout] = useState(false);
  const lignes = global?.portefeuille ?? [];
  const clients = [...new Map(lignes.filter((l) => l.client_id).map((l) => [l.client_id!, { id: l.client_id!, nom: l.client_nom || l.client_id! }])).values()];
  return <ChargementPilotage><BandeauMoteur />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Chaque ligne indique la prochaine action et la personne concernée.</p><Button id="ajouter-un-site" className="min-h-11 scroll-mt-6" onClick={() => setAjout((v) => !v)}><Plus aria-hidden="true" />Ajouter un site</Button></div>
    {ajout && <FormulaireSite clients={clients} onFerme={() => setAjout(false)} />}
    <Section titre="Portefeuille" aside={<span className="num text-sm text-tertiary">{lignes.length} site(s)</span>}>
      {lignes.length === 0 ? <p className="text-sm text-muted-foreground">Aucun site dans votre portefeuille.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="text-left text-xs text-tertiary"><tr className="border-b border-border">{["Site", "Étape", "Prochaine action", "Présence non marquée", "Coût du mois", "Alertes"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead><tbody>{lignes.map((l) => {
        const etape = l.etape ?? "demande";
        return <tr key={l.subject_id} className="border-b border-border last:border-0"><td className="py-4 pr-4"><Link to="/visibility" search={{ site: l.subject_id ?? "" }} onClick={() => l.subject_id && selection.setSujetId(l.subject_id)} className="flex min-h-11 items-center gap-2.5 underline underline-offset-4"><FaviconSource source={l.site_url ?? ""} petite /><span>{l.nom || l.subject_id}<span className="block text-xs font-normal text-tertiary no-underline">{l.site_url} · {l.client_nom}</span></span></Link></td>
          <td className="pr-4"><Statut etat={etape === "bloque" ? "bloquant" : ["a_valider", "concurrents_a_valider", "rapport_a_valider"].includes(etape) ? "verifier" : "conforme"} label={etiquettesEtapes[etape] ?? libelleVisibility(etape)} />{etape === "mesure_en_cours" && <span className="num mt-1 block text-xs text-tertiary">Jour {l.jour_courant ?? "?"} sur 5</span>}</td>
          <td className="pr-4"><span>{l.prochaine_action || "Aucune action"}</span><span className="block text-xs text-tertiary">Qui : {quiLabel[l.qui ?? ""] ?? l.qui}</span></td>
          <td className="num pr-4">{l.presence_non_marquee === null ? "Non mesurable" : `${l.presence_non_marquee} %`}<span className="block text-xs text-tertiary">{l.presence_effectif ?? "Effectif non fourni"}</span></td>
          <td className="num pr-4">{dollars(l.cout_mois_usd)}<span className="block text-xs text-tertiary">Plafond : {l.plafond_mois_usd === null ? "non fixé" : dollars(l.plafond_mois_usd)}</span></td>
          <td className="num">{l.alertes_ouvertes ?? 0}<span className="block text-xs text-tertiary">{peutGerer(l.mon_role) ? libelleVisibility(l.mon_role) : "Lecture seule"}</span></td></tr>;
      })}</tbody></table></div>}
    </Section>
  </ChargementPilotage>;
}

function ErreurDemande({ erreur }: { erreur: string | null | undefined }) {
  const { court, tronquee } = erreurTronquee(erreur);
  if (!court) return <span>Aucune erreur</span>;
  if (!tronquee) return <span className="text-block">{court}</span>;
  return <details><summary className="cursor-pointer text-block">{court}</summary><p className="mt-2 whitespace-pre-wrap break-words text-block">{erreur}</p></details>;
}

export function ActiviteMoteur() {
  const { global } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const demandes = [...(global?.demandes ?? [])].sort((a, b) => (b.demande_le ?? "").localeCompare(a.demande_le ?? ""));
  return <ChargementPilotage><BandeauMoteur /><Section titre="Demandes au moteur" aside={<span className="num text-sm text-tertiary">{demandes.length}</span>}>
    {demandes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande enregistrée.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="text-left text-xs text-tertiary"><tr className="border-b border-border">{["Demande", "Sujet", "Statut", "Tentatives", "Détail", "Action"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead><tbody>{demandes.map((d) => <tr key={d.id} id={d.id ? `demande-${d.id}` : undefined} className="scroll-mt-6 border-b border-border last:border-0"><td className="py-3 pr-4">{libelleTypeDemande(d.type)}<span className="block text-xs text-tertiary">{d.demande_le}</span></td><td className="pr-4">{d.subject_id ?? "Création en attente"}</td><td className="pr-4"><Statut etat={d.statut === "FAILED" ? "bloquant" : d.statut === "QUEUED" || d.statut === "RUNNING" ? "verifier" : "conforme"} label={libelleVisibility(d.statut, "Inconnu")} /></td><td className="num pr-4">{d.tentatives ?? 0}</td><td className="max-w-md pr-4 text-xs text-muted-foreground"><ErreurDemande erreur={d.erreur} /></td><td>{d.remplacee_par ? <a href={`#demande-${d.remplacee_par}`} className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">relancée</a> : peutRelancer(d) ? <Button variant="outline" className="min-h-11" disabled={geste.enCours} onClick={async () => { try { await geste.executer("vis_relancer_demande", { p_demande: d.id! }); } catch { /* erreur affichée */ } }}>Relancer</Button> : <span className="text-xs text-tertiary">Aucune</span>}</td></tr>)}</tbody></table></div>}
    <ErreurGeste erreur={geste.erreur} />
  </Section></ChargementPilotage>;
}

function PlafondForm({ client, titre, max }: { client: string | null; titre: string; max?: number | null }) {
  const geste = useGesteVisibility();
  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const montant = Number(new FormData(e.currentTarget).get("montant"));
    try { await geste.executer("vis_fixer_plafond", { p_client: client, p_plafond_usd: montant } as unknown as Parameters<typeof geste.executer<"vis_fixer_plafond">>[1]); } catch { /* erreur affichée */ }
  }
  return <form className="border-t border-border py-4 first:border-0" onSubmit={soumettre}><h3 className="text-sm">{titre}</h3><div className="mt-3 flex flex-wrap items-end gap-3"><label className="grid gap-1.5 text-xs text-tertiary">Plafond mensuel en dollars<Input className="min-h-11 w-40" name="montant" type="number" min="0" max={max ?? undefined} step="0.01" required /></label><Button type="submit" className="min-h-11" disabled={geste.enCours}>Enregistrer le plafond</Button></div>{max !== null && max !== undefined && <p className="mt-2 text-xs text-tertiary">Maximum : {dollars(max)}</p>}<ErreurGeste erreur={geste.erreur} /></form>;
}

/** Propriétaire du client technique `oia` : seul à fixer les plafonds (vis_fixer_plafond). */
export function estProprietaireOia(budgets: Array<{ client_id?: string | null } & Record<string, unknown>>): boolean {
  return budgets.some((b) => b.client_id === "oia" && (b as { mon_role?: string | null }).mon_role === "owner");
}

export function BudgetVisibility() {
  const { global } = useVisibilityPilotage();
  // Rôle sur le client technique `oia` : sa ligne de vis_budget_v2 (mon_role), présente même sans sujet.
  const proprietaireOia = estProprietaireOia(global?.budgets ?? []);
  if (!proprietaireOia) return <Section titre="Budget"><p className="text-sm text-muted-foreground">La modification des plafonds est réservée au propriétaire du client technique OIA.</p></Section>;
  const budgets = global?.budgets ?? [];
  const globalPlafond = budgets.find((b) => b.plafond_global_usd !== null)?.plafond_global_usd ?? null;
  return <div className="grid gap-6"><Section titre="Plafonds mensuels"><p className="mb-4 text-sm text-muted-foreground">Fixez d'abord le plafond global OIA, puis le plafond de chaque client.</p><PlafondForm client={null} titre="Plafond global OIA" />{globalPlafond === null ? <p className="border-t border-border py-4 text-sm text-muted-foreground">Les plafonds clients seront disponibles après le plafond global.</p> : budgets.filter((b) => b.client_id !== "oia").map((b) => <PlafondForm key={b.client_id} client={b.client_id} titre={`Client ${b.client_id}`} max={globalPlafond} />)}</Section>
    <Section titre="État du mois">{budgets.length === 0 ? <p className="text-sm text-muted-foreground">Aucun budget pour ce mois.</p> : budgets.map((b) => <div key={b.client_id} className="grid gap-2 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-5"><span>{b.client_id}</span><span className="num">Réel : {dollars(b.reel_usd)}</span><span className="num">Engagé : {dollars(b.engage_usd)}</span><span className="num">Plafond : {b.plafond_usd === null ? "non fixé" : dollars(b.plafond_usd)}</span><Statut etat={b.etat === "atteint" ? "bloquant" : b.etat === "proche" || b.etat === "non_fixe" ? "verifier" : "conforme"} label={libelleVisibility(b.etat, "Inconnu")} /></div>)}</Section>
  </div>;
}
