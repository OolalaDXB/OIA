import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normaliserTexte, type Demandeur } from "@oia/shyrka-noyau";
import { ollamaPresent } from "../adapters/mistral.js";
import { RACINE_DEPOT } from "../local.js";
import { dossierVerifie, etatVolume } from "../memoire/volume.js";
import { construireBrief, texteBrief, texteVocalBrief, vuesExecutive } from "./brief.js";
import { chargerPortefeuille, CHEMINS_CODE, motifRefusService, REGLAGES, revision } from "./config.js";
import { chargerCatalogue, Corpus, renduExtraits } from "./corpus.js";
import { commandeMemoire, ouvrirMemoire } from "./memoire-cli.js";
import { Missions, RefusMission } from "./missions.js";
import { BaseOps, type Notification } from "./operations.js";
import { collecter } from "./veille.js";
import { verifier } from "./verification.js";
import { commandeEval, rapportCapacites } from "./eval/cli.js";
import { commandeDispatch } from "./dispatch-cli.js";
import { commandeExperiences, ouvrirCarnet } from "./experiences-cli.js";
import { comparerAuPrecedent, construireProgres } from "./progres.js";

/**
 * pnpm shyrka:executive <commande> — Shyrka exécutive (mandat v10).
 * Aucune commande ne fusionne, ne déploie, n'envoie de message ni ne dépense.
 */

const LABEL = "com.oia.shyrka.executive";
const PLIST = join(homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
const ops = () => new BaseOps(REGLAGES.dossierOps);
const ok = (b: boolean) => (b ? "ok    " : "MANQUE");

function aide(): number {
  console.log(`Usage : pnpm shyrka:executive <commande>
  doctor                         versions, chiffrement, mémoire, connecteurs, ordonnanceur, droits manquants
  run-once [--produit <slug>]    une collecte bornée : observations, incidents dédupliqués, propositions de missions
  vues                           vues JSON du contrat Lovable v1 (validées par le schéma)
  brief [--voix] [--marquer]     briefing sourcé (--marquer : ce briefing devient la référence « depuis »)
  cherche <question>             corpus + mémoire, avec sources (« état du cockpit », « reste à valider », « absent ou ancien »)
  missions list | show <id> | autoriser <id> | refuser <id> <motif> | corriger <id> <demande> | approuver <id> <empreinte>
  incidents list | ignorer <id> <motif>
  notifications                  notifications locales récentes
  pause | resume | stop          suspendre les départs / reprendre / arrêter le service (et seulement lui)
  service install | status | uninstall
  acceptance                     recette automatisée, sans appel payant ni mutation de production
  memoire …                      retenir | lister | chercher | corriger | oublier | exporter | restaurer | etat
  dispatch executeurs | diagnostic | preparer | soumettre | revue | approuver   dispatcher borné, copie isolée, aucune intégration à main
  experiences list | show | rappeler | comparer | statut | invalider | correction   carnet d'apprentissage (volume chiffré)
  progres [--json]               appris / candidat / rejeté, limites, décisions, valeur mesurée, coûts
  eval run [capacite] | report   banc d'évaluation (développement, régression, tenu à l'écart) et registre des capacités`);
  return 2;
}

async function doctor(): Promise<number> {
  const rev = revision();
  const node = process.version;
  const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" }).stdout.trim();
  const v = etatVolume();
  const lignes: [boolean, string, string][] = [];
  lignes.push([true, "révision", `${rev.sha.slice(0, 12)}${rev.modifie ? " (modifications locales dans infra/shyrka ou packages/shyrka)" : ""}`]);
  lignes.push([Number(node.slice(1).split(".")[0]) >= 22, "Node / pnpm", `${node} / ${pnpm}`]);
  lignes.push([v.chiffre, "volume Shyrka-corpus", v.detail]);
  try {
    const m = ouvrirMemoire();
    const c = m.comptes();
    lignes.push([true, "mémoire personnelle", `${c.elements} élément(s), ${c.versions} version(s), ${c.oublis} empreinte(s) d'oubli`]);
    m.fermer();
  } catch (e) {
    lignes.push([false, "mémoire personnelle", `non activée : ${(e as Error).message}`]);
  }
  try {
    const cat = chargerCatalogue();
    lignes.push([true, "catalogue du corpus", `${cat.length} source(s) référencée(s)`]);
  } catch (e) {
    lignes.push([false, "catalogue du corpus", (e as Error).message]);
  }
  lignes.push([await ollamaPresent("http://127.0.0.1:11434"), "Ollama (local)", "http://127.0.0.1:11434"]);
  const gh = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  lignes.push([gh.status === 0, "GitHub (gh, lecture)", gh.status === 0 ? "connecté" : "ACCES_MANQUANT : `gh auth login`"]);
  lignes.push([false, "Vercel (lecture)", "ACCES_MANQUANT : CLI absente, MCP seulement en session interactive"]);
  lignes.push([false, "Supabase santé/advisors", "non configuré : pas de jeton de lecture dédié (aucun accès admin utilisé)"]);
  const o = ops();
  lignes.push([o.lireControle("pause") !== "1", "départs de missions", o.lireControle("pause") === "1" ? "EN PAUSE (pnpm shyrka:executive resume)" : "autorisés"]);
  const dp = o.dernierPassage();
  lignes.push([Boolean(dp), "dernière collecte", dp ? `${dp.fin} · ${dp.resume}` : "aucune"]);
  o.fermer();
  const s = statutService();
  lignes.push([s.installe && s.charge, "service launchd", s.texte]);
  console.log(lignes.map(([b, n, d]) => `${ok(b)} ${n} · ${d}`).join("\n"));
  console.log(`\nDonnées de fonctionnement : ${REGLAGES.dossierOps} · briefing ${REGLAGES.heureBrief} ${REGLAGES.fuseau}`);
  return 0;
}

/** Une collecte bornée. Idempotente : un incident rejoué ne crée ni alerte ni mission de plus. */
async function runOnce(args: string[], opts: { silencieux?: boolean; github?: boolean } = {}): Promise<{ notifications: Notification[]; resume: string }> {
  const produits = chargerPortefeuille();
  const i = args.indexOf("--produit");
  const seul = i >= 0 ? args[i + 1] : undefined;
  const o = ops();
  const m = new Missions(o);
  const notifs: Notification[] = [];
  try {
    m.reprendreExpires();
    const passage = o.debutPassage();
    const observations = await collecter(produits, { ...(seul ? { seulement: (p: { slug: string }) => p.slug === seul } : {}), github: opts.github !== false });
    let anomalies = 0;
    for (const x of observations) {
      const r = o.observer(passage, x, REGLAGES.observationsAvantAlerte);
      if (r.notification) notifs.push(r.notification);
      if (x.resultat === "anomalie") anomalies++;
      // Proposition de mission : seulement pour OIA, seulement sur incident confirmé, une par incident (clé).
      if (r.incident && r.incident.statut === "confirme" && r.incident.produit === "oia") {
        const { creee } = m.proposer({
          cle: `incident:${r.incident.id}`, objectif: `Diagnostiquer : ${r.incident.observation}`.slice(0, 200), demandeur: "shyrka", shaBase: revision().sha, agent: "diagnostic",
          perimetre: { repo: "OolalaDXB/OIA", fichiers: [], commandes: [] }, preuvesEntree: [r.incident.preuve], automatisation: "assiste", incident: r.incident.id,
        });
        if (creee) notifs.push(o.notifier(`mission:incident:${r.incident.id}`, "a_decider", "Mission de diagnostic proposée", r.incident.id)!);
      }
    }
    const parEtat = observations.reduce<Record<string, number>>((a, x) => ((a[x.etat] = (a[x.etat] ?? 0) + 1), a), {});
    const resume = `${observations.length} contrôle(s) : ${Object.entries(parEtat).map(([k, n]) => `${n} ${k}`).join(", ")} ; ${anomalies} anomalie(s) ; ${notifs.length} notification(s)`;
    o.finPassage(passage, resume);
    if (!opts.silencieux) {
      for (const x of observations) console.log(`${x.etat === "actif" ? (x.resultat === "ok" ? "ok      " : x.resultat === "anomalie" ? "ANOMALIE" : "?       ") : x.etat.toUpperCase().padEnd(8)} ${x.produit} · ${x.controle} · ${x.cible} · ${x.detail}`);
      console.log(`\n${resume}`);
    }
    return { notifications: notifs.filter(Boolean), resume };
  } finally {
    o.fermer();
  }
}

function etatsCorpus() {
  try {
    const c = new Corpus(dossierVerifie("connaissances"));
    const e = c.indexer();
    c.fermer();
    return e;
  } catch {
    return null;
  }
}

function brief(args: string[]): number {
  const o = ops();
  const b = construireBrief({ ops: o, missions: new Missions(o), produits: chargerPortefeuille(), corpus: etatsCorpus() });
  const texte = texteBrief(b);
  console.log(texte);
  // Section v11 : état des capacités (banc), sans contenu du carnet ; le détail est dans `progres`.
  try {
    const caps = rapportCapacites();
    const n = caps.reduce<Record<string, number>>((a, c) => ((a[c.statut] = (a[c.statut] ?? 0) + 1), a), {});
    console.log(`\n6. Apprentissage et capacités\n   - ${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(", ")} (pnpm shyrka:executive eval report) ; détail : pnpm shyrka:executive progres`);
  } catch {
    /* banc jamais lancé */
  }
  mkdirSync(join(REGLAGES.dossierOps, "briefs"), { recursive: true, mode: 0o700 });
  writeFileSync(join(REGLAGES.dossierOps, "briefs", `${b.le.slice(0, 16).replace(/:/g, "")}.txt`), texte, { mode: 0o600 });
  if (args.includes("--marquer")) o.ecrireControle("dernier_brief", b.le);
  o.fermer();
  if (args.includes("--voix")) {
    const v = texteVocalBrief(b);
    console.log(`\n(voix) ${v}`);
    spawnSync("say", ["-v", "Aurélie", v], { stdio: "inherit" });
  }
  return 0;
}

/** Réception B : trois questions, réponses sourcées, depuis le corpus, la mémoire et la veille. */
function cherche(question: string, pour: Demandeur = { type: "mickael" }): number {
  const n = normaliserTexte(question);
  let corpus: Corpus;
  try {
    corpus = new Corpus(dossierVerifie("connaissances"));
  } catch (e) {
    console.log(`Corpus indisponible : ${(e as Error).message}`);
    return 1;
  }
  const etats = corpus.indexer();
  try {
    if (/reste a valider|a valider|en attente de validation/.test(n)) {
      console.log("À valider, par source :");
      try {
        const m = ouvrirMemoire();
        const r = m.retrouver({ statuts: ["a_confirmer"], limite: 20 }, pour);
        console.log(`- mémoire : ${r.length} proposition(s) à confirmer${r.length ? ` (${r.map((x) => x.element.id.slice(0, 8)).join(", ")})` : ""}`);
        m.fermer();
      } catch (e) {
        console.log(`- mémoire : indisponible (${(e as Error).message})`);
      }
      const o = ops();
      const missions = new Missions(o).lister().filter((x) => ["proposee", "attente_validation", "bloquee"].includes(x.statut));
      console.log(`- missions : ${missions.length ? missions.map((x) => `${x.id.slice(0, 8)} ${x.statut} « ${x.objectif} »`).join(" ; ") : "aucune en attente de toi"}`);
      o.fermer();
      const d = (readFileSync(join(RACINE_DEPOT, "docs/roadmap-oia-shyrka-souffleur.md"), "utf8").split(/^## Décisions ouvertes\s*$/m)[1]?.split(/^## /m)[0] ?? "").match(/^- \[ \] .+$/gm) ?? [];
      console.log(`- roadmap : ${d.length} décision(s) ouverte(s) (docs/roadmap-oia-shyrka-souffleur.md, « Décisions ouvertes »)`);
      console.log(`- corpus : ${etats.filter((s) => s.statut === "a_valider").map((s) => s.chemin).join(", ") || "aucun document marqué à valider"}`);
      console.log(renduExtraits(corpus.chercher("reste à valider à faire", pour, 4)));
      return 0;
    }
    if (/absent|ancien|perime|manquant/.test(n)) {
      const o = ops();
      const obs = o.dernieresObservations();
      const dp = o.dernierPassage();
      o.fermer();
      console.log(`Dernière collecte : ${dp ? `${dp.fin} (${dp.resume})` : "aucune — lancer run-once"}`);
      for (const x of obs.filter((y) => y.etat !== "actif")) console.log(`- ${x.etat} : ${x.produit} ${x.controle} ${x.cible} — ${x.detail}`);
      for (const x of obs.filter((y) => y.dateDonnee && y.etat === "actif" && /sync|money|commit/.test(y.controle))) console.log(`- âge de la donnée : ${x.produit} ${x.controle} — donnée du ${x.dateDonnee} (collectée ${x.collecteLe.slice(0, 16)}Z)`);
      for (const s of etats.filter((x) => x.etat !== "indexe" || (x.ageJours ?? 0) > 30)) console.log(`- corpus ${s.chemin} : ${s.etat}${s.ageJours ? `, ${s.ageJours} j` : ""}`);
      for (const s of etats.filter((x) => x.statut === "a_valider")) console.log(`- corpus ${s.chemin} : statut « à valider » (source du ${s.dateSource?.slice(0, 10)})`);
      return 0;
    }
    const r = corpus.chercher(question, pour, 6);
    console.log(r.length ? renduExtraits(r) : "Rien dans le corpus autorisé. Je ne complète pas.");
    try {
      const m = ouvrirMemoire();
      const s = m.retrouver({ texte: question, limite: 5 }, pour);
      if (s.length) console.log(["\nMémoire :", ...s.map((x) => `- [${x.element.id.slice(0, 8)}] ${x.element.contenu} (${x.provenance})`)].join("\n"));
      m.fermer();
    } catch {
      /* mémoire non activée : déjà dit par doctor */
    }
    return 0;
  } finally {
    corpus.fermer();
  }
}

function missionsCmd(args: string[]): number {
  const [sous, ref, ...reste] = args;
  const o = ops();
  const m = new Missions(o);
  try {
    if (!sous || sous === "list") {
      const l = m.lister();
      if (!l.length) console.log("Aucune mission.");
      for (const x of l) console.log(`${x.id.slice(0, 8)}  ${x.statut.padEnd(18)} ${x.automatisation.padEnd(10)} tentatives ${x.tentatives}/${x.tentativesMax}  ${x.objectif}${x.causeBlocage ? `  (blocage : ${x.causeBlocage})` : ""}`);
      return 0;
    }
    if (sous === "show") {
      const x = m.obtenir(ref ?? "");
      console.log(JSON.stringify({ ...x, journal: m.historique(x.id) }, null, 2));
      const wt = (x.resultats as { worktree?: string }).worktree;
      if (wt && existsSync(wt)) console.log(`\nDiff (git -C ${wt} diff ${x.shaBase.slice(0, 12)}) :\n${execFileSync("git", ["-C", wt, "diff", "--stat", x.shaBase], { encoding: "utf8" })}`);
      return 0;
    }
    if (sous === "proposer") {
      // missions proposer <clé> <objectif> --fichiers a,b/ --commande "pnpm --filter x test" [--commande …] --sha <base> --agent <rôle> [--preuve <texte>…]
      const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
      const commandes = args.flatMap((a, i) => (a === "--commande" ? [args[i + 1]!.split(" ")] : []));
      const r = m.proposer({
        cle: ref ?? "", objectif: reste.filter((_, i, t) => !t[i]!.startsWith("--") && !(i > 0 && t[i - 1]!.startsWith("--"))).join(" "), demandeur: "shyrka", shaBase: opt("--sha") ?? revision().sha,
        agent: opt("--agent") ?? "developpement", automatisation: (opt("--automatisation") as "assiste") ?? "assiste",
        perimetre: { repo: "OolalaDXB/OIA", fichiers: (opt("--fichiers") ?? "").split(",").filter(Boolean), commandes }, // --preuve (répétable) garde chaque preuve entière ; --preuves a,b reste accepté (sans virgule dans les preuves).
        preuvesEntree: [...(opt("--preuves") ?? "").split(",").filter(Boolean), ...args.flatMap((a, i) => (a === "--preuve" ? [args[i + 1]!] : []))],
        outils: ["git", "pnpm", "sandbox-exec"], budgetUsd: 0, tentativesMax: 2, dureeMaxMin: 120,
      });
      console.log(`${r.creee ? "Mission proposée" : "Mission déjà connue (même clé)"} : ${r.mission.id}`);
      return 0;
    }
    if (sous === "avancer") {
      // Transitions des rôles (registre, diagnostic, développement, vérification) : contrôlées par le code.
      const [vers, acteur, ...note] = reste;
      const opt = (k: string) => { const i = note.indexOf(k); return i >= 0 ? note[i + 1] : undefined; };
      const resultats = opt("--resultats") ? (JSON.parse(readFileSync(opt("--resultats")!, "utf8")) as Record<string, unknown>) : undefined;
      const texte = note.filter((x, i) => x !== "--resultats" && note[i - 1] !== "--resultats").join(" ");
      const x = vers === "en_cours" && m.obtenir(ref ?? "").statut === "en_file" ? m.prendre(ref ?? "", acteur ?? "?", 2 * 3_600_000) : m.passer(ref ?? "", vers as never, acteur ?? "?", texte, resultats ? { resultats } : {});
      console.log(`${x.id.slice(0, 8)} → ${x.statut}`);
      return 0;
    }
    if (sous === "autoriser") return console.log(m.passer(ref ?? "", "autorisee", "mickael", "autorisée par Mickaël (CLI)").statut), 0;
    if (sous === "refuser") return console.log(m.passer(ref ?? "", "annulee", "mickael", `refusée : ${reste.join(" ") || "sans motif"}`).statut), 0;
    if (sous === "corriger") return console.log(m.passer(ref ?? "", "en_cours", "mickael", `correction demandée : ${reste.join(" ")}`).statut), 0;
    if (sous === "approuver") {
      // L'approbation porte sur l'empreinte du diff que Mickaël a vu ; elle ne fusionne rien.
      const x = m.approuver(ref ?? "", "accepter_patch", reste[0] ?? "", "mickael");
      console.log(`Approuvé pour le diff ${x.validation?.empreinte.slice(0, 12)}. Aucune fusion automatique : fusionne la PR toi-même si tu le souhaites.`);
      return 0;
    }
    return aide();
  } catch (e) {
    if (e instanceof RefusMission) {
      console.log(`Refusé : ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    o.fermer();
  }
}

function incidentsCmd(args: string[]): number {
  const o = ops();
  try {
    if (args[0] === "ignorer") {
      o.changerIncident(args[1] ?? "", "ignore_avec_motif", args.slice(2).join(" "));
      console.log("Incident ignoré, motif consigné.");
      return 0;
    }
    if (args[0] === "show") {
      console.log(JSON.stringify(o.incidents().find((i) => i.id.startsWith(args[1] ?? "-")) ?? "introuvable", null, 2));
      return 0;
    }
    const l = o.incidents();
    if (!l.length) console.log("Aucun incident.");
    for (const i of l) console.log(`${i.id.slice(0, 8)}  ${i.statut.padEnd(18)} ${i.gravite.padEnd(9)} ${i.produit} · ${i.source} · ${i.observation} (×${i.occurrences}, depuis ${i.premiere.slice(0, 16)}Z)`);
    return 0;
  } finally {
    o.fermer();
  }
}

/* ---------- Service launchd ---------- */

function statutService(): { installe: boolean; charge: boolean; texte: string } {
  const installe = existsSync(PLIST);
  const p = spawnSync("launchctl", ["print", `gui/${process.getuid?.()}/${LABEL}`], { encoding: "utf8" });
  const charge = p.status === 0;
  const sha = installe ? /<key>SHYRKA_EXEC_SHA<\/key>\s*<string>([0-9a-f]+)</.exec(readFileSync(PLIST, "utf8"))?.[1] : undefined;
  const texte = !installe ? "PRET_NON_INSTALLE (pnpm shyrka:executive service install)" : `${charge ? "chargé" : "installé, non chargé"} · révision ${sha?.slice(0, 12) ?? "?"} · toutes les ${REGLAGES.intervalleHttpMin} min`;
  return { installe, charge, texte };
}

function plist(sha: string): string {
  const pnpm = execFileSync("/bin/zsh", ["-lc", "command -v pnpm"], { encoding: "utf8" }).trim();
  const log = join(REGLAGES.dossierOps, "service.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>-lc</string><string>cd ${JSON.stringify(RACINE_DEPOT)} &amp;&amp; ${pnpm} --silent shyrka:executive tick</string></array>
  <key>EnvironmentVariables</key><dict><key>SHYRKA_EXEC_SHA</key><string>${sha}</string></dict>
  <key>StartInterval</key><integer>${REGLAGES.intervalleHttpMin * 60}</integer>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`;
}

function service(args: string[]): number {
  const uid = process.getuid?.();
  if (args[0] === "status") return console.log(statutService().texte), 0;
  if (args[0] === "uninstall") {
    spawnSync("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
    if (existsSync(PLIST)) unlinkSync(PLIST);
    console.log("Service retiré (les données de fonctionnement et la mémoire sont conservées).");
    return 0;
  }
  if (args[0] === "install") {
    const rev = revision();
    if (rev.modifie) {
      console.log("Refus : infra/shyrka ou packages/shyrka ont des modifications locales. Le service ne tourne que sur une révision identifiée de main.");
      return 1;
    }
    mkdirSync(REGLAGES.dossierOps, { recursive: true, mode: 0o700 });
    mkdirSync(join(homedir(), "Library/LaunchAgents"), { recursive: true });
    spawnSync("launchctl", ["bootout", `gui/${uid}/${LABEL}`]); // idempotent
    writeFileSync(PLIST, plist(rev.sha));
    const r = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, PLIST], { encoding: "utf8" });
    if (r.status !== 0) {
      console.log(`PRET_NON_INSTALLE : launchctl a refusé (${r.stderr.trim()}). Activation manuelle : launchctl bootstrap gui/${uid} ${PLIST}`);
      return 1;
    }
    console.log(`Service installé : ${LABEL}, révision ${rev.sha.slice(0, 12)}, toutes les ${REGLAGES.intervalleHttpMin} min ; briefing ${REGLAGES.heureBrief} ${REGLAGES.fuseau}.`);
    return 0;
  }
  return aide();
}

/** Passage du service : révision vérifiée, pause respectée, cadence, briefing du matin, notifications génériques. */
async function tick(): Promise<number> {
  const attendu = process.env.SHYRKA_EXEC_SHA;
  const rev = revision();
  const o0 = ops();
  const pidf = join(REGLAGES.dossierOps, "tick.pid");
  try {
    // La révision installée fait foi pour le code de Shyrka : un commit ailleurs dans le dépôt (rapport, roadmap) ne l'arrête pas.
    const codeChange = attendu ? spawnSync("git", ["-C", RACINE_DEPOT, "diff", "--quiet", attendu, "HEAD", "--", ...CHEMINS_CODE]).status !== 0 : false;
    const refus = attendu ? motifRefusService(codeChange, rev.modifie) : null;
    if (attendu && refus) {
      o0.notifier(`service:${refus.cle}:${rev.sha}`, "a_connaitre", refus.titre, "service");
      console.log(`${new Date().toISOString()} refus : ${refus.journal} (HEAD ${rev.sha.slice(0, 12)}, installée ${attendu.slice(0, 12)})`);
      return 1;
    }
    if (o0.lireControle("arret") === "1") return 0;
  } finally {
    o0.fermer();
  }
  writeFileSync(pidf, String(process.pid));
  try {
    const o = ops();
    const derGithub = o.lireControle("dernier_github");
    const github = !derGithub || Date.now() - Date.parse(derGithub) >= REGLAGES.intervalleGithubMin * 60_000;
    o.fermer();
    // GitHub toutes les 30 min, HTTP et local à chaque passage : on borne par produit pour respecter les quotas.
    const r = await runOnce([], { silencieux: true, github });
    const o2 = ops();
    if (github) o2.ecrireControle("dernier_github", new Date().toISOString());
    // Briefing du matin, une fois par jour, rattrapé au réveil sans rafale.
    const ici = new Date(new Date().toLocaleString("en-US", { timeZone: REGLAGES.fuseau }));
    const jour = `${ici.getFullYear()}-${String(ici.getMonth() + 1).padStart(2, "0")}-${String(ici.getDate()).padStart(2, "0")}`;
    const [hh, mm] = REGLAGES.heureBrief.split(":").map(Number);
    let briefFait = false;
    if (ici.getHours() * 60 + ici.getMinutes() >= hh! * 60 + mm! && o2.lireControle("brief_jour") !== jour) {
      const b = construireBrief({ ops: o2, missions: new Missions(o2), produits: chargerPortefeuille(), corpus: etatsCorpus() });
      mkdirSync(join(REGLAGES.dossierOps, "briefs"), { recursive: true, mode: 0o700 });
      writeFileSync(join(REGLAGES.dossierOps, "briefs", `${jour}-matin.txt`), texteBrief(b), { mode: 0o600 });
      o2.ecrireControle("brief_jour", jour);
      o2.ecrireControle("dernier_brief", b.le);
      briefFait = true;
    }
    o2.fermer();
    // Notification macOS générique : ni montant, ni contenu client, ni secret. Pas d'audio.
    const urgents = r.notifications.filter((n) => n.niveau === "urgent").length;
    const aDecider = r.notifications.filter((n) => n.niveau === "a_decider").length;
    if (urgents || aDecider || briefFait) {
      const msg = [urgents ? `${urgents} alerte(s) urgente(s)` : "", aDecider ? `${aDecider} décision(s) à prendre` : "", briefFait ? "briefing du matin prêt" : ""].filter(Boolean).join(" · ");
      spawnSync("osascript", ["-e", `display notification ${JSON.stringify(`${msg}. Détail : pnpm shyrka:executive brief`)} with title "Shyrka"`]);
    }
    console.log(`${new Date().toISOString()} ${r.resume}${briefFait ? " ; briefing écrit" : ""}`);
    return 0;
  } finally {
    rmSync(pidf, { force: true });
  }
}

function controle(cmd: "pause" | "resume" | "stop"): number {
  const o = ops();
  try {
    if (cmd === "pause") {
      o.ecrireControle("pause", "1");
      console.log("Départs de missions suspendus. Le travail en cours finit à son prochain point d'arrêt ; la veille continue. `resume` pour reprendre.");
    } else if (cmd === "resume") {
      o.ecrireControle("pause", "0");
      o.ecrireControle("arret", "0");
      console.log("Départs autorisés, service réactivé.");
    } else {
      o.ecrireControle("arret", "1");
      o.ecrireControle("pause", "1");
      // N'arrête que le passage en cours de CE service (pid consigné), jamais d'autres processus.
      const pidf = join(REGLAGES.dossierOps, "tick.pid");
      if (existsSync(pidf)) {
        const pid = Number(readFileSync(pidf, "utf8"));
        try {
          process.kill(pid, "SIGTERM");
          console.log(`Passage en cours (pid ${pid}) arrêté.`);
        } catch {
          /* déjà terminé */
        }
      }
      console.log("Service arrêté : plus aucun passage ni départ (Elmo, Docker, Ollama, Whisper non touchés). `resume` pour relancer, `service uninstall` pour retirer.");
    }
    return 0;
  } finally {
    o.fermer();
  }
}

function notifications(): number {
  const o = ops();
  for (const n of o.notifications().slice(-30)) console.log(`${n.le.slice(0, 16)}Z  ${n.niveau.padEnd(11)} ${n.titre}  (réf. ${n.cible.slice(0, 8)})`);
  o.fermer();
  return 0;
}

/** Recette automatisée : tests, persistance réelle multi-processus, corpus réel. Aucun appel payant, aucune mutation de production. */
function acceptance(): number {
  const etapes: [string, boolean, string][] = [];
  // `pnpm --silent` propage npm_config_loglevel=silent : on le rétablit pour lire le résumé des tests.
  const t = spawnSync("pnpm", ["--filter", "@oia/shyrka", "--filter", "@oia/shyrka-noyau", "test"], { cwd: RACINE_DEPOT, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k))) });
  etapes.push(["tests unitaires et de recette (vitest)", t.status === 0, ((t.stdout + t.stderr).replace(/\x1b\[[0-9;]*m/g, "").match(/Tests +\d+.*$/gm) ?? []).join(" ; ")]);
  const tc = spawnSync("pnpm", ["--filter", "@oia/shyrka", "--filter", "@oia/shyrka-noyau", "typecheck"], { cwd: RACINE_DEPOT, encoding: "utf8" });
  etapes.push(["typecheck", tc.status === 0, tc.status === 0 ? "0 erreur" : tc.stdout.slice(-400)]);
  const v = etatVolume();
  if (!v.chiffre) etapes.push(["persistance réelle (volume)", false, `non testée : ${v.detail}`]);
  else {
    const sous = `recette/acceptance-${Date.now()}`;
    const E = (...a: string[]) => spawnSync("pnpm", ["--silent", "shyrka:executive", "memoire", ...a], { cwd: RACINE_DEPOT, encoding: "utf8", env: { ...process.env, SHYRKA_MEMOIRE_SOUS_DOSSIER: sous } }).stdout.trim();
    const r1 = JSON.parse(E("retenir", "Acceptance fictive : la couleur du banc est ocre")) as { id: string };
    const ok1 = E("chercher", "ocre").includes(r1.id);
    E("corriger", r1.id.slice(0, 8), "Acceptance fictive : la couleur du banc est indigo");
    const l2 = E("chercher", "couleur banc");
    const ok2 = l2.includes("indigo") && !l2.includes("ocre") && l2.includes('"version":2');
    E("oublier", r1.id.slice(0, 8));
    const ok3 = E("chercher", "couleur banc") === "(aucun)";
    etapes.push(["M1-M3 réels : retenir → relance → rappel → corriger → relance → oublier → relance", ok1 && ok2 && ok3, `rappel ${ok1}, correction ${ok2}, oubli ${ok3} (${v.point}/${sous})`]);
    try {
      const c = new Corpus(dossierVerifie("connaissances"));
      c.indexer();
      const r = c.chercher("branchement Lovable cockpit", { type: "mickael" }, 3);
      c.fermer();
      etapes.push(["K1 réel : recherche dans le corpus autorisé", r.length > 0, r.map((x) => `${x.chemin}:${x.ligne}@${x.version}`).join(", ")]);
    } catch (e) {
      etapes.push(["K1 réel", false, (e as Error).message]);
    }
  }
  for (const [n, b, d] of etapes) console.log(`${b ? "TESTE " : "ECHEC "} ${n} · ${d}`);
  return etapes.every(([, b]) => b) ? 0 : 1;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
  switch (cmd) {
    case "doctor":
      return doctor();
    case "run-once":
      await runOnce(rest);
      return 0;
    case "brief":
      return brief(rest);
    case "vues": {
      // Vues du contrat Lovable v1, validées par le schéma. Sortie locale : aucun transport distant en v1.
      const o = ops();
      const mi = new Missions(o);
      console.log(JSON.stringify(vuesExecutive(construireBrief({ ops: o, missions: mi, produits: chargerPortefeuille(), corpus: etatsCorpus() }), { ops: o, missions: mi }), null, 2));
      o.fermer();
      return 0;
    }
    case "cherche":
      return cherche(rest.join(" "));
    case "missions":
      return missionsCmd(rest);
    case "incidents":
      return incidentsCmd(rest);
    case "notifications":
      return notifications();
    case "pause":
    case "resume":
    case "stop":
      return controle(cmd);
    case "service":
      return service(rest);
    case "tick":
      return tick();
    case "acceptance":
      return acceptance();
    case "verifier": {
      // Vérification d'une mission dans son worktree (rôle « vérification »).
      const o = ops();
      const m = new Missions(o);
      const x = m.obtenir(rest[0] ?? "");
      const wt = rest[1] ?? (x.resultats as { worktree?: string }).worktree;
      if (!wt) throw new Error("worktree inconnu");
      const r = verifier(x, wt);
      console.log(JSON.stringify(r, null, 2));
      o.fermer();
      return r.verdict === "conforme" ? 0 : 1;
    }
    case "memoire":
      return commandeMemoire(rest);
    case "eval":
      return commandeEval(rest);
    case "dispatch":
      return commandeDispatch(rest);
    case "experiences":
      return commandeExperiences(rest);
    case "progres": {
      // Le carnet est dans le volume chiffré : sans lui, le rapport le dit et continue.
      let carnet = null;
      try {
        carnet = ouvrirCarnet();
      } catch (e) {
        console.log(`(carnet d'expériences indisponible : ${(e as Error).message})`);
      }
      const p = construireProgres(carnet);
      carnet?.fermer();
      if (rest.includes("--json")) return console.log(JSON.stringify(p, null, 2)), 0;
      console.log("Progrès de Shyrka — chaque ligne porte sa nature ; « non mesuré » n'est jamais estimé.");
      for (const [n, t] of p.lignes) console.log(`${n.padEnd(17)} ${t}`);
      console.log(["", "Comparaison longitudinale :", ...comparerAuPrecedent(p.instantane).map((x) => `  ${x}`)].join("\n"));
      return 0;
    }
    default:
      return aide();
  }
}

main().then(
  (c) => (process.exitCode = c),
  (e: unknown) => {
    console.error(`! ${(e as Error).message}`);
    process.exitCode = 1;
  },
);
