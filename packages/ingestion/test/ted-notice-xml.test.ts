import { describe, expect, it } from "vitest";
import { readTedNoticeXml, tedXmlToFacts } from "../src/ted-notice-xml";

/**
 * The notice XML is the reason the eligibility gap exists at all: the HTML page
 * TED serves is a summary, and on 205 records only 19 carried an eligibility
 * section. These tests pin the two shapes the archive actually contains.
 */

/** eForms (2023+). Several namespace prefixes, on purpose — that is the trap. */
const EFORMS = `<?xml version="1.0" encoding="UTF-8"?>
<ContractNotice xmlns="urn:oasis:names:specification:ubl:schema:xsd:ContractNotice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:efac="http://data.europa.eu/p27/eforms-ubl-extension-aggregate-components/1">
  <cac:ProcurementProject>
    <cbc:Name languageID="ENG">Audiovisual production services</cbc:Name>
    <cbc:Description languageID="ENG">Production of documentary films and related post-production for the cultural programme.</cbc:Description>
  </cac:ProcurementProject>
  <cac:TenderingTerms>
    <cac:TendererQualificationRequest>
      <cac:SpecificTendererRequirement>
        <cbc:TendererRequirementTypeCode listName="exclusion-ground">crime-org</cbc:TendererRequirementTypeCode>
        <cbc:Description languageID="ENG">Participation in a criminal organisation is an exclusion ground.</cbc:Description>
      </cac:SpecificTendererRequirement>
    </cac:TendererQualificationRequest>
    <cac:AwardingTerms>
      <cac:AwardingCriterion>
        <cac:SubordinateAwardingCriterion>
          <cbc:Description languageID="ENG">Quality of the artistic proposal, weighted 60.</cbc:Description>
        </cac:SubordinateAwardingCriterion>
      </cac:AwardingCriterion>
    </cac:AwardingTerms>
    <cac:TenderRecipientParty>
      <cbc:EndpointID>https://portal.example.gov/tender/4711</cbc:EndpointID>
    </cac:TenderRecipientParty>
    <cac:CallForTendersDocumentReference>
      <cbc:ID>TENDER-DOCS</cbc:ID>
      <cac:Attachment>
        <cac:ExternalReference>
          <cbc:URI>https://portal.example.gov/tender/4711/documents</cbc:URI>
        </cac:ExternalReference>
      </cac:Attachment>
    </cac:CallForTendersDocumentReference>
  </cac:TenderingTerms>
  <cac:TenderingProcess>
    <cac:TenderSubmissionDeadlinePeriod>
      <cbc:EndDate>2026-11-20+01:00</cbc:EndDate>
      <cbc:EndTime>12:00:00+01:00</cbc:EndTime>
    </cac:TenderSubmissionDeadlinePeriod>
  </cac:TenderingProcess>
  <cac:ProcurementProjectLot>
    <cac:ProcurementProject>
      <cbc:Description languageID="ENG">Lot 1 covers camera crews for eight shooting days.</cbc:Description>
      <cac:RequestedTenderTotal>
        <cbc:EstimatedOverallContractAmount currencyID="EUR">2000000</cbc:EstimatedOverallContractAmount>
      </cac:RequestedTenderTotal>
    </cac:ProcurementProject>
  </cac:ProcurementProjectLot>
  <ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <efac:SelectionCriteria>
      <cbc:CalculationExpressionCode listName="usage">used</cbc:CalculationExpressionCode>
      <cbc:Description languageID="ENG">Average yearly turnover of at least EUR 2 000 000 over the last three financial years.</cbc:Description>
    </efac:SelectionCriteria>
    <efac:SelectionCriteria>
      <cbc:Description languageID="ENG">At least two comparable audiovisual productions delivered in the last five years.</cbc:Description>
    </efac:SelectionCriteria>
  </ext:UBLExtensions>
</ContractNotice>`;

/** TED_EXPORT (pre-2023). Entirely different tags, no prefixes, upper case. */
const LEGACY = `<?xml version="1.0" encoding="UTF-8"?>
<TED_EXPORT>
  <FORM_SECTION>
    <CONTRACT_NOTICE>
      <OBJECT_CONTRACT>
        <SHORT_DESCR><P>Fourniture de prestations audiovisuelles pour la region.</P></SHORT_DESCR>
        <VAL_ESTIMATED_TOTAL CURRENCY="EUR">1500000</VAL_ESTIMATED_TOTAL>
      </OBJECT_CONTRACT>
      <LEFTI>
        <SUITABILITY><P>Inscription au registre du commerce exigee.</P></SUITABILITY>
        <ECONOMIC_FINANCIAL_CAPACITY>
          <INFORMATION_AND_FORMALITIES><P>Chiffre d affaires annuel minimum de 1 000 000 EUR.</P></INFORMATION_AND_FORMALITIES>
          <MINIMUM_LEVEL><P>Attestation d assurance professionnelle.</P></MINIMUM_LEVEL>
        </ECONOMIC_FINANCIAL_CAPACITY>
      </LEFTI>
      <PROCEDURE>
        <DATE_RECEIPT_TENDERS>2026-10-01</DATE_RECEIPT_TENDERS>
        <URL_DOCUMENT>https://marches.example.fr/dossier/882</URL_DOCUMENT>
      </PROCEDURE>
    </CONTRACT_NOTICE>
  </FORM_SECTION>
</TED_EXPORT>`;

describe("readTedNoticeXml — eForms", () => {
  const facts = readTedNoticeXml(EFORMS);

  it("names the schema and the root element it read", () => {
    expect(facts.schema).toBe("EFORMS");
    expect(facts.rootElement).toBe("contractnotice");
  });

  it("finds selection criteria behind the efac: prefix", () => {
    // A parser that matched on the qualified name would find nothing here —
    // the criteria live under efac:, the project under cac:, the description
    // under cbc:. Local-name matching is the whole point.
    expect(facts.eligibility).toContain("turnover of at least EUR 2 000 000");
    expect(facts.eligibility).toContain("two comparable audiovisual productions");
  });

  it("keeps the exclusion grounds as eligibility too", () => {
    expect(facts.eligibility).toContain("criminal organisation");
  });

  it("does not repeat a nested criterion under its own parent", () => {
    // SpecificTendererRequirement sits inside TendererQualificationRequest and
    // both are wanted tags. Only the outermost is collected, or the analyst
    // reads the same sentence twice and calls the repetition corroboration.
    const occurrences = facts.eligibility.split("criminal organisation").length - 1;
    expect(occurrences).toBe(1);
  });

  it("reads the award criteria, the scope, the deadline and the value", () => {
    expect(facts.awardCriteria).toContain("artistic proposal");
    expect(facts.scope).toContain("documentary films");
    expect(facts.deadline).toContain("2026-11-20");
    // 2000000 is seven characters — the prose floor would have dropped it.
    expect(facts.estimatedValue).toContain("2000000");
    expect(facts.estimatedValue).toContain("EUR");
  });

  it("points at the tender documents themselves", () => {
    expect(facts.documentsUrl).toBe("https://portal.example.gov/tender/4711/documents");
  });
});

describe("readTedNoticeXml — legacy TED_EXPORT", () => {
  const facts = readTedNoticeXml(LEGACY);

  it("names the schema and the root element it read", () => {
    expect(facts.schema).toBe("TED_EXPORT");
    expect(facts.rootElement).toBe("ted_export");
  });

  it("reads the LEFTI block the old schema uses for eligibility", () => {
    expect(facts.eligibility).toContain("registre du commerce");
    expect(facts.eligibility).toContain("Chiffre d affaires");
    expect(facts.eligibility).toContain("assurance professionnelle");
  });

  it("does not repeat INFORMATION_AND_FORMALITIES under its capacity parent", () => {
    const occurrences = facts.eligibility.split("Chiffre d affaires").length - 1;
    expect(occurrences).toBe(1);
  });

  it("reads the scope, the deadline and the document link", () => {
    expect(facts.scope).toContain("prestations audiovisuelles");
    expect(facts.deadline).toContain("2026-10-01");
    // The legacy schema spells the amount VAL_ESTIMATED_TOTAL and the currency
    // CURRENCY — neither matches the eForms spelling, and a reader that only
    // knew eForms would report no value at all on every pre-2023 notice.
    expect(facts.estimatedValue).toContain("1500000");
    expect(facts.estimatedValue).toContain("EUR");
    expect(facts.documentsUrl).toBe("https://marches.example.fr/dossier/882");
  });
});

describe("readTedNoticeXml — a notice that says nothing", () => {
  it("returns empty strings rather than inventing text", () => {
    const facts = readTedNoticeXml(
      `<ContractNotice xmlns:cac="x"><cac:ProcurementProject><cbc:Name xmlns:cbc="y">Cleaning</cbc:Name></cac:ProcurementProject></ContractNotice>`,
    );
    expect(facts.eligibility).toBe("");
    expect(facts.awardCriteria).toBe("");
    expect(facts.documentsUrl).toBe("");
  });

  it("survives XML that is not a notice at all, and says what it was", () => {
    const facts = readTedNoticeXml("<html><body>404 Not Found</body></html>");
    expect(facts.schema).toBe("UNKNOWN");
    expect(facts.rootElement).toBe("html");
    expect(facts.eligibility).toBe("");
  });

  it("classifies an award notice as eForms by its root, not by a keyword", () => {
    // The first real run classified 10 of 25 notices UNKNOWN. A root-based
    // reading names what they are; a regex over the whole document would also
    // call a legacy export eForms for quoting the words in a description.
    const award = readTedNoticeXml(
      `<ContractAwardNotice xmlns:cac="x"><cac:ProcurementProject/></ContractAwardNotice>`,
    );
    expect(award.schema).toBe("EFORMS");
    expect(award.rootElement).toBe("contractawardnotice");

    const legacy = readTedNoticeXml(
      `<TED_EXPORT><FORM_SECTION><SHORT_DESCR>A ContractNotice is mentioned here.</SHORT_DESCR></FORM_SECTION></TED_EXPORT>`,
    );
    expect(legacy.schema).toBe("TED_EXPORT");
  });
});

describe("tedXmlToFacts", () => {
  const xmlUrl = "https://ted.europa.eu/en/notice/505248-2026/xml";
  const facts = tedXmlToFacts(readTedNoticeXml(EFORMS), "artifact-1", xmlUrl);

  it("emits one fact per field that had content, and none for the rest", () => {
    const fields = facts.map((f) => f.field).sort();
    expect(fields).toEqual(
      ["award_criteria", "deadline_text", "eligibility", "estimated_value", "scope", "tender_documents_url"].sort(),
    );
  });

  it("carries provenance back to the element in the published XML", () => {
    const eligibility = facts.find((f) => f.field === "eligibility")!;
    expect(eligibility.classification).toBe("EXTRACTED_FROM_OFFICIAL_SOURCE");
    expect(eligibility.sourceArtifactId).toBe("artifact-1");
    expect(eligibility.locator.value).toBe(`${xmlUrl}#SelectionCriteria`);
    expect(eligibility.validationResult).toBe("unchecked");
  });

  it("emits nothing at all for a silent notice", () => {
    expect(tedXmlToFacts(readTedNoticeXml("<TED_EXPORT/>"), "a", xmlUrl)).toEqual([]);
  });
});
