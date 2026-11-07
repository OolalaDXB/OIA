import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoireLocale } from "../src/memoire-locale.js";
import { ShyrkaSession } from "../src/session.js";
import { IDENTITY_V0 } from "../src/identity.js";
import type { ChatMessage } from "../src/types.js";

function temporaire() {
  const dir = mkdtempSync(join(tmpdir(), "shyrka-memoire-"));
  const memoire = new MemoireLocale({ racine: dir, pourTests: true });
  return { dir, memoire, nettoyer: () => { memoire.fermer(); rmSync(dir, { recursive: true, force: true }); } };
}

describe("memoire locale persistante v1", () => {
  it("retient sur disque et retrouve apres redemarrage", () => {
    const t = temporaire();
    try {
      expect(t.memoire.traiter("Retiens que je préfère les outils locaux.")).toMatch(/M0001/);
      t.memoire.fermer();
      const relance = new MemoireLocale({ racine: t.dir, pourTests: true });
      expect(relance.traiter("De quoi te souviens-tu ?")).toMatch(/outils locaux/);
      relance.fermer();
    } finally { t.nettoyer(); }
  });

  it("evite les doublons, oublie et empeche une reinsertion identique", () => {
    const t = temporaire();
    try {
      t.memoire.retenir("Je préfère les composants réutilisables.");
      expect(t.memoire.retenir("Je préfère les composants réutilisables.")).toMatch(/deja/);
      expect(t.memoire.traiter("oublie M0001")).toMatch(/oublie/);
      expect(t.memoire.lister()).toHaveLength(0);
      expect(t.memoire.retenir("Je préfère les composants réutilisables.")).toMatch(/oubliee/);
    } finally { t.nettoyer(); }
  });

  it("refuse les donnees Swift et refuse toute suppression ambigue", () => {
    const t = temporaire();
    try {
      expect(t.memoire.traiter("Retiens que Swift m'a transmis un dossier.")).toMatch(/Swift/);
      expect(t.memoire.traiter("Oublie tout ce que je t'ai dit.")).toMatch(/identifiant/);
      expect(t.memoire.lister()).toHaveLength(0);
    } finally { t.nettoyer(); }
  });

  it("mode prive : rien conserve ni consulte", () => {
    const t = temporaire();
    try {
      t.memoire.retenir("J'aime les tests reproductibles.");
      expect(t.memoire.traiter("Active le mode privé")).toMatch(/prive/);
      expect(t.memoire.retenir("Un secret.")).toMatch(/prive/);
      expect(t.memoire.contextePour("tests reproductibles")).toBe("");
      expect(t.memoire.traiter("Désactive le mode privé")).toMatch(/desactive/);
      expect(t.memoire.chercher("tests reproductibles")).toHaveLength(1);
    } finally { t.nettoyer(); }
  });

  it("ne cree aucune base quand le volume est absent", () => {
    const t = temporaire();
    const path = join(t.dir, "introuvable");
    try {
      const m = new MemoireLocale({ racine: path, pourTests: true });
      expect(m.retenir("J'aime le local")).toMatch(/n'est pas monte/);
      expect(m.disponible).toBe(false);
    } finally { t.nettoyer(); }
  });

  it("rappel contextuel uniquement sur un modele Ollama", async () => {
    const t = temporaire();
    try {
      t.memoire.retenir("Mon projet SILLON est un ERP pour disquaires.");
      const localCalls: ChatMessage[][] = [];
      const local = new ShyrkaSession({
        model: { name: "ollama:qwen3:8b", chat: async (m) => { localCalls.push(m); return "Bien compris."; } },
        memoire: t.memoire, identity: IDENTITY_V0, print: () => {},
      });
      await local.textTurn("Explique le projet SILLON simplement");
      expect(localCalls[0]?.[0]?.content).toContain("ERP pour disquaires");
      const cloudCalls: ChatMessage[][] = [];
      const cloud = new ShyrkaSession({
        model: { name: "mistral:test", chat: async (m) => { cloudCalls.push(m); return "Compris."; } },
        mistralAutorise: true,
        memoire: t.memoire, identity: IDENTITY_V0, print: () => {},
      });
      await cloud.textTurn("Explique le projet SILLON simplement");
      expect(cloudCalls[0]?.[0]?.content).not.toContain("ERP pour disquaires");
    } finally { t.nettoyer(); }
  });
});
