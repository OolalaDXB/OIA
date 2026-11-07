import { spawnSync } from "node:child_process";
import { appliquer, creerCopie, fichiersDuDiff, empreinteDiff, supprimerCopie, type Copie } from "./copie.js";
import { executerCapacite, mesuresRoutage, type Resultat } from "./eval/registre.js";
import { horsPerimetre, interdits, type Mission } from "./missions.js";
import { envExpurge, profilBacASable } from "./verification.js";

/**
 * Vérificateur d'un patch candidat (mandat v11, B5, C2, C3). Distinct de
 * l'auteur : il ne reçoit que le patch et la mission, jamais le récit de
 * l'auteur.
 *
 * 1. Périmètre et chemins interdits, lus dans le patch lui-même.
 * 2. Copie fraîche du SHA de base (git archive, sans branche ni worktree),
 *    application du patch telle quelle.
 * 3. Commandes autorisées, mot pour mot, sous sandbox-exec, sur la copie de
 *    référence ET sur la copie candidate : seuls comptent les échecs
 *    nouveaux (les tests qui exigent le vrai volume échouent aussi sur la
 *    référence dans le bac à sable, et c'est dit).
 * 4. Banc de routage sur les trois ensembles, dont le jeu tenu à l'écart,
 *    noté par le code de main ; l'auteur n'en voit que l'agrégat.
 * 5. Garde de promotion : une régression critique annule tout progrès local.
 */

export interface Commande {
  commande: string;
  code: number;
  duree_ms: number;
  echecs: string[];
  resume: string;
}

export interface RapportCandidat {
  mission: string;
  shaBase: string;
  empreinte: string;
  fichiers: string[];
  horsPerimetre: string[];
  interdits: string[];
  application: string;
  commandes: { reference: Commande[]; candidat: Commande[] };
  nouveauxEchecs: string[];
  banc: { reference: Resultat[]; candidat: Resultat[] };
  garde: { regle: string; ok: boolean; detail: string }[];
  verdict: "conforme" | "refuse" | "echec_tests" | "rejete_banc";
  limites: string[];
}

function lancer(copie: Copie, cmd: string[], delaiMs: number): Commande {
  const t0 = Date.now();
  const r = spawnSync("sandbox-exec", ["-p", profilBacASable(copie.dossier), ...cmd], { cwd: copie.racine, env: { ...envExpurge(), TMPDIR: copie.dossier }, encoding: "utf8", timeout: delaiMs, maxBuffer: 32 * 1024 * 1024 });
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  // Un même échec apparaît sous deux formes (« × nom » et « FAIL fichier > nom ») : on garde le nom sans le fichier.
  const echecs = [...new Set([...sortie.matchAll(/^\s*(?:×|FAIL)\s+(.+?)(?:\s+\d+ms)?$/gm)].map((m) => m[1]!.trim().replace(/^[\w./-]+\.test\.ts > /, "")))];
  const resume = (sortie.match(/^\s*(Tests|Test Files)\s+.+$/gm) ?? []).map((l) => l.trim()).join(" ; ") || (sortie.match(/error TS\d+/g) ?? []).slice(0, 3).join(", ");
  return { commande: cmd.join(" "), code: r.status ?? -1, duree_ms: Date.now() - t0, echecs, resume };
}

/** Compare deux passages du banc, ensemble par ensemble, sur les familles d'une capacité. */
function comparer(ref: Resultat[], cand: Resultat[], capacite: string, ensemble: string) {
  const a = ref.find((r) => r.capacite === capacite && r.ensemble === ensemble);
  const b = cand.find((r) => r.capacite === capacite && r.ensemble === ensemble);
  return { a, b, ka: a?.mesures.exactitude?.k ?? 0, kb: b?.mesures.exactitude?.k ?? 0, n: b?.compteurs.n ?? 0 };
}

export function verifierCandidat(m: Mission, patch: string, opts: { executer?: boolean; delaiMs?: number; seuilTenu?: number } = {}): RapportCandidat {
  const fichiers = fichiersDuDiff(patch);
  const empreinte = empreinteDiff(patch);
  const rapport: RapportCandidat = {
    mission: m.id, shaBase: m.shaBase, empreinte, fichiers, horsPerimetre: horsPerimetre(fichiers, m.perimetre), interdits: interdits(fichiers), application: "non tentée",
    commandes: { reference: [], candidat: [] }, nouveauxEchecs: [], banc: { reference: [], candidat: [] }, garde: [], verdict: "conforme",
    limites: ["les tests qui exigent le vrai volume ou un bac à sable imbriqué échouent aussi sur la référence : seuls les échecs nouveaux comptent"],
  };
  if (!fichiers.length || rapport.horsPerimetre.length || rapport.interdits.length) {
    rapport.verdict = "refuse";
    rapport.garde.push({ regle: "périmètre", ok: false, detail: !fichiers.length ? "patch vide" : `hors périmètre : ${[...rapport.horsPerimetre, ...rapport.interdits].join(", ")}` });
    return rapport;
  }
  rapport.garde.push({ regle: "périmètre", ok: true, detail: `${fichiers.length} fichier(s) dans le périmètre, 0 interdit` });
  const reference = creerCopie(m.shaBase);
  const candidat = creerCopie(m.shaBase);
  try {
    const a = appliquer(candidat, patch);
    rapport.application = a.detail;
    if (!a.ok) {
      rapport.verdict = "refuse";
      rapport.garde.push({ regle: "application", ok: false, detail: a.detail });
      return rapport;
    }
    if (opts.executer === false) return rapport;
    for (const c of m.perimetre.commandes) {
      rapport.commandes.reference.push(lancer(reference, c, opts.delaiMs ?? 600_000));
      rapport.commandes.candidat.push(lancer(candidat, c, opts.delaiMs ?? 600_000));
    }
    let echecsRef = new Set(rapport.commandes.reference.flatMap((c) => c.echecs));
    rapport.nouveauxEchecs = [...new Set(rapport.commandes.candidat.flatMap((c) => c.echecs))].filter((e) => !echecsRef.has(e));
    if (rapport.nouveauxEchecs.length) {
      // Un échec nouveau est rejoué une fois sur les deux copies : il ne compte que s'il échoue de nouveau
      // sur le candidat et jamais sur la référence. Sinon il est déclaré instable (et non ignoré en silence).
      const ref2 = m.perimetre.commandes.map((c) => lancer(reference, c, opts.delaiMs ?? 600_000));
      const cand2 = m.perimetre.commandes.map((c) => lancer(candidat, c, opts.delaiMs ?? 600_000));
      echecsRef = new Set([...echecsRef, ...ref2.flatMap((c) => c.echecs)]);
      const encore = new Set(cand2.flatMap((c) => c.echecs));
      const instables = rapport.nouveauxEchecs.filter((e) => echecsRef.has(e) || !encore.has(e));
      rapport.nouveauxEchecs = rapport.nouveauxEchecs.filter((e) => !instables.includes(e));
      if (instables.length) rapport.limites.push(`test(s) instable(s) dans le bac à sable, rejoués une fois et écartés : ${instables.join(" | ")}`);
    }
    const typecheckCasse = rapport.commandes.candidat.some((c, i) => c.code !== 0 && rapport.commandes.reference[i]!.code === 0 && c.echecs.length === 0);
    rapport.garde.push({ regle: "tests et typecheck sans échec nouveau", ok: rapport.nouveauxEchecs.length === 0 && !typecheckCasse, detail: rapport.nouveauxEchecs.length ? rapport.nouveauxEchecs.join(" | ").slice(0, 600) : typecheckCasse ? "une commande échoue sans échec de test nommé (typecheck ?)" : `référence : ${rapport.commandes.reference.map((c) => c.resume).join(" / ")} ; candidat : ${rapport.commandes.candidat.map((c) => c.resume).join(" / ")}` });
    if (!rapport.garde.at(-1)!.ok) {
      rapport.verdict = "echec_tests";
      return rapport;
    }
    // Banc : le code de main note la copie de référence et la copie candidate, à l'identique.
    rapport.banc.reference = executerCapacite("routage.decisions", { code: reference.racine, candidat: `reference:${m.shaBase.slice(0, 12)}` });
    rapport.banc.candidat = executerCapacite("routage.decisions", { code: candidat.racine, candidat: empreinte });
    const seuil = opts.seuilTenu ?? 0.95;
    for (const ensemble of ["developpement", "regression", "tenu"]) {
      const { a, b, ka, kb, n } = comparer(rapport.banc.reference, rapport.banc.candidat, "routage.decisions", ensemble);
      if (!b) {
        rapport.garde.push({ regle: `banc ${ensemble}`, ok: false, detail: "non exécuté" });
        continue;
      }
      const fp = b.compteurs.fauxPositifsListe ?? 0;
      if (ensemble === "tenu") {
        const ok = n > 0 && kb / n >= seuil && fp === 0 && kb >= ka;
        rapport.garde.push({ regle: "généralisation (tenu à l'écart)", ok, detail: `${kb}/${n} (référence ${ka}/${n}), ${fp} faux positif(s) de liste ; seuil ${seuil}, 0 faux positif` });
      } else {
        const ok = kb >= ka && fp <= (a?.compteurs.fauxPositifsListe ?? 0);
        rapport.garde.push({ regle: `non-régression ${ensemble}`, ok, detail: `${kb}/${n} (référence ${ka}/${n}), ${fp} faux positif(s)` });
      }
    }
    const cont = comparer(rapport.banc.reference, rapport.banc.candidat, "routage.continuite", "tenu");
    rapport.garde.push({ regle: "continuité non dégradée (hors périmètre)", ok: cont.kb >= cont.ka, detail: `${cont.kb}/${cont.n} (référence ${cont.ka}/${cont.n})` });
    if (rapport.garde.some((g) => !g.ok)) rapport.verdict = "rejete_banc";
    return rapport;
  } finally {
    supprimerCopie(reference);
    supprimerCopie(candidat);
  }
}

/** Mesures agrégées du candidat (pour un rapport à l'auteur : jamais les cas tenus à l'écart). */
export function agregatPourAuteur(r: RapportCandidat): string[] {
  return r.garde.map((g) => `${g.ok ? "ok " : "NON"} ${g.regle} · ${g.detail}`);
}

export { mesuresRoutage };
