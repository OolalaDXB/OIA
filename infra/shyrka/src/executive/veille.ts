import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { etatOia } from "../contexte.js";
import { RACINE_DEPOT } from "../local.js";
import { hotesAutorises, REGLAGES, type Produit } from "./config.js";
import type { Observation } from "./operations.js";

/**
 * Collecteurs de la veille (mandat v10, C2). Lecture seule, bornés en durée
 * et en taille ; aucun rerun, aucun déploiement, aucun formulaire. Un 401/403
 * est un accès manquant, pas une panne. Un contrôle non exécuté n'est jamais
 * compté comme réussi. Les sorties ne gardent aucun contenu de page.
 */

export type Executeur = (cmd: string, args: string[], timeoutMs: number) => Promise<{ code: number; stdout: string; stderr: string }>;
export const executeurReel: Executeur = (cmd, args, timeoutMs) =>
  new Promise((ok) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (err, stdout, stderr) =>
      ok({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }),
    );
  });

const obs = (p: Produit, controle: string, cible: string, o: Partial<Observation> & Pick<Observation, "etat" | "resultat" | "detail">): Observation => ({
  produit: p.slug, controle, cible, preuve: "", dateDonnee: null, ...o,
});

/** GitHub : dernier commit, checks du commit, PR ouvertes. Via `gh api` (lecture). */
export async function collecterGithub(p: Produit, run: Executeur = executeurReel): Promise<Observation[]> {
  const out: Observation[] = [];
  for (const d of p.depots) {
    const cible = `${d.repo}@${d.branche}`;
    const c = await run("gh", ["api", `repos/${d.repo}/commits/${d.branche}`, "--jq", "{sha: .sha, date: .commit.committer.date}"], 20_000);
    if (c.code !== 0) {
      const acces = /HTTP 40[134]|Not Found|Bad credentials|auth/i.test(c.stderr);
      out.push(obs(p, "github.commit", cible, { etat: acces ? "acces_manquant" : "erreur", resultat: "inconnu", detail: acces ? "dépôt inaccessible avec le jeton gh actuel" : c.stderr.trim().slice(0, 200) }));
      continue;
    }
    const { sha, date } = JSON.parse(c.stdout) as { sha: string; date: string };
    out.push(obs(p, "github.commit", cible, { etat: "actif", resultat: "ok", detail: `dernier commit ${sha.slice(0, 7)}${d.confirme ? "" : " (dépôt non confirmé)"}`, preuve: `https://github.com/${d.repo}/commit/${sha}`, dateDonnee: date }));
    const k = await run("gh", ["api", `repos/${d.repo}/commits/${sha}/check-runs`, "--jq", "[.check_runs[] | {name, status, conclusion, url: .html_url}]"], 20_000);
    if (k.code !== 0) out.push(obs(p, "github.checks", cible, { etat: /40[13]/.test(k.stderr) ? "acces_manquant" : "erreur", resultat: "inconnu", detail: "checks illisibles" }));
    else {
      const runs = JSON.parse(k.stdout || "[]") as { name: string; status: string; conclusion: string | null; url: string }[];
      const echecs = runs.filter((r) => ["failure", "timed_out", "startup_failure", "action_required"].includes(r.conclusion ?? ""));
      const enCours = runs.filter((r) => r.status !== "completed");
      out.push(
        obs(p, "github.checks", cible, {
          etat: "actif",
          resultat: runs.length === 0 ? "inconnu" : echecs.length ? "anomalie" : enCours.length ? "inconnu" : "ok",
          detail: runs.length === 0 ? "aucun check sur le dernier commit" : echecs.length ? `CI en échec : ${echecs.map((e) => e.name).join(", ")}` : enCours.length ? `${enCours.length} check(s) en cours` : `${runs.length} check(s) réussis`,
          preuve: echecs[0]?.url ?? `https://github.com/${d.repo}/commit/${sha}`,
          dateDonnee: date,
          gravite: "majeure",
          signature: `ci:${echecs.map((e) => e.name).sort().join(",")}`,
        }),
      );
    }
    const pr = await run("gh", ["api", `repos/${d.repo}/pulls?state=open&per_page=50`, "--jq", "[.[] | {n: .number, t: .title, d: .draft, u: .updated_at}]"], 20_000);
    if (pr.code === 0) {
      const prs = JSON.parse(pr.stdout || "[]") as { n: number; t: string; d: boolean; u: string }[];
      out.push(obs(p, "github.pr", cible, { etat: "actif", resultat: "ok", detail: prs.length ? `${prs.length} PR ouverte(s) : ${prs.slice(0, 5).map((x) => `#${x.n}${x.d ? " (brouillon)" : ""}`).join(", ")}` : "aucune PR ouverte", preuve: `https://github.com/${d.repo}/pulls`, dateDonnee: prs[0]?.u ?? null }));
    }
  }
  return out;
}

type Fetch = typeof globalThis.fetch;

/**
 * HTTP : un GET, sans suivre les redirections (chaque saut doit rester dans
 * la liste blanche), sans identifiants, borné en durée et en taille. Aucun
 * contenu conservé.
 */
export async function collecterHttp(p: Produit, autorises: Set<string>, f: Fetch = globalThis.fetch): Promise<Observation[]> {
  const out: Observation[] = [];
  for (const h of p.http) {
    if (!h.confirme) {
      out.push(obs(p, "http", h.url, { etat: "non_configure", resultat: "inconnu", detail: "correspondance non confirmée : non surveillée" }));
      continue;
    }
    let url = h.url;
    const sauts: string[] = [];
    const t0 = Date.now();
    try {
      for (let i = 0; i < 4; i++) {
        const host = new URL(url).host;
        if (!autorises.has(host) || new URL(url).protocol !== "https:") throw new Error(`redirection hors liste blanche : ${host}`);
        const r = await f(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(REGLAGES.delaiHttpMs), headers: { "user-agent": "OIA-Shyrka-veille/1 (lecture seule)" } });
        // On lit au plus maxOctetsHttp puis on coupe ; rien n'est conservé.
        const lecteur = r.body?.getReader();
        let lus = 0;
        while (lecteur && lus < REGLAGES.maxOctetsHttp) {
          const { done, value } = await lecteur.read();
          if (done) break;
          lus += value.byteLength;
        }
        await lecteur?.cancel().catch(() => {});
        const attendu = h.attendu ?? [];
        if (r.status >= 300 && r.status < 400 && !attendu.includes(r.status)) {
          const loc = r.headers.get("location");
          if (!loc) throw new Error(`redirection ${r.status} sans destination`);
          sauts.push(`${r.status}`);
          url = new URL(loc, url).toString();
          continue;
        }
        const ok = (r.status >= 200 && r.status < 300) || attendu.includes(r.status);
        out.push(
          obs(p, "http", h.url, {
            etat: "actif", resultat: ok ? "ok" : "anomalie", detail: `HTTP ${r.status}${sauts.length ? ` après ${sauts.join("→")}` : ""} en ${Date.now() - t0} ms`, preuve: `GET ${h.url}`,
            gravite: r.status >= 500 ? "critique" : "majeure", signature: `status:${Math.floor(r.status / 100)}xx`,
          }),
        );
        break;
      }
    } catch (e) {
      const m = (e as Error).message;
      const cause = ((e as { cause?: { code?: string } }).cause?.code ?? "") as string;
      const tls = /CERT|SSL|TLS/i.test(cause + m);
      const liste = /liste blanche/.test(m);
      out.push(
        obs(p, "http", h.url, {
          etat: liste ? "erreur" : "actif", resultat: liste ? "inconnu" : "anomalie", detail: `${tls ? "erreur de certificat" : "injoignable"} : ${cause || m}`.slice(0, 200), preuve: `GET ${h.url}`,
          gravite: tls ? "critique" : "majeure", securite: tls, signature: tls ? "tls" : "injoignable",
        }),
      );
    }
  }
  return out;
}

/** Vercel : CLI absente et MCP réservé à la session interactive → accès manquant, déclaré. */
export async function collecterVercel(p: Produit, run: Executeur = executeurReel): Promise<Observation[]> {
  if (!p.vercel.length) return [];
  const v = await run("vercel", ["--version"], 5_000);
  const detail = v.code === 0 ? "CLI Vercel présente mais non raccordée en lecture (jeton non configuré pour le service)" : "CLI Vercel absente ; le MCP Vercel n'est utilisable qu'en session interactive";
  return p.vercel.map((x) => obs(p, "vercel.deploiement", x.projet, { etat: "acces_manquant", resultat: "inconnu", detail }));
}

/** Supabase : aucune lecture des advisors sans jeton de lecture dédié (pas de clé de service) → non configuré. */
export function collecterSupabase(p: Produit): Observation[] {
  if (!p.supabase) return [];
  return [obs(p, "supabase.sante", p.supabase.ref, { etat: "non_configure", resultat: "inconnu", detail: "lecture santé/advisors non raccordée : aucun jeton de lecture dédié, pas d'accès administrateur" })];
}

/**
 * Visibility (local) : fenêtre J0, runs et preuves mesurables depuis le
 * dernier export de synchronisation. Les dénominateurs sont affichés tels
 * quels ; rien n'est réécrit.
 */
export function collecterVisibility(p: Produit, donnees = process.env.OIA_VIS_DATA ?? join(homedir(), "oia-visibility-data"), maintenant = new Date()): Observation[] {
  const out: Observation[] = [];
  const e = etatOia(RACINE_DEPOT);
  for (const f of e.fenetres) {
    out.push(obs(p, "visibility.fenetre", `${f.sujet}/${f.id}`, { etat: "actif", resultat: "ok", detail: `statut ${f.statut}${f.debut ? `, début ${f.debut}` : ""}${f.jours ? `, ${f.jours} jours` : ""}`, preuve: `infra/visibility/subjects/${f.sujet}/measurement.yaml` }));
  }
  if (!existsSync(donnees)) return [...out, obs(p, "visibility.sync", donnees, { etat: "acces_manquant", resultat: "inconnu", detail: "dossier de données Visibility absent" })];
  for (const sujet of readdirSync(donnees).filter((d) => existsSync(join(donnees, d, "sync", "export.json")))) {
    const fichier = join(donnees, sujet, "sync", "export.json");
    try {
      const x = JSON.parse(readFileSync(fichier, "utf8")) as { exportedAt: string; startedAt: string; days: number; runs: { model: string; text?: string | null }[] };
      const avecTexte = x.runs.filter((r) => (r.text ?? "").trim()).length;
      const sans = x.runs.length - avecTexte;
      const parModele = Object.entries(x.runs.filter((r) => !(r.text ?? "").trim()).reduce<Record<string, number>>((a, r) => ((a[r.model] = (a[r.model] ?? 0) + 1), a), {}))
        .map(([m, n]) => `${n} ${m}`)
        .join(", ");
      const ageH = (maintenant.getTime() - Date.parse(x.exportedAt)) / 3_600_000;
      out.push(
        obs(p, "visibility.sync", `${sujet}/export`, {
          etat: "actif",
          resultat: ageH > REGLAGES.fraicheurHeures ? "anomalie" : "ok",
          detail: `${x.runs.length} runs, ${avecTexte} preuves mesurables (avec texte)${sans ? ` ; ${sans} sans texte extrait : ${parModele}` : ""} ; export du ${x.exportedAt}${ageH > REGLAGES.fraicheurHeures ? ` (ancien : ${Math.round(ageH)} h)` : ""}`,
          preuve: fichier.replace(homedir(), "~"), dateDonnee: x.exportedAt, gravite: "mineure", signature: "sync-ancienne",
        }),
      );
    } catch (err) {
      out.push(obs(p, "visibility.sync", `${sujet}/export`, { etat: "erreur", resultat: "inconnu", detail: `export illisible : ${(err as Error).message}`.slice(0, 200) }));
    }
  }
  return out;
}

/** Money Lookup (local) : dernier chargement réussi, nombre d'opportunités, âge. Aucun montant inventé. */
export function collecterMoneyLookup(p: Produit, donnees = process.env.OIA_ML_DATA ?? join(homedir(), "oia-money-lookup"), maintenant = new Date()): Observation[] {
  const journal = join(donnees, "rafraichir.log");
  if (!existsSync(journal)) return [obs(p, "money-lookup.rafraichissement", donnees, { etat: "acces_manquant", resultat: "inconnu", detail: "journal de rafraîchissement absent" })];
  const lignes = readFileSync(journal, "utf8").trim().split("\n");
  const ok = [...lignes].reverse().find((l) => / ok : /.test(l));
  const echec = [...lignes].reverse().find((l) => /échec|erreur/i.test(l));
  if (!ok) return [obs(p, "money-lookup.rafraichissement", "rafraichir.log", { etat: "actif", resultat: "anomalie", detail: "aucun rafraîchissement réussi consigné", preuve: journal.replace(homedir(), "~"), gravite: "mineure", signature: "jamais" })];
  const date = ok.split(" ")[0]!;
  const ageH = (maintenant.getTime() - Date.parse(date)) / 3_600_000;
  const n = /(\d+) opportunités/.exec(ok)?.[1];
  const tache = existsSync(join(homedir(), "Library/LaunchAgents/com.oia.money-lookup.rafraichir.plist"));
  return [
    obs(p, "money-lookup.rafraichissement", "rafraichir.log", {
      etat: "actif",
      resultat: ageH > REGLAGES.fraicheurHeures ? "anomalie" : "ok",
      detail: `${n ?? "?"} opportunités au dernier chargement (${date}, il y a ${Math.round(ageH)} h)${echec && echec > ok ? " ; un échec plus récent est consigné" : ""}${tache ? "" : " ; tâche quotidienne non installée"}`,
      preuve: journal.replace(homedir(), "~"),
      dateDonnee: date,
      gravite: "mineure",
      signature: "ancien",
    }),
  ];
}

/** Age d'un fichier local en heures (pour la fraîcheur), ou null. */
export function ageFichierH(chemin: string, maintenant = new Date()): number | null {
  return existsSync(chemin) ? (maintenant.getTime() - statSync(chemin).mtimeMs) / 3_600_000 : null;
}

/** Une collecte bornée sur tout le portefeuille. */
export async function collecter(produits: Produit[], deps: { run?: Executeur; fetch?: Fetch; seulement?: (p: Produit) => boolean; github?: boolean } = {}): Promise<Observation[]> {
  const autorises = hotesAutorises(produits);
  const out: Observation[] = [];
  for (const p of produits.filter(deps.seulement ?? (() => true))) {
    if (deps.github !== false) out.push(...(await collecterGithub(p, deps.run)));
    out.push(...(await collecterHttp(p, autorises, deps.fetch)));
    out.push(...(await collecterVercel(p, deps.run)));
    out.push(...collecterSupabase(p));
    if (p.local?.includes("visibility")) out.push(...collecterVisibility(p));
    if (p.local?.includes("money-lookup")) out.push(...collecterMoneyLookup(p));
  }
  return out;
}
