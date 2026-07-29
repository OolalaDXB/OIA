import { z } from "zod";

/**
 * Official-artifact manifest (spec §2 of the hybrid instruction). Every locally
 * supplied official file MUST be described here. `sourceFormat` is the human's
 * CLAIM; the classifier re-derives it and a mismatch becomes a discrepancy.
 */

export const ArtifactManifestEntrySchema = z.object({
  originalUrl: z.string().url(), // official issuer URL the file was downloaded from
  issuingOrganization: z.string().min(1),
  officialDomain: z.string().min(1).optional(), // else derived from originalUrl host
  retrievalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  localFilename: z.string().min(1), // relative to the manifest's directory
  contentType: z.string().min(1),
  sourceFormat: z.enum(["STATIC_HTML", "CLIENT_RENDERED_SPA", "PDF"]),
  expectedDocumentTitle: z.string().min(1),
  applicationUrl: z.string().url().optional(),
});
export type ArtifactManifestEntry = z.infer<typeof ArtifactManifestEntrySchema>;

export const ArtifactManifestSchema = z.object({
  version: z.literal(1),
  artifacts: z.array(ArtifactManifestEntrySchema).min(1),
});
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;

export interface ManifestValidation {
  ok: boolean;
  manifest?: ArtifactManifest;
  errors: string[];
}

export function validateManifest(raw: unknown): ManifestValidation {
  const parsed = ArtifactManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }
  // Cross-field: duplicate localFilename is an error.
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const a of parsed.data.artifacts) {
    if (seen.has(a.localFilename)) errors.push(`duplicate localFilename: ${a.localFilename}`);
    seen.add(a.localFilename);
  }
  return { ok: errors.length === 0, manifest: parsed.data, errors };
}

/** Derive the official domain from the manifest's originalUrl if not given. */
export function officialDomainFor(entry: ArtifactManifestEntry): string {
  if (entry.officialDomain) return entry.officialDomain.toLowerCase();
  return new URL(entry.originalUrl).host.toLowerCase();
}
