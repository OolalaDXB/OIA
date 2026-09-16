import { describe, expect, it } from "vitest";
import { extractTenderFacts } from "../src/tender-facts";

/**
 * The extractor was looking for words that were never going to be there.
 *
 * TED translates a notice's TITLE to English and leaves the BODY in the buyer's
 * language. The section patterns were English-only, so a German notice's
 * "Eignungskriterien" and an Italian one's "Criteri di selezione" were invisible
 * — an eligibility section was found on 9 records out of 47, and the analyst was
 * then asked whether we can apply to documents whose eligibility text had never
 * been extracted. It answered "the document does not say", 37 times, correctly.
 */

const page = (heading: string, body: string) =>
  `<html><body><h1>Notice</h1><h2>${heading}</h2><p>${body}</p></body></html>`;

const eligibilityOf = (html: string) =>
  extractTenderFacts(html, { artifactId: "a" }).find((f) => f.field === "eligibility")?.normalizedValue ?? "";

describe("section headings in the languages notices are written in", () => {
  it("German — Eignungskriterien", () => {
    expect(eligibilityOf(page("Eignungskriterien", "Nur Unternehmen mit Sitz in der Europäischen Union sind zur Teilnahme berechtigt."))).toContain("Unternehmen");
  });

  it("German — Teilnahmebedingungen and Ausschlussgründe", () => {
    expect(eligibilityOf(page("Teilnahmebedingungen", "Bewerber müssen im Handelsregister registriert sein und dies nachweisen können."))).toContain("registriert");
    expect(eligibilityOf(page("Ausschlussgründe", "Ein laufendes Insolvenzverfahren führt zwingend zum Ausschluss vom Verfahren."))).toContain("Insolvenz");
  });

  it("German — technische Leistungsfähigkeit", () => {
    expect(eligibilityOf(page("Technische und berufliche Leistungsfähigkeit", "Drei vergleichbare Referenzen aus den letzten fünf Jahren sind erforderlich."))).toContain(
      "Referenzen",
    );
  });

  it("French — critères de sélection and conditions de participation", () => {
    expect(eligibilityOf(page("Critères de sélection", "Ce dispositif est réservé aux PME françaises de moins de 250 salariés."))).toContain("PME");
    expect(eligibilityOf(page("Conditions de participation", "L'inscription au registre du commerce est obligatoire pour candidater."))).toContain("registre");
  });

  it("Italian — criteri di selezione", () => {
    expect(eligibilityOf(page("Criteri di selezione", "Riservato alle imprese iscritte alla camera di commercio da almeno due anni."))).toContain("imprese");
  });

  it("Spanish — criterios de selección", () => {
    expect(eligibilityOf(page("Criterios de selección", "Solo podrán participar empresas registradas en el registro mercantil español."))).toContain("empresas");
  });

  it("Dutch — selectiecriteria", () => {
    expect(eligibilityOf(page("Selectiecriteria", "Alleen geregistreerde ondernemingen met een vestiging in Nederland mogen meedoen."))).toContain("ondernemingen");
  });

  it("still reads English, which was never broken", () => {
    expect(eligibilityOf(page("Selection criteria", "This call is open to registered SMEs with at least two years of trading history."))).toContain("SMEs");
  });

  it("does not invent an eligibility section that is not there", () => {
    // The guarantee that matters: a wider net must not start catching nothing.
    expect(eligibilityOf(page("Contact", "Write to procurement@example.eu for any question about this notice or its annexes."))).toBe("");
  });

  it("reads a value stated in the local language", () => {
    const facts = extractTenderFacts(page("Auftragswert", "Der geschätzte Auftragswert beträgt EUR 250 000 ohne Mehrwertsteuer für die Laufzeit."), { artifactId: "a" });
    expect(facts.find((f) => f.field === "estimated_value")?.normalizedValue).toContain("250");
  });
});
