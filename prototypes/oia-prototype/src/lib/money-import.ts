import type { Json } from "@/integrations/supabase/types";

export function risqueAnnulation(value: Json | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { modifies: 0, nonVerifiables: 0 };
  const modified = value["modifies_depuis_import"];
  const unknown = value["non_verifiables"];
  return { modifies: Array.isArray(modified) ? modified.length : 0, nonVerifiables: typeof unknown === "number" ? unknown : 0 };
}