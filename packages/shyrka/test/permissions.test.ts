import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { PERMISSIONS_FERMEES, decider, loadPermissions, type Permissions } from "../src/permissions.js";

const suivi = fileURLToPath(new URL("../../../infra/shyrka/permissions.json", import.meta.url));
const avec = (email: Permissions["canaux"]["email"], extra: Partial<Permissions> = {}): Permissions => ({ ...PERMISSIONS_FERMEES, canaux: { email, whatsapp: { palier: "aucun", delegations: [] } }, ...extra });

describe("paliers de permission", () => {
  it("le fichier suivi n'accorde rien : aucune capacité d'engagement par défaut", () => {
    const { permissions, warning } = loadPermissions(suivi);
    expect(warning).toBeUndefined();
    for (const canal of ["email", "whatsapp"] as const) {
      expect(permissions.canaux[canal].palier).toBe("aucun");
      expect(decider(permissions, canal, "lire").autorise).toBe(false);
      expect(decider(permissions, canal, "envoyer").autorise).toBe(false);
    }
    expect(permissions.exclus.domaines).toContain("swift.com");
  });

  it("seul Mickaël accorde : un autre signataire rend le fichier invalide, donc tout fermé", () => {
    const r = loadPermissions("x", () => JSON.stringify({ ...PERMISSIONS_FERMEES, accordePar: "Shyrka", canaux: { email: { palier: "envoyer-seule", delegations: [] }, whatsapp: { palier: "aucun", delegations: [] } } }));
    expect(r.warning).toMatch(/invalides/);
    expect(r.permissions).toEqual(PERMISSIONS_FERMEES);
    expect(loadPermissions("/nulle/part").permissions).toEqual(PERMISSIONS_FERMEES);
  });

  it("les paliers s'ouvrent dans l'ordre : lire, préparer, répondre après validation, envoyer seule", () => {
    const p = (palier: Permissions["canaux"]["email"]["palier"]) => avec({ palier, delegations: [] });
    expect(decider(p("lire"), "email", "lire").autorise).toBe(true);
    expect(decider(p("lire"), "email", "preparer").autorise).toBe(false);
    expect(decider(p("preparer"), "email", "preparer").autorise).toBe(true);
    expect(decider(p("preparer"), "email", "envoyer").validationRequise).toBe(false);
    const sansValidation = decider(p("repondre-apres-validation"), "email", "envoyer", { categorie: "rendez-vous" });
    expect(sansValidation).toMatchObject({ autorise: false, validationRequise: true });
  });

  it("une validation ne vaut que pour ce brouillon et ce texte", () => {
    const p = avec({ palier: "repondre-apres-validation", delegations: [] });
    const brouillon = { id: "b1", empreinte: "abc" };
    expect(decider(p, "email", "envoyer", { brouillon, validation: { brouillonId: "b1", empreinte: "abc" } }).autorise).toBe(true);
    expect(decider(p, "email", "envoyer", { brouillon, validation: { brouillonId: "b2", empreinte: "abc" } }).autorise).toBe(false);
    expect(decider(p, "email", "envoyer", { brouillon, validation: { brouillonId: "b1", empreinte: "autre" } }).autorise).toBe(false);
  });

  it("envoyer seule : seulement pour une catégorie déléguée par écrit, jamais pour une catégorie qui remonte toujours", () => {
    const p = avec({ palier: "envoyer-seule", delegations: [{ categorie: "rendez-vous", signeLe: "2026-11-08" }] }, { toujoursRemonter: ["presse"] });
    expect(decider(p, "email", "envoyer", { categorie: "rendez-vous" }).autorise).toBe(true);
    expect(decider(p, "email", "envoyer", { categorie: "plainte-client" })).toMatchObject({ autorise: false, validationRequise: true });
    const p2 = avec({ palier: "envoyer-seule", delegations: [{ categorie: "presse", signeLe: "2026-11-08" }] }, { toujoursRemonter: ["presse"] });
    expect(decider(p2, "email", "envoyer", { categorie: "presse" }).autorise).toBe(false);
  });

  it("les canaux sont indépendants", () => {
    const p = avec({ palier: "envoyer-seule", delegations: [{ categorie: "ambigu", signeLe: "2026-11-08" }] });
    expect(decider(p, "whatsapp", "lire").autorise).toBe(false);
  });
});
