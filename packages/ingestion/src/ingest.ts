import type {
  IngestionResult,
  SourceArtifact,
  LiveFetchAttempt,
  MaterialFact,
  DeadlineRecord,
  IngestionMode,
} from "./models";
import type { ArtifactManifestEntry } from "./manifest";
import { sha256Buffer, makeArtifactId } from "./artifact";
import { classifyContent } from "./classify";
import { htmlToVisibleText, htmlTitle, extractHtmlBlocks } from "./html";
import { extractPdfPages, type PdfPage } from "./pdf";
import { extractFactsFromBlocks, extractFactsFromPages, userProvidedFact } from "./facts";
import { extractDeadlines, annotateConflicts } from "./deadline";
import { verifySuppliedArtifact } from "./verification";

export interface IngestDeps {
  /** Attempt the (blocked) live fetch of the official URL; records the evidence. */
  liveFetch: (url: string) => Promise<LiveFetchAttempt>;
  /** Injectable PDF page extractor (defaults to pdfjs-based). */
  extractPdf?: (bytes: Uint8Array) => Promise<PdfPage[]>;
}

function modeFor(entry: ArtifactManifestEntry, format: string): IngestionMode {
  if (format === "PDF") return "OFFICIAL_PDF";
  return "MANUAL_DOCUMENT";
}

/**
 * Ingest one locally supplied official artifact end-to-end (spec §5 steps
 * adapted for local files): hash → classify → extract text → fact-level
 * extraction with locators → deadlines → verification (caps at
 * MANUAL_REVIEW_REQUIRED) → linked BLOCKED live-fetch evidence.
 */
export async function ingestOfficialArtifact(
  entry: ArtifactManifestEntry,
  bytes: Uint8Array,
  deps: IngestDeps,
): Promise<IngestionResult> {
  const warnings: string[] = [];
  const contentHash = sha256Buffer(bytes);
  const artifactId = makeArtifactId(entry.originalUrl, contentHash);

  const classification = classifyContent(bytes, entry.contentType);
  const format = classification.sourceFormat;

  // Discrepancy: manifest's claimed format vs classifier's derived format.
  if (entry.sourceFormat !== format) {
    warnings.push(`format mismatch: manifest claims ${entry.sourceFormat}, classifier derived ${format}`);
  }
  warnings.push(...classification.reasons);

  let text = "";
  let facts: MaterialFact[] = [];
  let deadlines: DeadlineRecord[] = [];
  let pageCount: number | undefined;
  let processing: SourceArtifact["processing"] = "SUCCESS";
  let processingError: string | undefined;

  try {
    if (format === "PDF") {
      const extract = deps.extractPdf ?? extractPdfPages;
      const pages = await extract(bytes);
      pageCount = pages.length;
      text = pages.map((p) => p.text).join("\n\n");
      facts = extractFactsFromPages(pages, { artifactId, officialSource: true });
      for (const p of pages) {
        deadlines.push(
          ...extractDeadlines(p.text, { type: "PDF_PAGE", value: `page ${p.pageNumber}`, page: p.pageNumber }),
        );
      }
    } else if (format === "STATIC_HTML" || format === "CLIENT_RENDERED_SPA") {
      const html = Buffer.from(bytes).toString("utf8");
      text = htmlToVisibleText(html);
      const blocks = extractHtmlBlocks(html);
      facts = extractFactsFromBlocks(blocks, htmlTitle(html), { artifactId, officialSource: true });
      deadlines = extractDeadlines(text, { type: "CSS_SELECTOR", value: "body" });
      if (format === "CLIENT_RENDERED_SPA") {
        warnings.push("SPA/empty-shell: static text is sparse; official saved page/PDF required for facts");
      }
    } else {
      processing = "FAILURE";
      processingError = `unsupported source format: ${format}`;
    }
  } catch (err) {
    processing = "FAILURE";
    processingError = err instanceof Error ? err.message : String(err);
  }

  deadlines = annotateConflicts(deadlines);
  facts.push(userProvidedFact("expected_title", entry.expectedDocumentTitle, artifactId));

  const liveFetch = await deps.liveFetch(entry.originalUrl);

  const artifact: SourceArtifact = {
    id: artifactId,
    ingestionMode: modeFor(entry, format),
    sourceFormat: format,
    originalUrl: entry.originalUrl,
    issuingOrganization: entry.issuingOrganization,
    localFilename: entry.localFilename,
    contentType: entry.contentType,
    byteSize: bytes.byteLength,
    contentHash,
    retrievedAt: `${entry.retrievalDate}T00:00:00.000Z`,
    renderMethod: "LOCAL_FILE",
    text,
    liveFetch,
    processing,
    processingError,
    pageCount,
  };

  const verification = verifySuppliedArtifact(entry, artifact);

  return { artifact, verification, facts, deadlines, warnings };
}
