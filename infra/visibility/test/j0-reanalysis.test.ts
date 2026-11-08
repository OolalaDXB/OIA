import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Candidate,
  classifyCitation,
  mentions,
  profileUrls,
  reanalyse,
  type ReanalysisExport,
  renderMarkdown,
  urlsInText,
} from "../src/j0-reanalysis.js";
import { loadSubject } from "../src/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const fixtureDir = join(here, "fixtures", "demo-subject");

// Sujet fictif + profils officiels (faits « contact »), comme ceux d'un vrai sujet.
const bundle = () => {
  const b = loadSubject(fixtureDir);
  b.subject.aliases.push({ value: "demo_coach", kind: "handle", status: "confirmed" });
  b.facts.facts.push(
    { id: "f-ig", statement: "Profil Instagram officiel : https://www.instagram.com/demo_coach (@demo_coach).", language: "fr", category: "contact", sourceId: "owner", status: "validated" },
    { id: "f-tt", statement: "Profil TikTok officiel : https://www.tiktok.com/@demo_coach.", language: "fr", category: "contact", sourceId: "owner", status: "validated" },
  );
  return b;
};

const run = (over: Partial<ReanalysisExport["runs"][number]>): ReanalysisExport["runs"][number] => ({
  id: "r",
  model: "perplexity",
  version: "perplexity/sonar",
  createdAt: "2026-11-08T09:00:00Z",
  promptValue: "Who are the best demo coaches?",
  promptTags: [],
  text: "",
  brandMentioned: false,
  citations: [],
  ...over,
});

const candidates: Candidate[] = [
  { name: "Future", segment: "application-en-ligne", domains: ["future.co"] },
  { name: "Rival Co", segment: "dubai-salle", domains: ["rival.example"], aliases: ["Rival"] },
];

describe("réanalyse des réponses complètes", () => {
  it("tire les profils officiels des faits « contact »", () => {
    expect(profileUrls(bundle())).toEqual(["https://www.instagram.com/demo_coach", "https://www.tiktok.com/@demo_coach"]);
  });

  it("compte un profil officiel pour la marque à l'adresse près, et pas le reste du réseau", () => {
    const profiles = profileUrls(bundle());
    const c = (u: string) => classifyCitation(u, ["demo.example"], profiles, ["future.co"]);
    expect(c("https://www.instagram.com/demo_coach/")).toBe("marque-profil");
    expect(c("https://instagram.com/demo_coach/reel/abc")).toBe("marque-profil");
    expect(c("https://www.tiktok.com/@demo_coach/video/1")).toBe("marque-profil");
    // Ce qu'Elmo 0.7.7 compterait pour la marque si instagram.com était déclaré : ici, non.
    expect(c("https://www.instagram.com/demo_coach_fan")).toBe("reseau-social");
    expect(c("https://www.instagram.com/someone_else")).toBe("reseau-social");
    expect(c("https://blog.demo.example/post")).toBe("marque-site");
    expect(c("https://future.co/coaching")).toBe("concurrent");
    expect(c("pas une url")).toBe("autre");
  });

  it("lit les liens écrits dans le texte, ponctuation finale retirée", () => {
    expect(urlsInText("Voir https://a.example/x. Et (https://b.example/y), puis https://a.example/x")).toEqual([
      "https://a.example/x",
      "https://b.example/y",
    ]);
  });

  it("repère les pseudonymes avec ou sans @, en mot entier", () => {
    expect(mentions("Suivez @demo_coach !", ["demo_coach"])).toEqual(["demo_coach"]);
    expect(mentions("demo_coach_fan n'est pas lui", ["demo_coach"])).toEqual([]);
    expect(mentions("the future of fitness", ["Future"], { caseSensitive: true })).toEqual([]);
    expect(mentions("Future is an app", ["Future"], { caseSensitive: true })).toEqual(["Future"]);
  });

  it("assemble les chiffres par moteur, réseaux sociaux compris", () => {
    const data: ReanalysisExport = {
      exportedAt: "2026-11-08T10:00:00Z",
      runs: [
        run({ id: "1", text: "Try Demo Subject, on Instagram @demo_coach. https://www.instagram.com/demo_coach", brandMentioned: true,
              citations: ["https://demo.example/", "https://www.instagram.com/someone"] }),
        run({ id: "2", text: "I don't know Demo Subject. Rival and Future are popular; the future is online.", brandMentioned: false,
              citations: ["https://rival.example/a", "https://reddit.com/r/x"] }),
        run({ id: "3", model: "mistral", text: "See https://www.tiktok.com/@demo_coach/video/9", brandMentioned: null, citations: [] }),
      ],
    };
    const r = reanalyse(bundle(), data, candidates);
    const p = r.byEngine.find((e) => e.model === "perplexity")!;
    expect(p.citations).toEqual({ "marque-site": 1, "marque-profil": 1, concurrent: 1, "reseau-social": 1, autre: 1 });
    expect(p.textOnlyLinks).toBe(1);
    expect(p.platformMentionRuns).toEqual({ Instagram: 1, TikTok: 0 });
    expect(p.handleMentionRuns).toBe(1);
    // Réponse 2 : la marque est nommée mais Jev dit « pas de mention » → un désaccord à relire.
    expect([p.aliasMentionRuns, p.jevMentionRuns, p.disagreements]).toEqual([2, 1, 1]);
    const m = r.byEngine.find((e) => e.model === "mistral")!;
    expect(m.profileCitations).toBe(1);
    expect(r.judged).toBe(2);
    expect(r.candidateMentions).toEqual([
      { name: "Future", segment: "application-en-ligne", runs: 1, engines: ["perplexity"] },
      { name: "Rival Co", segment: "dubai-salle", runs: 1, engines: ["perplexity"] },
    ]);
    const md = renderMarkdown(bundle(), r, data.exportedAt);
    expect(md).toMatch(/## Réseaux sociaux/);
    expect(md).toMatch(/Citations des profils officiels \(comptées pour la marque\) : \*\*2\*\*/);
  });

  it("signale le concurrent de référence et compte les lieux de travail à part, hors concurrents", () => {
    const data: ReanalysisExport = {
      exportedAt: "2026-11-08T10:00:00Z",
      runs: [
        run({ id: "a", model: "claude", text: "Essayez Rival Co ou l'académie Club Hôte." }),
        run({ id: "b", model: "gemini", text: "Club Hôte propose des cours." }),
      ],
    };
    const avecReference: Candidate[] = [{ ...candidates[1]!, reference: "publie plusieurs sites de classement" }];
    const r = reanalyse(bundle(), data, avecReference, {}, [{ name: "Club Hôte" }]);
    expect(r.candidateMentions).toEqual([{ name: "Rival Co", segment: "dubai-salle", runs: 1, engines: ["claude"], reference: "publie plusieurs sites de classement" }]);
    expect(r.workplaceMentions).toEqual([{ name: "Club Hôte", runs: 2, engines: ["claude", "gemini"] }]);
    const md = renderMarkdown(bundle(), r, data.exportedAt);
    expect(md).toMatch(/\*\*Concurrent de référence : Rival Co\*\* \(1 réponse\(s\)\)\. publie plusieurs sites de classement/);
    expect(md).toMatch(/## Lieux de travail \(pas des concurrents\), mentions comptées à part\n\n- Club Hôte : 2 réponse\(s\) \(claude, gemini\)/);
    expect(md).not.toMatch(/segment à classer/);
  });

  it("remplace les liens de redirection de Gemini par le site réel, et compte ceux qui restent", () => {
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz";
    const lost = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/lost";
    const data: ReanalysisExport = { exportedAt: "2026-11-08T10:00:00Z", runs: [run({ model: "gemini", citations: [redirect, lost] })] };
    const r = reanalyse(bundle(), data, [], { [redirect]: "https://www.instagram.com/demo_coach/" });
    const g = r.byEngine.find((e) => e.model === "gemini")!;
    expect(g.profileCitations).toBe(1);
    expect(g.unresolvedRedirects).toBe(1);
    expect(renderMarkdown(bundle(), r, data.exportedAt)).toMatch(/Liens de redirection non résolus, laissés tels quels : 1/);
  });

  it("scripts/j0-reanalysis.sh écrit le rapport hors du dépôt, sans Elmo", () => {
    const data = mkdtempSync(join(tmpdir(), "reanalyse-"));
    const exp = join(data, "export.json");
    writeFileSync(exp, JSON.stringify({ exportedAt: "2026-11-08T10:00:00Z", runs: [run({ id: "1", text: "Demo Subject", brandMentioned: true })] }));
    const r = spawnSync("bash", [join(ROOT, "scripts/j0-reanalysis.sh"), "demo-subject"], {
      encoding: "utf8",
      env: { ...process.env, OIA_VIS_DATA: data, OIA_VIS_REANALYSIS_EXPORT: exp, OIA_VIS_SUBJECTS_DIR: join(here, "fixtures"), OIA_VIS_NO_RESOLVE: "1" },
    });
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.trim();
    expect(out.startsWith(data)).toBe(true);
    expect(readFileSync(out, "utf8")).toMatch(/# Réanalyse des réponses · Demo Subject/);
  });
});
