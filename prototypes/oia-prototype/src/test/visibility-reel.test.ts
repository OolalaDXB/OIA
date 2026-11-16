import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from } }));
import { convertirVisibility, lireVueVisibility, VUES_VISIBILITY, type LigneVisibility, type VuesSujet } from "@/lib/donnees/visibility-reel";
import type { SujetVisibility } from "@/lib/donnees/visibility";

const sujet: SujetVisibility = { id: "coach-gari", clientId: "coach-gari", nom: "Coach Gari", role: "owner", statut: "actif", domaines: ["coachgari28.com"] };
const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
const mesure = ligne<LigneVisibility<"vis_mesure_v1">>({ client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", type_fenetre: "baseline", version_panel: 2, statut_fenetre: "done", debut: "2026-11-07", fin: "2026-11-12", jours_prevus: 5, jours_mesures: 5, jours_manquants: 0, reponses: 250, reponses_jugees: 236, reponses_non_jugees: 14, questions: 10, moteurs: ["chatgpt"], versions_modele: ["chatgpt:gpt-reel"], changement_modele: false, langues: ["en"], collecteurs: ["elmo"], cout_estime_usd: 22.918856, etat: "mesure_terminee" });
const apercu = (indicateur: string, valeur: number | null, denominateur: number | null = 236) => ligne<LigneVisibility<"vis_apercu_v1">>({ client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", moteur: "tous", indicateur, ordre: 1, numerateur: 30, denominateur, valeur, methode_intervalle: "wilson_95", borne_basse: valeur === null ? null : 0.0905, borne_haute: valeur === null ? null : 0.1757, jours_mesures: 5, jours_prevus: 5, etat: valeur === null ? "non_mesurable" : "mesure", raison_non_mesurable: valeur === null ? "Aucune réponse jugée." : null });
const vues: VuesSujet = {
  vis_mesure_v1: [mesure],
  vis_apercu_v1: [apercu("presence", 0.1271), apercu("part_de_voix", 0.4348, 69)],
  vis_reponses_v1: [ligne<LigneVisibility<"vis_reponses_v1">>({ id: "reponse-1", client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", question_id: "en-01", version_question: 2, langue: "en", moteur: "chatgpt", version_modele: "gpt-reel", fournisseur: "openai-api", collecteur: "elmo", recu_le: "2026-11-12T10:00:00Z", jour: "2026-11-12", texte: "Réponse réelle", empreinte: "preuve-reelle", statut_jugement: "jugee", marque_citee: true, concurrents: [], recherche_web: true, nb_citations: 2, cout_usd: 0.25 })],
  vis_citations_v1: [ligne<LigneVisibility<"vis_citations_v1">>({ client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", moteur: "chatgpt", url: "https://coachgari28.com/", domaine: "coachgari28.com", categorie: "marque", citations: 10, reponses: 5, questions: 2, premier_jour: "2026-11-07", dernier_jour: "2026-11-12" })],
  vis_reseaux_sociaux_v1: [ligne<LigneVisibility<"vis_reseaux_sociaux_v1">>({ client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", plateforme: "linkedin", url: "https://linkedin.com/in/profil", citations: 8, denominateur: 100, part: 0.08, questions: 2, moteurs: ["chatgpt"] })],
  vis_concurrents_v1: [ligne<LigneVisibility<"vis_concurrents_v1">>({ client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", moteur: "tous", entite: "coach-gari", est_marque: true, mentions: 30, denominateur_part: 69, part_de_voix: 0.4348, reponses_jugees: 236, taux_apparition: 0.1271, methode_intervalle: "wilson_95", borne_basse: 0.3636, borne_haute: 0.4667, questions: 2 })],
  vis_questions_v1: [ligne<LigneVisibility<"vis_questions_v1">>({ client_id: "coach-gari", subject_id: "coach-gari", window_id: "coach-gari-j0", question_id: "en-01", version_question: 2, langue: "en", texte: "Best padel coach in Dubai", marquee: false, etiquettes: ["unbranded", "AE"], moteur: "chatgpt", jour: "2026-11-12", reponses: 2, reponses_jugees: 2, avec_marque: 1, etat: "mesure" })],
  vis_recommandations_v1: [ligne<LigneVisibility<"vis_recommandations_v1">>({ id: "rec-1", client_id: "coach-gari", subject_id: "coach-gari", site_id: "coach-gari", window_id: null, type: "TECH_FIX", titre: "Prix lisibles", enonce: "Énoncé réel", impact: "medium", effort: "S", risque: "low", confiance: "medium", cree_par: "moteur", cree_le: "2026-11-07T10:00:00Z", priorite: 2, etat: "pending", decide_par: null, decide_le: null, motif: null, derniere_execution: null, reference_execution: null, execute_le: null, preuves: [] })],
  vis_rapports_v1: [],
};

describe("adaptateur Visibility réel", () => {
  it("lit la fenêtre réelle et convertit les fractions en pourcentages", () => {
    const d = convertirVisibility(sujet, [sujet], vues);
    expect(d.reel).toBe(true);
    expect(d.sujetActif).toBe("coach-gari");
    expect(d.fenetres).toHaveLength(1);
    expect(d.fenetres[0]!).toMatchObject({ id: "coach-gari-j0", label: "du 7 au 12 novembre 2026", enCours: false });
    expect(d.indicateurs["coach-gari-j0"]!.presence).toMatchObject({ v: 12.71, min: 9.05, max: 17.57 });
    expect(d.indicateurs["coach-gari-j0"]!.partVoix.v).toBe(43.48);
    expect(d.etatCollecte.reponses).toBe(250);
    expect(d.reponses[0]!.texte).toBe("Réponse réelle");
    expect(JSON.stringify(d)).not.toContain("Studio Ardoise");
  });

  it("n'invente ni sentiment, ni exactitude, ni position, ni intervalle par question", () => {
    const d = convertirVisibility(sujet, [sujet], vues);
    const i = d.indicateurs["coach-gari-j0"]!;
    expect(i.exactitude.v).toBeNull();
    expect(i.exactitude.raison).toContain("faits validés");
    expect(i.position.v).toBeNull();
    expect(i.sentiment.positif).toBeNull();
    expect(i.sentiment.raison).toContain("Jev");
    const q = d.presenceQuestionsParFenetre!["coach-gari-j0"]!["Tous"]!["en-01"]!;
    expect(q).toMatchObject({ v: 50, min: null, max: null });
    expect(q.raison).toContain("Intervalle");
    expect(d.reponses[0]!.recherches).toBeNull();
    expect(d.opportunites).toEqual([]);
  });

  it("un dénominateur nul reste non mesurable, jamais zéro pour cent", () => {
    const d = convertirVisibility(sujet, [sujet], { ...vues, vis_apercu_v1: [apercu("presence", 0, 0)] });
    expect(d.indicateurs["coach-gari-j0"]!.presence.v).toBeNull();
    expect(d.indicateurs["coach-gari-j0"]!.presence.raison).toContain("dénominateur");
  });

  it("garde un nouveau site sans fenêtre IA en état non mesurable, sans erreur", () => {
    const d = convertirVisibility(sujet, [sujet], { ...vues, vis_mesure_v1: [], vis_apercu_v1: [] });
    expect(d.fenetres).toEqual([]);
    expect(d.vueSite.presence).toBeNull();
    expect(d.citations).toEqual([]);
    expect(d.etatCollecte.frequence).toContain("Aucune fenêtre");
  });

  it("présente la fenêtre principale avant la fenêtre hors panel", () => {
    const horsPanel = { ...mesure, window_id: "coach-gari-j0-hors-panel" };
    const d = convertirVisibility(sujet, [sujet], { ...vues, vis_mesure_v1: [horsPanel, mesure] });
    expect(d.fenetres[0]!.id).toBe("coach-gari-j0");
    expect(d.fenetres.map((f) => f.id)).toContain("coach-gari-j0-hors-panel");
  });

  it("utilise les vues v1 et les compléments v2 sans revenir aux recommandations v1", () => {
    expect(VUES_VISIBILITY).toEqual(["vis_sujets_v1", "vis_mesure_v1", "vis_apercu_v1", "vis_reponses_v1", "vis_citations_v1", "vis_reseaux_sociaux_v1", "vis_concurrents_v1", "vis_questions_v1", "vis_recommandations_v2", "vis_rapports_v1", "vis_jugements_v2", "vis_jugements_moteurs_v2", "vis_reponses_sources_v2", "vis_couts_moteurs_v2"]);
  });

  it("utilise les jugements, sources, coûts et recommandations v2 avec leur origine", () => {
    const d = convertirVisibility(sujet, [sujet], {
      ...vues,
      vis_jugements_moteurs_v2: [ligne<LigneVisibility<"vis_jugements_moteurs_v2">>({ window_id: "coach-gari-j0", moteur: "tous", reponses: 1, jugees: 1, non_mesurables: 0, marque_citee: 1, sentiment_positif: 1, sentiment_neutre: 0, sentiment_negatif: 0, sentiment_mixte: 0, position_moyenne: 2.5, etat: "mesure", raison: null, source: "extrait (Jev 1.13)" })],
      vis_jugements_v2: [ligne<LigneVisibility<"vis_jugements_v2">>({ reponse_id: "reponse-1", etat: "extrait", source: "extrait (Jev 1.13)", marque_citee: true, sentiment: "positive", position: 2, mentions: 1, passage: "Passage réel" })],
      vis_reponses_sources_v2: [ligne<LigneVisibility<"vis_reponses_sources_v2">>({ reponse_id: "reponse-1", citations: [{ ordre: 1, url: "https://source.example", titre: "Source", domaine: "source.example" }], nb_citations: 1, recherches: null, etat_recherches: "non_fourni" })],
      vis_couts_moteurs_v2: [ligne<LigneVisibility<"vis_couts_moteurs_v2">>({ window_id: "coach-gari-j0", moteur: "chatgpt", reponses: 2, cout_estime_usd: 4, reponses_cout_reel: 1, cout_reel_usd: 1.5 })],
      vis_recommandations_v2: [ligne<LigneVisibility<"vis_recommandations_v2">>({ id: "rec-v2", titre: "Recommandation v2", etat: "accepted", priorite: 1, mesuree_par_fenetre: "coach-gari-j1" })],
    });
    expect(d.indicateurs["coach-gari-j0"]!.position).toMatchObject({ v: 2.5, min: null, max: null });
    expect(d.indicateurs["coach-gari-j0"]!.sentiment).toMatchObject({ positif: 100, source: "extrait (Jev 1.13)", positifN: 1 });
    expect(d.reponses[0]).toMatchObject({ sentiment: "positif", sources: ["https://source.example"], recherches: null, position: 2 });
    expect(d.moteurs[0]).toMatchObject({ estime: 2, observe: 1.5 });
    expect(d.recommandationsV2![0]).toMatchObject({ id: "rec-v2", mesuree_par_fenetre: "coach-gari-j1" });
    expect(JSON.stringify(d)).not.toContain("Studio Ardoise");
  });
});

describe("lectures Supabase Visibility", () => {
  beforeEach(() => { vi.clearAllMocks(); const builder = { select: () => builder, eq: mock.eq, range: mock.range }; mock.eq.mockReturnValue(builder); mock.from.mockReturnValue(builder); });
  it("filtre le sujet et pagine sans clé de service", async () => {
    mock.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })), error: null }).mockResolvedValueOnce({ data: [{ id: "500" }], error: null });
    expect(await lireVueVisibility("vis_reponses_v1", "coach-gari")).toHaveLength(501);
    expect(mock.from).toHaveBeenCalledWith("vis_reponses_v1");
    expect(mock.eq).toHaveBeenCalledWith("subject_id", "coach-gari");
    expect(mock.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it("conserve le message et le code d'erreur", async () => {
    mock.range.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } });
    await expect(lireVueVisibility("vis_mesure_v1", "coach-gari")).rejects.toMatchObject({ message: "permission denied", code: "42501" });
  });
});
