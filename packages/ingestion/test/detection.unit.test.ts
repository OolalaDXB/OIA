import { describe, it, expect } from "vitest";
import { classifyContent } from "../src/classify";
import { detectSpa } from "../src/html";

const STATIC_HTML = `<!doctype html><html><head><title>Access Cohort 20</title></head>
<body><h1>Access Cohort 20</h1>
<p>${"Applications are open for the Access cohort. ".repeat(30)}</p>
<h2>Deadline</h2><p>The application deadline is 2026-09-15.</p></body></html>`;

const SPA_SHELL = `<!doctype html><html><head><title>App</title>
<script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script></head>
<body><div id="root"></div></body></html>`;

describe("[UNIT] content classification + SPA detection", () => {
  it("classifies a content-rich page as STATIC_HTML with useful content", () => {
    const c = classifyContent(Buffer.from(STATIC_HTML), "text/html");
    expect(c.sourceFormat).toBe("STATIC_HTML");
    expect(c.usefulContent).toBe(true);
  });

  it("detects a script-heavy empty shell as CLIENT_RENDERED_SPA", () => {
    const spa = detectSpa(SPA_SHELL);
    expect(spa.isSpa).toBe(true);
    expect(spa.signals.join(" ")).toMatch(/mount|low visible text/);
    const c = classifyContent(Buffer.from(SPA_SHELL), "text/html");
    expect(c.sourceFormat).toBe("CLIENT_RENDERED_SPA");
    expect(c.usefulContent).toBe(false);
  });

  it("classifies PDF by magic bytes even with a wrong content-type", () => {
    const pdfBytes = Buffer.from("%PDF-1.4\n...", "utf8");
    expect(classifyContent(pdfBytes, "application/octet-stream").sourceFormat).toBe("PDF");
  });
});
