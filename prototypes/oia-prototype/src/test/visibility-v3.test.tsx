import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JaugeScore } from "@/components/oia/visibility-score";
import { MarkdownSecurise, ReponseMarkdown } from "@/components/oia/visibility-markdown";
import { demanderAnalyse, type ClientRpc } from "@/lib/donnees/visibility-pilotage";
import {
  actionsPrioritaires, analyseReussie, couleurScore, demandeAnalyseActive, groupesReseaux,
  lireVisibilityV3, niveauSignal, opportunitesLighthouse, scoreLighthouse, separerProfils,
  tonScore, trierConstats, valeurComposante, variationScore, VUES_VISIBILITY_V3,
  type AnalyseV3, type ConstatV3, type DemandeV2, type HistoriqueScoreV3, type ScoreV3,
} from "@/lib/donnees/visibility-v3";
import type { ReseauVisibility } from "@/lib/donnees/visibility";

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
afterEach(cleanup);

const scoreCoach = ligne<ScoreV3>({
  subject_id: "coach-gari", score: 58, visibilite_ia: 0, notoriete_ia: 64,
  performance_mobile: 88, performance_ordinateur: 100, seo_technique: 100,
  accessibilite: 100, bonnes_pratiques: 100, manquantes: [],
  constats_ouverts: 24, constats_critiques: 1, constats_resolus: 0,
  analyse_le: "2026-11-16T10:00:00Z",
});

const lighthouse = (strategie: string, performance: number) => ligne<AnalyseV3>({
  id: `lh-${strategie}`, subject_id: "coach-gari", nature: "lighthouse", strategie,
  statut: "fait", derniere: true, recu_le: "2026-11-16T10:00:00Z",
  scores: { performance, seo: 1, accessibilite: 1, bonnes_pratiques: 1 },
  metriques: { lcp_ms: 2500, cls: 0.1, tbt_ms: 200, fcp_ms: 1800 },
  resultat: { opportunites: [{ id: "image", titre: "Images", gain_ms: 450, gain_ko: 120 }] },
});

describe("score et composantes Visibility v3", () => {
  it("applique exactement les seuils de couleur du brief", () => {
    expect(tonScore(49)).toBe("block");
    expect(tonScore(50)).toBe("warn");
    expect(tonScore(79)).toBe("warn");
    expect(tonScore(80)).toBe("ok");
    expect(tonScore(null)).toBe("muted");
    expect(couleurScore(58)).toBe("var(--warn)");
  });

  it("affiche le score Coach Gari de 58 sans transformer une absence en zéro", () => {
    const vue = render(<JaugeScore score={scoreCoach.score} />);
    expect(vue.getByRole("img", { name: "Score 58 sur 100" })).toBeInTheDocument();
    expect(valeurComposante(scoreCoach, "visibilite_ia")).toBe(0);
    expect(valeurComposante(scoreCoach, "notoriete_ia")).toBe(64);
    expect(valeurComposante(ligne<ScoreV3>({ ...scoreCoach, visibilite_ia: null, manquantes: ["visibilite_ia"] }), "visibilite_ia")).toBeNull();
    expect(scoreCoach.constats_ouverts).toBe(24);
    expect(scoreCoach.constats_critiques).toBe(1);
  });

  it("convertit les scores Lighthouse mobile et ordinateur fournis pour Coach Gari", () => {
    const mobile = lighthouse("mobile", 0.88);
    const ordinateur = lighthouse("ordinateur", 1);
    expect(scoreLighthouse(mobile, "performance")).toBe(88);
    expect(scoreLighthouse(mobile, "seo")).toBe(100);
    expect(scoreLighthouse(mobile, "accessibilite")).toBe(100);
    expect(scoreLighthouse(mobile, "bonnes_pratiques")).toBe(100);
    expect(scoreLighthouse(ordinateur, "performance")).toBe(100);
    expect(analyseReussie([mobile, ordinateur], "coach-gari", "lighthouse", "ordinateur")?.id).toBe("lh-ordinateur");
    expect(opportunitesLighthouse(mobile)[0]).toMatchObject({ titre: "Images", gainMs: 450, gainKo: 120 });
  });

  it("calcule la variation depuis le point précédent, sans reporter de valeur", () => {
    const historique = [
      ligne<HistoriqueScoreV3>({ subject_id: "coach-gari", composante: "score", valeur: 52, le: "2026-11-09T10:00:00Z" }),
      ligne<HistoriqueScoreV3>({ subject_id: "coach-gari", composante: "score", valeur: 58, le: "2026-11-16T10:00:00Z" }),
      ligne<HistoriqueScoreV3>({ subject_id: "coach-gari", composante: "performance_mobile", valeur: 88, le: "2026-11-16T10:00:00Z" }),
    ];
    expect(variationScore(scoreCoach, historique)).toBe(6);
    expect(variationScore(scoreCoach, historique.slice(2))).toBeNull();
  });
});

describe("actions et signaux", () => {
  const critique = ligne<ConstatV3>({ id: "noindex", subject_id: "coach-gari", etat: "ouvert", gravite: "critique", ordre: 1, effort: "S", titre: "Une page en noindex" });
  const importantLong = ligne<ConstatV3>({ id: "important-long", subject_id: "coach-gari", etat: "ouvert", gravite: "important", ordre: 2, effort: "XL" });
  const importantCourt = ligne<ConstatV3>({ id: "important-court", subject_id: "coach-gari", etat: "ouvert", gravite: "important", ordre: 2, effort: "XS" });
  const mineur = ligne<ConstatV3>({ id: "mineur", subject_id: "coach-gari", etat: "ouvert", gravite: "mineur", ordre: 3, effort: "XS" });
  const resolu = ligne<ConstatV3>({ id: "resolu", subject_id: "coach-gari", etat: "resolu", gravite: "critique", ordre: 1, effort: "XS" });

  it("trie par gravité puis effort et met le noindex critique en première action", () => {
    expect(trierConstats([mineur, importantLong, critique, importantCourt]).map((c) => c.id)).toEqual(["noindex", "important-court", "important-long", "mineur"]);
    expect(actionsPrioritaires([mineur, importantLong, critique, importantCourt, resolu], "coach-gari").map((c) => c.id)).toEqual(["noindex", "important-court", "important-long"]);
  });

  it("utilise les seuils Google exacts sans classer une valeur absente", () => {
    expect(niveauSignal(2500, 2500, 4000)).toBe("bon");
    expect(niveauSignal(2501, 2500, 4000)).toBe("a_ameliorer");
    expect(niveauSignal(4001, 2500, 4000)).toBe("mauvais");
    expect(niveauSignal(0.1, 0.1, 0.25)).toBe("bon");
    expect(niveauSignal(201, 200, 600)).toBe("a_ameliorer");
    expect(niveauSignal(1800, 1800, 3000)).toBe("bon");
    expect(niveauSignal(null, 200, 600)).toBeNull();
  });
});

describe("demande d'analyse", () => {
  it("appelle uniquement vis_demander_analyse avec le sujet exact", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "demande-1", error: null });
    await expect(demanderAnalyse({ p_subject: "coach-gari" }, { rpc } as unknown as ClientRpc)).resolves.toBe("demande-1");
    expect(rpc).toHaveBeenCalledWith("vis_demander_analyse", { p_subject: "coach-gari" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("suit seulement une demande ANALYSE en file ou en cours", () => {
    expect(demandeAnalyseActive([ligne<DemandeV2>({ subject_id: "coach-gari", type: "ANALYSE", statut: "RUNNING", demande_le: "2026-11-16" })], "coach-gari")?.statut).toBe("RUNNING");
    expect(demandeAnalyseActive([ligne<DemandeV2>({ subject_id: "coach-gari", type: "ANALYSE", statut: "DONE", demande_le: "2026-11-16" })], "coach-gari")).toBeUndefined();
  });
});

describe("Markdown et profils", () => {
  it("rend le gras, les listes et les liens sans jamais créer de script", () => {
    const vue = render(<MarkdownSecurise texte={"**Important**\n- Premier point\n[Documentation](https://example.com)\n<script>window.evil=true</script>\n[Lien refusé](javascript:alert(1))"} passage="Important" />);
    expect(vue.getByText("Important").tagName).toBe("MARK");
    expect(vue.getByRole("list")).toBeInTheDocument();
    expect(vue.getByRole("link", { name: "Documentation" })).toHaveAttribute("href", "https://example.com");
    expect(vue.container.querySelector("script")).toBeNull();
    expect(vue.queryByText(/window\.evil/)).toBeNull();
    expect(vue.queryByRole("link", { name: "Lien refusé" })).toBeNull();
  });

  it("tronque la réponse et permet de lire la suite", () => {
    const texte = "Un paragraphe suffisamment long pour dépasser quatre lignes. ".repeat(8);
    const vue = render(<ReponseMarkdown texte={texte} passage="paragraphe" marque="Coach Gari" />);
    expect(vue.getByTestId("contenu-markdown").className).toContain("max-h-28");
    fireEvent.click(vue.getByRole("button", { name: "Lire la suite" }));
    expect(vue.getByTestId("contenu-markdown").className).not.toContain("max-h-28");
    expect(vue.container.querySelectorAll("mark").length).toBeGreaterThan(0);
  });

  it("sépare les profils de la marque et groupe les autres par plateforme", () => {
    const profils = [
      ligne<ReseauVisibility>({ reseau: "Instagram", handle: "https://instagram.com/studio.ardoise", citations: 4 }),
      ligne<ReseauVisibility>({ reseau: "Instagram", handle: "https://instagram.com/autre", citations: 9 }),
      ligne<ReseauVisibility>({ reseau: "TikTok", handle: "@autre", citations: 2 }),
    ];
    const separation = separerProfils(profils, { sites: ["studio-ardoise.fr"], profils: [{ reseau: "Instagram", handle: "@studio.ardoise" }] });
    expect(separation.marque.map((p) => p.handle)).toEqual(["https://instagram.com/studio.ardoise"]);
    expect(separation.autres).toHaveLength(2);
    expect(groupesReseaux(separation.autres).map((g) => g.reseau)).toEqual(["Instagram", "TikTok"]);
    expect(separerProfils(profils, { sites: [], profils: [] }).marque).toEqual([]);
  });
});

describe("lectures du contrat", () => {
  it("expose exactement les quatre nouvelles vues v3", () => {
    expect(VUES_VISIBILITY_V3).toEqual(["vis_score_v3", "vis_score_historique_v3", "vis_analyses_v3", "vis_constats_v3"]);
    expect(typeof lireVisibilityV3).toBe("function");
  });
});
