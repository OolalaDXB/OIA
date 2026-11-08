import { describe, expect, it } from "vitest";
import { actionClavierImmersive, DELAI_ENVOI_MS, libelleImmersif, TRANSCRIPTION_SIMULEE } from "@/lib/shyrka-immersive";

describe("Présence immersive de Shyrka", () => {
  it("ouvre ou ferme le plein écran avec F, hors saisie", () => {
    expect(actionClavierImmersive({ key: "f" })).toBe("plein-ecran");
    expect(actionClavierImmersive({ key: "f", saisie: true })).toBe("aucune");
  });
  it("maintient la parole avec la barre d’espace sans répéter l’action", () => {
    expect(actionClavierImmersive({ key: " " })).toBe("parole");
    expect(actionClavierImmersive({ key: " ", repeat: true })).toBe("aucune");
  });
  it("envoie la transcription avec Entrée et la corrige avec une autre touche", () => {
    expect(actionClavierImmersive({ key: "Enter", enAttente: true })).toBe("envoyer");
    expect(actionClavierImmersive({ key: "x", enAttente: true })).toBe("corriger");
    expect(DELAI_ENVOI_MS).toBe(4000);
    expect(TRANSCRIPTION_SIMULEE.length).toBeGreaterThan(0);
  });
  it("ouvre la saisie dès qu’un caractère est tapé", () => {
    expect(actionClavierImmersive({ key: "b" })).toBe("ecrire");
    expect(actionClavierImmersive({ key: "b", modifieur: true })).toBe("aucune");
  });
  it("donne un mot à chaque état et aucun libellé au repos", () => {
    expect(libelleImmersif("ecoute", false, false)).toBe("Écoute");
    expect(libelleImmersif("reflexion", false, false)).toBe("Réflexion");
    expect(libelleImmersif("repos", true, false)).toBe("Parle");
    expect(libelleImmersif("repos", false, false)).toBe("");
  });
});
