export interface PdfPage {
  pageNumber: number; // 1-based
  text: string;
}

/**
 * Extract per-page text from a PDF using pdfjs-dist (legacy build, no worker).
 * Per-page output is what lets each PDF fact retain a PDF_PAGE locator (spec §8).
 * pdfjs is a pure-JS dependency (no native bindings) — see docs/ingestion/source-security.md.
 */
export async function extractPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  // Lazy import so packages that don't parse PDFs don't pay the cost.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs rejects a Node Buffer (its backing ArrayBuffer may be pooled/shared).
  // Copy into a plain Uint8Array to be safe.
  const bytes = new Uint8Array(data);
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;
  const pages: PdfPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ pageNumber: n, text });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/** Cheap magic-byte check. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}
