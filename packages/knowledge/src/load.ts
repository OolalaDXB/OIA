import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  CapabilitySchema,
  DisclosurePolicySchema,
  EntitySchema,
  EvidenceItemSchema,
  FactSchema,
  ProductSchema,
  type Capability,
  type DisclosurePolicy,
  type Entity,
  type EvidenceItem,
  type Fact,
  type Product,
} from "./schemas";

/**
 * Loader for the canonical knowledge tree (knowledge/ at repo root).
 * Git stores the truth; this layer exposes it — consumers never parse files
 * themselves (§22). Everything is Zod-validated on load: an invalid file is a
 * hard error, not a silently-skipped truth.
 */

export interface KnowledgeBase {
  products: Product[];
  facts: Fact[];
  capabilities: Capability[];
  entities: Entity[];
  evidence: EvidenceItem[];
  policy: DisclosurePolicy;
}

function readYaml(path: string): unknown {
  return parse(readFileSync(path, "utf8"));
}

export function loadKnowledge(root: string): KnowledgeBase {
  const products: Product[] = [];
  const facts: Fact[] = [];

  const productsDir = join(root, "products");
  for (const slug of readdirSync(productsDir)) {
    const pFile = join(productsDir, slug, "product.yaml");
    if (existsSync(pFile)) products.push(ProductSchema.parse(readYaml(pFile)));
    const fFile = join(productsDir, slug, "facts.yaml");
    if (existsSync(fFile)) {
      for (const f of readYaml(fFile) as unknown[]) facts.push(FactSchema.parse(f));
    }
  }

  const capabilities = (readYaml(join(root, "capabilities/capabilities.yaml")) as unknown[]).map(
    (c) => CapabilitySchema.parse(c),
  );
  const entities = (readYaml(join(root, "entities/entities.yaml")) as unknown[]).map((e) =>
    EntitySchema.parse(e),
  );
  const evidence = (readYaml(join(root, "evidence/evidence.yaml")) as unknown[]).map((e) =>
    EvidenceItemSchema.parse(e),
  );
  const policy = DisclosurePolicySchema.parse(readYaml(join(root, "policies/disclosure.yaml")));

  return { products, facts, capabilities, entities, evidence, policy };
}
