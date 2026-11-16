import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatriceQuestions } from "@/components/oia/visibility-audits";
import { MarkdownSecurise } from "@/components/oia/visibility-markdown";
import {
  classementConcurrents, domainesCites, lireCsvAudit, matriceDepuisLignes,
  peutImporterAudit, type MatriceAudit,
} from "@/lib/donnees/visibility-audits";
import { importerAuditExterne, type ClientRpc, type Fonctions } from "@/lib/donnees/visibility-pilotage";
import type { AuditExterneLigneV3 } from "@/lib/donnees/visibility-v3";

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
afterEach(cleanup);

const matrice: MatriceAudit[] = [
  {
    id: "K03", sujet: "Coach certifié", question: "Quel coach certifié PadelMBA à Dubaï ?",
    scores: { ChatGPT: 0, Gemini: 1, Copilot: 3 },
    concurrents: { ChatGPT: ["Urban Padel"], Gemini: ["Urban Padel", "Padel Pro"], Copilot: [] },
    domaines: { ChatGPT: ["urban.ae", "padel.com"], Gemini: ["urban.ae"], Copilot: ["padel-mba.com"] },
  },
  {
    id: "K20", sujet: "Bilan", question: "Où faire un bilan de padel ?",
    scores: { ChatGPT: 2, Gemini: 0, Copilot: 3 },
    concurrents: { ChatGPT: ["Padel Pro"], Gemini: [], Copilot: [] },
    domaines: { ChatGPT: ["padel.com"], Gemini: [], Copilot: ["padel-mba.com"] },
  },
];

describe("import CSV des audits externes", () => {
  it("lit les champs entre guillemets avec virgules et traite le tiret cadratin comme vide", () => {
    const csv = 'id,topic,prompt,ChatGPT_score,ChatGPT_competitors,ChatGPT_cited_domains,Gemini_score,Gemini_competitors,Gemini_cited_domains\nK03,"Coach, certification","Quel coach, choisir ?",3,"Acme;Padel Pro","example.com,padel.com",1,"—","—"';
    const resultat = lireCsvAudit(csv);
    expect(resultat.moteurs).toEqual(["ChatGPT", "Gemini"]);
    expect(resultat.matrice).toEqual([{
      id: "K03", sujet: "Coach, certification", question: "Quel coach, choisir ?",
      scores: { ChatGPT: 3, Gemini: 1 },
      concurrents: { ChatGPT: ["Acme", "Padel Pro"], Gemini: [] },
      domaines: { ChatGPT: ["example.com", "padel.com"], Gemini: [] },
    }]);
  });

  it("refuse un score hors du barème contractuel", () => {
    expect(() => lireCsvAudit("id,topic,prompt,ChatGPT_score,ChatGPT_competitors,ChatGPT_cited_domains\nK01,Sujet,Question,4,—,—")).toThrow("score doit être un entier de 0 à 3");
  });
});

describe("matrice et calculs dans le navigateur", () => {
  it("recompose la matrice et conserve les deux premiers choix Copilot de Coach Gari", () => {
    const lignes = [
      ligne<AuditExterneLigneV3>({ audit_id: "a1", question_id: "K20", sujet: "Bilan", question: "Question K20", ordre: 20, moteur: "Copilot", score: 3, concurrents: [], domaines: ["padel-mba.com"] }),
      ligne<AuditExterneLigneV3>({ audit_id: "a1", question_id: "K03", sujet: "Coach certifié", question: "Question K03", ordre: 3, moteur: "Copilot", score: 3, concurrents: [], domaines: ["padel-mba.com"] }),
      ligne<AuditExterneLigneV3>({ audit_id: "a1", question_id: "K03", sujet: "Coach certifié", question: "Question K03", ordre: 3, moteur: "ChatGPT", score: 0, concurrents: ["Urban Padel"], domaines: [] }),
    ];
    const resultat = matriceDepuisLignes(lignes, ["ChatGPT", "Gemini", "Copilot"]);
    expect(resultat.map((q) => q.id)).toEqual(["K03", "K20"]);
    expect(resultat[0]?.scores).toEqual({ ChatGPT: 0, Gemini: 0, Copilot: 3 });
    expect(resultat[1]?.scores["Copilot"]).toBe(3);
  });

  it("classe les concurrents par réponses puis par nombre de moteurs", () => {
    expect(classementConcurrents(matrice)).toEqual([
      { nom: "Padel Pro", reponses: 2, moteurs: 2 },
      { nom: "Urban Padel", reponses: 2, moteurs: 2 },
    ]);
    expect(domainesCites(matrice)[0]).toEqual({ nom: "padel-mba.com", citations: 2 });
    expect(domainesCites(matrice).find((d) => d.nom === "urban.ae")?.citations).toBe(2);
  });

  it("ouvre le détail d'une case de la matrice", () => {
    const vue = render(<MatriceQuestions moteurs={["ChatGPT", "Gemini", "Copilot"]} matrice={matrice} />);
    fireEvent.click(vue.getByRole("button", { name: /K03, ChatGPT, score 0 sur 3/ }));
    expect(vue.getByRole("status").textContent).toContain("Urban Padel");
    expect(vue.getByRole("status").textContent).toContain("urban.ae, padel.com");
  });
});

describe("rapport et import RPC", () => {
  it("rend le rapport Markdown sans HTML brut ni script", () => {
    const vue = render(<MarkdownSecurise texte={"# Rapport\n**Conclusion**\n<script>alert(1)</script>\n<img src=x onerror=alert(2)>"} />);
    expect(vue.container.querySelector("script")).toBeNull();
    expect(vue.container.querySelector("img")).toBeNull();
    expect(vue.queryByText(/alert\(/)).toBeNull();
    expect(vue.getByText("Conclusion").tagName).toBe("STRONG");
  });

  it("appelle vis_importer_audit_externe avec tous les paramètres du contrat", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "audit-uuid", error: null });
    const params: Fonctions["vis_importer_audit_externe"]["Args"] = {
      p_subject: "coach-gari", p_outil: "Perplexity Computer", p_realise_le: "2026-11-16",
      p_methode: "20 questions sur trois moteurs", p_moteurs: ["ChatGPT", "Gemini", "Copilot"],
      p_score: 4, p_resume: "Visibilité externe faible", p_rapport_md: "# Rapport",
      p_matrice: matrice as unknown as Fonctions["vis_importer_audit_externe"]["Args"]["p_matrice"],
    };
    await expect(importerAuditExterne(params, { rpc } as unknown as ClientRpc)).resolves.toBe("audit-uuid");
    expect(rpc).toHaveBeenCalledWith("vis_importer_audit_externe", params);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("limite l'import aux rôles owner et approver", () => {
    expect(peutImporterAudit("owner")).toBe(true);
    expect(peutImporterAudit("approver")).toBe(true);
    expect(peutImporterAudit("viewer")).toBe(false);
    expect(peutImporterAudit(null)).toBe(false);
  });
});
