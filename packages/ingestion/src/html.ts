import * as cheerio from "cheerio";

export interface HtmlBlock {
  /** A best-effort CSS selector or heading locator. */
  selector: string;
  heading?: string;
  text: string;
}

export interface SpaDetection {
  isSpa: boolean;
  visibleTextLength: number;
  scriptCount: number;
  signals: string[];
}

/** Visible text of an HTML document (scripts/styles removed). */
export function htmlToVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, template").remove();
  return $("body").text().replace(/\s+/g, " ").trim() || $.root().text().replace(/\s+/g, " ").trim();
}

export function htmlTitle(html: string): string | undefined {
  const $ = cheerio.load(html);
  const t = $("title").first().text().trim() || $("h1").first().text().trim();
  return t || undefined;
}

/**
 * Empty-shell / SPA detection (spec §5.6): little visible text + a known mount
 * node + script-heavy shell → CLIENT_RENDERED_SPA.
 */
export function detectSpa(html: string): SpaDetection {
  const $ = cheerio.load(html);
  const scriptCount = $("script").length;
  $("script, style, noscript, template").remove();
  const visibleText = $("body").text().replace(/\s+/g, " ").trim();
  const signals: string[] = [];

  const hasRootMount =
    $("#root").length > 0 ||
    $("#app").length > 0 ||
    $("[ng-version]").length > 0 ||
    $("[data-reactroot]").length > 0 ||
    $("[data-server-rendered]").length > 0;
  if (hasRootMount) signals.push("known SPA mount node (#root/#app/ng-version)");
  if (visibleText.length < 400) signals.push(`low visible text (${visibleText.length} chars)`);
  if (scriptCount >= 3) signals.push(`script-heavy shell (${scriptCount} scripts)`);

  const isSpa = hasRootMount && visibleText.length < 400 && scriptCount >= 2;
  return { isSpa, visibleTextLength: visibleText.length, scriptCount, signals };
}

/**
 * Extract content blocks keyed by heading, plus a CSS-path locator. Used to give
 * each extracted fact a real HTML locator (spec §8 source locators).
 */
export function extractHtmlBlocks(html: string): HtmlBlock[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, template").remove();
  const blocks: HtmlBlock[] = [];

  $("h1, h2, h3").each((_i, el) => {
    const heading = $(el).text().replace(/\s+/g, " ").trim();
    if (!heading) return;
    // Collect text of following siblings until the next heading.
    let text = "";
    let node = $(el).next();
    let guard = 0;
    while (node.length && !/^h[1-3]$/i.test(node.prop("tagName") ?? "") && guard < 20) {
      text += " " + node.text().replace(/\s+/g, " ").trim();
      node = node.next();
      guard++;
    }
    blocks.push({
      selector: `${(el as { tagName?: string }).tagName ?? "h"}:${heading.slice(0, 40)}`,
      heading,
      text: text.trim(),
    });
  });

  // Also capture table rows (common for deadlines/amounts).
  $("table tr").each((i, el) => {
    const cells = $(el)
      .find("th, td")
      .map((_j, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get();
    if (cells.length >= 2) {
      blocks.push({ selector: `table tr:nth-child(${i + 1})`, text: cells.join(" | ") });
    }
  });

  return blocks;
}
