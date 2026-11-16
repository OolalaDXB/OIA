/**
 * Base du moteur par l'API de Supabase (PostgREST), sans mot de passe de base : les fonctions
 * `vis_moteur_*` de la 0011 sont appelées en `POST /rest/v1/rpc/<fonction>` avec la clé de
 * service du projet. PostgREST pose alors le rôle `service_role`, celui qu'exige
 * `vis_ui.exiger_moteur()`, sans auth.uid() : c'est le même contrôle que par psql.
 *
 * Utilisée quand le moteur tourne dans le dépôt (GitHub Actions, `.github/workflows/visibility-moteur.yml`),
 * avec les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` déjà employés par Money Lookup.
 * Les valeurs passent dans le corps de la requête, jamais dans l'adresse. Une erreur ne cite que
 * le message de la base, jamais la requête.
 */
import type {
  AlerteMoteur,
  Demande,
  EngineDb,
  EstimationFenetre,
  GoEnBase,
  JourConsigne,
  PageMoteur,
  PreuveBase,
  PropositionMoteur,
  StatutFenetre,
  SujetEnBase,
} from "./db.js";

export type RestFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class RestEngineDb implements EngineDb {
  private readonly base: string;
  constructor(url: string, private readonly key: string, private readonly fetcher: RestFetch = globalThis.fetch as unknown as RestFetch) {
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/.test(url)) throw new Error("SUPABASE_URL refusée : adresse https du projet attendue");
    if (!key || key.length < 20) throw new Error("clé de service absente");
    this.base = url.replace(/\/$/, "");
  }

  private async rpc<T>(fn: string, params: Record<string, unknown>): Promise<T | null> {
    if (!/^vis_moteur_[a-z_]+$/.test(fn)) throw new Error(`fonction refusée : ${fn}`);
    const res = await this.fetcher(`${this.base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      // Clé secrète récente (sb_secret_…) : en-tête apikey seulement, la passerelle pose le rôle
      // service_role. Ancienne clé service_role (un JWT, « eyJ… ») : aussi en Authorization.
      headers: {
        apikey: this.key,
        ...(this.key.startsWith("eyJ") ? { Authorization: `Bearer ${this.key}` } : {}),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params),
    });
    const text = await res.text();
    if (!res.ok) {
      let m = `requête en échec (HTTP ${res.status})`;
      try {
        const e = JSON.parse(text) as { message?: string; code?: string };
        if (e.message) m = e.code ? `${e.message} (${e.code})` : e.message;
      } catch {
        /* corps illisible : message générique */
      }
      throw new Error(m);
    }
    if (text.trim() === "") return null;
    return JSON.parse(text) as T;
  }

  prendre(hote: string) {
    return this.rpc<Demande>("vis_moteur_prendre", { p_hote: hote });
  }
  async terminer(demande: string, resultat: Record<string, unknown> | null, erreur: string | null) {
    await this.rpc("vis_moteur_terminer", { p_demande: demande, p_resultat: resultat, p_erreur: erreur });
  }
  async signe(hote: string, version: string, prochain: Date) {
    await this.rpc("vis_moteur_signe", { p_hote: hote, p_version: version, p_prochain: prochain.toISOString() });
  }
  sujet(subjectId: string) {
    return this.rpc<SujetEnBase>("vis_moteur_sujet", { p_subject: subjectId });
  }
  go(subjectId: string, windowId: string) {
    return this.rpc<GoEnBase>("vis_moteur_go", { p_subject: subjectId, p_window: windowId });
  }
  async proposer(p: PropositionMoteur) {
    return Number(await this.rpc<number>("vis_moteur_proposer", { p_subject: p.subject_id, p_id: p.id, p_nature: p.nature, p_contenu: p.contenu, p_source: p.source || null }));
  }
  async estimer(e: EstimationFenetre) {
    await this.rpc("vis_moteur_estimer", {
      p_subject: e.subject_id,
      p_window: e.window_id,
      p_nature: e.nature,
      p_libelle: e.libelle,
      p_compare_avec: e.compare_avec || null,
      p_jours: e.jours_prevus,
      p_questions: e.questions,
      p_moteurs: e.moteurs,
      p_cout_usd: e.cout_estime_usd,
      p_detail: e.detail_estimation,
      p_heure_utc: e.heure_utc || null,
    });
  }
  async fenetre(subjectId: string, windowId: string, statut: StatutFenetre, debut: string | null) {
    await this.rpc("vis_moteur_fenetre", { p_subject: subjectId, p_window: windowId, p_statut: statut, p_debut: debut || null });
  }
  async consignerJour(j: JourConsigne) {
    await this.rpc("vis_moteur_jour", { p_subject: j.subject_id, p_window: j.window_id, p_jour: j.jour, p_date: j.date, p_etat: j.etat, p_detail: j.detail });
  }
  async preuves(rows: PreuveBase[]) {
    // Par paquets bornés, comme par psql.
    let added = 0;
    let batch: PreuveBase[] = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      added += Number(await this.rpc<number>("vis_moteur_preuves", { p_preuves: batch }));
      batch = [];
      size = 0;
    };
    for (const r of rows) {
      const n = JSON.stringify(r).length;
      if (size + n > 200_000) await flush();
      batch.push(r);
      size += n;
    }
    await flush();
    return added;
  }
  async page(p: PageMoteur) {
    return String(await this.rpc<string>("vis_moteur_page", { p_subject: p.subject_id, p_window: p.window_id, p_nature: p.nature, p_langue: p.langue, p_html: p.html }));
  }
  async recommandation(subjectId: string, windowId: string, rec: Record<string, unknown>) {
    return (await this.rpc<boolean>("vis_moteur_recommandation", { p_subject: subjectId, p_window: windowId, p_recommandation: rec })) === true;
  }
  async auditDebut(demande: string) {
    return String(await this.rpc<string>("vis_moteur_audit_debut", { p_demande: demande }));
  }
  async auditResultat(demande: string, r: Record<string, unknown>) {
    return String(await this.rpc<string>("vis_moteur_audit_resultat", { p_demande: demande, p_resultat: r }));
  }
  async classerEntites(subjectId: string, entites: { entite: string; nature: string }[]) {
    return Number(await this.rpc<number>("vis_moteur_classer_entites", { p_subject: subjectId, p_entites: entites }));
  }
  async noteDebut(demande: string) {
    const r = await this.rpc<{ note_id: string; depot: string | null; cout_max_usd: number }>("vis_moteur_note_debut", { p_demande: demande });
    if (!r) throw new Error("note refusée : réponse vide");
    return r;
  }
  async analyse(demande: string, a: Record<string, unknown>) {
    return String(await this.rpc<string>("vis_moteur_analyse", { p_demande: demande, p_analyse: a }));
  }
  async constat(demande: string, analyseId: string | null, c: Record<string, unknown>) {
    return String(await this.rpc<string>("vis_moteur_constat", { p_demande: demande, p_analyse: analyseId, p_constat: c }));
  }
  async alerter(a: AlerteMoteur) {
    return String(await this.rpc<string>("vis_moteur_alerter", { p_client: a.client_id, p_subject: a.subject_id || null, p_gravite: a.gravite, p_type: a.type, p_message: a.message }));
  }
}

/** Base du moteur selon l'environnement : l'API (OIA_VIS_ENGINE_DB=rest, ou SUPABASE_URL et la clé sans psql configuré), sinon psql. */
export function choisirBase(env: Record<string, string | undefined>): "rest" | "psql" {
  const v = env.OIA_VIS_ENGINE_DB?.trim();
  if (v === "rest" || v === "psql") return v;
  if (v) throw new Error(`OIA_VIS_ENGINE_DB refusé : ${v} (rest ou psql)`);
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && !env.OIA_VIS_PSQL ? "rest" : "psql";
}
