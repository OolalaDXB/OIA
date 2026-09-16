import { describe, expect, it } from "vitest";
import { chooseListingLink } from "../src/scout-navigation";

/**
 * Written against the real links the first scout run captured from the real
 * portals. The failure being fixed: fourteen sources read, zero calls found,
 * because every entry URL was a homepage and a homepage does not list calls.
 */

describe("finding the page that lists the calls", () => {
  it("prefers 'appels à projets' over everything else on an ADEME-style homepage", () => {
    const choice = chooseListingLink("https://agirpourlatransition.ademe.fr/entreprises", [
      { url: "https://agirpourlatransition.ademe.fr/entreprises/actualites", text: "Actualités" },
      { url: "https://agirpourlatransition.ademe.fr/entreprises/appels-a-projets", text: "Appels à projets" },
      { url: "https://agirpourlatransition.ademe.fr/entreprises/contact", text: "Contact" },
    ]);
    expect(choice?.url).toBe("https://agirpourlatransition.ademe.fr/entreprises/appels-a-projets");
  });

  it("never follows a link off the source's own site", () => {
    // Otherwise the scout reads somebody else's portal and files it under this source.
    const choice = chooseListingLink("https://hub71.com", [
      { url: "https://someone-else.com/funding-opportunities", text: "Funding opportunities" },
    ]);
    expect(choice).toBeNull();
  });

  it("ignores login, cookie and careers links that share vocabulary", () => {
    const choice = chooseListingLink("https://aides-territoires.beta.gouv.fr", [
      { url: "https://aides-territoires.beta.gouv.fr/comptes/connexion", text: "Se connecter pour trouver des aides" },
      { url: "https://aides-territoires.beta.gouv.fr/cookies", text: "Gérer les cookies" },
    ]);
    // "aides" appears in the login text, but the anti-signals outweigh it.
    expect(choice).toBeNull();
  });

  it("returns null rather than a weak guess", () => {
    // Nothing found is honest; the wrong page found is worse than nothing.
    expect(
      chooseListingLink("https://x.fr", [
        { url: "https://x.fr/equipe", text: "Notre équipe" },
        { url: "https://x.fr/histoire", text: "Notre histoire" },
      ]),
    ).toBeNull();
  });

  it("scores a deeper path under the entry page above a sibling section", () => {
    const choice = chooseListingLink("https://www.bretagne.bzh/aides", [
      { url: "https://www.bretagne.bzh/autres/subventions", text: "Subventions" },
      { url: "https://www.bretagne.bzh/aides/subventions", text: "Subventions" },
    ]);
    expect(choice?.url).toBe("https://www.bretagne.bzh/aides/subventions");
  });

  it("handles the English vocabulary of UNGM and the World Bank", () => {
    expect(
      chooseListingLink("https://www.ungm.org", [
        { url: "https://www.ungm.org/Public/Notice", text: "Business opportunities" },
      ])?.url,
    ).toBe("https://www.ungm.org/Public/Notice");
  });

  it("does not follow a PDF", () => {
    expect(
      chooseListingLink("https://x.fr", [{ url: "https://x.fr/appels-a-projets-2027.pdf", text: "Appels à projets" }]),
    ).toBeNull();
  });

  it("never returns the entry page itself", () => {
    expect(
      chooseListingLink("https://x.fr/aides", [{ url: "https://x.fr/aides/", text: "Aides" }]),
    ).toBeNull();
  });
});
