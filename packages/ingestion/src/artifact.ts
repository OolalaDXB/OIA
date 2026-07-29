import { createHash } from "node:crypto";

export function sha256Buffer(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic artifact id from origin + content hash (idempotent). */
export function makeArtifactId(originalUrl: string, contentHash: string): string {
  const h = createHash("sha256").update(`${originalUrl}\n${contentHash}`).digest("hex");
  return `art_${h.slice(0, 16)}`;
}
