import type { SourceFormat } from "./models";
import { detectSpa } from "./html";
import { looksLikePdf } from "./pdf";

export interface Classification {
  sourceFormat: SourceFormat;
  usefulContent: boolean;
  reasons: string[];
}

/**
 * Deterministic source-format classification (spec §5). Works on a byte buffer +
 * declared content-type. SPA/empty-shell detection downgrades HTML that has no
 * useful static content.
 */
export function classifyContent(bytes: Uint8Array, contentType: string | undefined): Classification {
  const reasons: string[] = [];
  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("application/pdf") || looksLikePdf(bytes)) {
    reasons.push("PDF magic bytes / content-type");
    return { sourceFormat: "PDF", usefulContent: true, reasons };
  }

  const isHtml = ct.includes("html") || /<html[\s>]/i.test(bufToUtf8Head(bytes));
  if (isHtml) {
    const html = Buffer.from(bytes).toString("utf8");
    const spa = detectSpa(html);
    reasons.push(...spa.signals);
    if (spa.isSpa) {
      return { sourceFormat: "CLIENT_RENDERED_SPA", usefulContent: false, reasons };
    }
    const useful = spa.visibleTextLength >= 400;
    reasons.push(useful ? "useful static HTML content present" : "sparse static HTML");
    return { sourceFormat: "STATIC_HTML", usefulContent: useful, reasons };
  }

  if (ct.includes("text/plain")) {
    const len = Buffer.from(bytes).toString("utf8").trim().length;
    return { sourceFormat: "STATIC_HTML", usefulContent: len >= 200, reasons: ["text/plain document"] };
  }

  reasons.push(`unsupported content-type: ${ct || "unknown"}`);
  return { sourceFormat: "UNSUPPORTED", usefulContent: false, reasons };
}

function bufToUtf8Head(bytes: Uint8Array, n = 512): string {
  return Buffer.from(bytes.slice(0, n)).toString("utf8");
}
