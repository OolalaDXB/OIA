import { createHash } from "node:crypto";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { amountOf } from "@oia/workspace";

/**
 * Chargeur Money Lookup (mandat v8, A3). Il lit les sorties existantes
 * (l'instantané de la console, produit par le pipeline de découverte) sans
 * les modifier, et produit un script SQL :
 *
 *   * idempotent : rejouer le même instantané ne crée ni ligne ni doublon,
 *     et ne touche une opportunité que si son contenu a changé ;
 *   * à identifiants stables : l'identifiant d'une opportunité dérive de sa
 *     clé de veille (watch_key) ;
 *   * transactionnel : un seul begin/commit ;
 *   * réversible : chaque chargement est un lot, que sqlAnnulation retire,
 *     sauf les opportunités qui portent déjà du travail humain.
 *
 * Il ne lit et n'écrit aucune donnée humaine (décisions, notes, tâches).
 */
export const ESPACE_STUDIO = "00000000-0000-4000-8000-000000000001";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** UUID stable (forme v4) dérivé d'un texte. */
export function uuidStable(texte: string): string {
  const h = sha256(`oia:${texte}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const cleDeVeille = (r: ConsoleRecord) => r.dedupKey ?? r.id;

/** Échéance retenue : la date normalisée la plus tardive citée par la source. */
export function echeance(r: ConsoleRecord): string | null {
  const dates = (r.deadlines ?? []).map((d) => d.normalized).filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  return dates.length ? dates[dates.length - 1]! : null;
}

export interface Ligne {
  id: string;
  watch_key: string;
  record_id: string;
  title: string;
  issuer: string;
  opportunity_kind: string | null;
  official_url: string | null;
  deadline_at: string | null;
  recommendation: string;
  verification_status: string;
  info_confidence: number;
  gate_pursue_eligible: boolean;
  gate_failed_reasons: string[];
  discovered_for: string[];
  payload: ConsoleRecord;
  content_fingerprint: string;
  valeur: number | null;
  devise: string | null;
  confiance: "HAUTE" | "BASSE" | null;
  source_montant: string | null;
}

export function lignes(data: ConsoleData): Ligne[] {
  const vues = new Set<string>();
  const out: Ligne[] = [];
  for (const r of data.records) {
    const cle = cleDeVeille(r);
    if (vues.has(cle)) continue; // une clé de veille = une opportunité
    vues.add(cle);
    const montant = amountOf(r);
    const devise = montant?.currency && /^[A-Z]{3}$/.test(montant.currency) ? montant.currency : null;
    const valeur = montant && devise && montant.value > 0 ? montant.value : null;
    out.push({
      id: uuidStable(cle),
      watch_key: cle,
      record_id: r.id,
      title: r.title,
      issuer: r.issuer,
      opportunity_kind: r.opportunityKind ?? null,
      official_url: r.officialUrl ?? null,
      deadline_at: echeance(r),
      recommendation: r.recommendation,
      verification_status: r.verificationStatus,
      info_confidence: r.scores?.infoConfidence ?? 0,
      gate_pursue_eligible: r.gate?.pursueEligible ?? false,
      gate_failed_reasons: r.gate?.failedReasons ?? [],
      discovered_for: r.discoveredFor ?? [],
      payload: r,
      content_fingerprint: sha256(JSON.stringify(r)),
      // Montant inconnu = NULL, jamais zéro ; une devise illisible rend le montant inconnu.
      valeur,
      devise: valeur === null ? null : devise,
      confiance: valeur === null ? null : montant!.confidence === "HIGH" ? "HAUTE" : "BASSE",
      source_montant: valeur === null ? null : montant!.source,
    });
  }
  return out;
}

const DOLLAR = "$oia_ml$";

/** Script SQL de chargement, en une transaction. */
export function sqlChargement(data: ConsoleData, opts: { source: string; espace?: string }): { sql: string; lot: string; lignes: number } {
  const espace = opts.espace ?? ESPACE_STUDIO;
  const ls = lignes(data);
  const json = JSON.stringify(ls);
  if (json.includes(DOLLAR)) throw new Error("Données inattendues : le délimiteur SQL apparaît dans l'instantané.");
  const empreinte = sha256(json);
  const lot = uuidStable(`lot:${espace}:${empreinte}`);
  const sql = `-- Chargement Money Lookup · source ${opts.source.replace(/\n/g, " ")} · ${ls.length} opportunités · lot ${lot}
begin;
insert into public.ml_lot (id, espace_id, source, empreinte) values ('${lot}', '${espace}', ${DOLLAR}${opts.source}${DOLLAR}, '${empreinte}')
on conflict (id) do nothing;
-- Table temporaire, puis deux instructions : une insertion dans un CTE n'est pas
-- visible des autres parties de la même requête (instantané unique).
create temp table _ml_x on commit drop as
  select * from jsonb_to_recordset(${DOLLAR}${json}${DOLLAR}::jsonb) as t(
    id uuid, watch_key text, record_id text, title text, issuer text, opportunity_kind text, official_url text,
    deadline_at timestamptz, recommendation text, verification_status text, info_confidence int,
    gate_pursue_eligible boolean, gate_failed_reasons text[], discovered_for text[], payload jsonb, content_fingerprint text,
    valeur numeric, devise text, confiance text, source_montant text);
insert into public.watch_opportunities (id, watch_key, record_id, title, issuer, opportunity_kind, official_url, deadline_at,
    recommendation, verification_status, info_confidence, gate_pursue_eligible, gate_failed_reasons, discovered_for, payload,
    content_fingerprint, espace_id, lot_initial)
  select id, watch_key, record_id, title, issuer, opportunity_kind, official_url, deadline_at, recommendation, verification_status,
    info_confidence, gate_pursue_eligible, gate_failed_reasons, discovered_for, payload, content_fingerprint, '${espace}', '${lot}'
  from _ml_x
  on conflict (watch_key) do update set
    title = excluded.title, issuer = excluded.issuer, opportunity_kind = excluded.opportunity_kind, official_url = excluded.official_url,
    deadline_at = excluded.deadline_at, recommendation = excluded.recommendation, verification_status = excluded.verification_status,
    info_confidence = excluded.info_confidence, gate_pursue_eligible = excluded.gate_pursue_eligible,
    gate_failed_reasons = excluded.gate_failed_reasons, discovered_for = excluded.discovered_for, payload = excluded.payload,
    content_fingerprint = excluded.content_fingerprint, last_seen_at = now()
  where public.watch_opportunities.content_fingerprint is distinct from excluded.content_fingerprint;
insert into public.ml_montant (opportunity_id, espace_id, valeur, devise, confiance, source, lot_id)
select o.id, o.espace_id, x.valeur, x.devise, x.confiance, x.source_montant, '${lot}'
from _ml_x x join public.watch_opportunities o on o.watch_key = x.watch_key
on conflict (opportunity_id) do update set valeur = excluded.valeur, devise = excluded.devise, confiance = excluded.confiance, source = excluded.source
where (public.ml_montant.valeur, public.ml_montant.devise, public.ml_montant.confiance) is distinct from (excluded.valeur, excluded.devise, excluded.confiance);
commit;
`;
  return { sql, lot, lignes: ls.length };
}

/**
 * Retour arrière d'un lot : retire les opportunités que ce lot a créées, sauf
 * celles qui portent du travail humain (décision, note, tâche, étiquette),
 * qui restent, et le dit.
 */
export function sqlAnnulation(lot: string): string {
  if (!/^[0-9a-f-]{36}$/.test(lot)) throw new Error("Identifiant de lot invalide.");
  return `begin;
create temp table _ml_garde on commit drop as
  select o.id from public.watch_opportunities o
  where o.lot_initial = '${lot}' and (
    exists (select 1 from public.reviews r where r.espace_id = o.espace_id and r.record_id = o.record_id) or
    exists (select 1 from public.notes n where n.espace_id = o.espace_id and n.record_id = o.record_id) or
    exists (select 1 from public.tasks t where t.espace_id = o.espace_id and t.record_id = o.record_id) or
    exists (select 1 from public.project_tags g where g.espace_id = o.espace_id and g.record_id = o.record_id));
delete from public.watch_opportunities where lot_initial = '${lot}' and id not in (select id from _ml_garde);
update public.ml_lot set annule_le = now() where id = '${lot}';
select count(*) as gardees_car_travail_humain from _ml_garde;
commit;
`;
}
