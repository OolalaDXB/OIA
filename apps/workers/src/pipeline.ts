import type { ProjectProfile, SourceKind } from "@oia/database";
import type { AuditSink } from "@oia/audit";
import type { PolicyHooks } from "@oia/audit";
import type { LLMProvider } from "@oia/providers";
import {
  getConnector as defaultGetConnector,
  PolicyDeniedError,
  type ConnectorContext,
  type SourceConnector,
  type FetchedEvidence,
} from "@oia/connectors";
import { qualify } from "@oia/intelligence";
import type { Persistence } from "./persistence";

export interface PipelineSource {
  id: string;
  connectorKey: string;
  kind: SourceKind;
}

export interface PipelineDeps {
  project: ProjectProfile;
  projectId: string;
  sources: PipelineSource[];
  ctx: ConnectorContext;
  provider: LLMProvider;
  policy: PolicyHooks;
  audit: AuditSink;
  persistence: Persistence;
  confidenceFloor: number;
  /** Injectable connector resolver (defaults to the registry). */
  getConnector?: (key: string) => SourceConnector | undefined;
  /** Optional cap on opportunities per source (logged when it truncates). */
  maxPerSource?: number;
}

export interface PipelineSummary {
  discovered: number;
  qualified: number;
  errors: number;
  byAction: Record<string, number>;
  truncated: number;
}

/**
 * discover → fetch → qualify → persist, for one project across its sources.
 * Deterministic DAG (no agent loops). Failures are isolated per opportunity.
 */
export async function runPipeline(deps: PipelineDeps): Promise<PipelineSummary> {
  const resolve = deps.getConnector ?? defaultGetConnector;
  const summary: PipelineSummary = {
    discovered: 0,
    qualified: 0,
    errors: 0,
    byAction: {},
    truncated: 0,
  };

  for (const source of deps.sources) {
    const connector = resolve(source.connectorKey);
    if (!connector) {
      deps.ctx.log("connector_missing", { key: source.connectorKey });
      summary.errors += 1;
      continue;
    }

    let raws;
    try {
      raws = await connector.discover(deps.ctx, deps.project);
    } catch (err) {
      deps.ctx.log("discover_error", { key: source.connectorKey, err: String(err) });
      summary.errors += 1;
      continue;
    }

    if (deps.maxPerSource && raws.length > deps.maxPerSource) {
      summary.truncated += raws.length - deps.maxPerSource;
      deps.ctx.log("discover_truncated", {
        key: source.connectorKey,
        dropped: raws.length - deps.maxPerSource,
      });
      raws = raws.slice(0, deps.maxPerSource);
    }
    summary.discovered += raws.length;

    for (const opportunity of raws) {
      try {
        let evidence: FetchedEvidence | null = null;
        try {
          evidence = await connector.fetch(deps.ctx, opportunity.url);
          await deps.audit.record({
            eventType: "source_fetched",
            actor: "pipeline",
            projectId: deps.projectId,
            payload: { url: opportunity.url },
          });
        } catch (err) {
          if (err instanceof PolicyDeniedError) {
            await deps.audit.record({
              eventType: "policy_denied",
              actor: "policy",
              projectId: deps.projectId,
              payload: { url: opportunity.url, reason: err.reason },
            });
          } else {
            throw err;
          }
        }

        const result = await qualify({
          project: deps.project,
          opportunity,
          evidence,
          sourceKind: source.kind,
          provider: deps.provider,
          policy: deps.policy,
          confidenceFloor: deps.confidenceFloor,
        });

        const opportunityId = await deps.persistence.persist({
          project: deps.project,
          projectId: deps.projectId,
          sourceId: source.id,
          opportunity,
          evidence,
          result,
        });

        await deps.audit.record({
          eventType: "recommendation_set",
          actor: "pipeline",
          opportunityId,
          projectId: deps.projectId,
          payload: {
            action: result.recommendation.action,
            gatePassed: result.gate.passed,
            scores: result.scores,
          },
        });

        summary.qualified += 1;
        const action = result.recommendation.action;
        summary.byAction[action] = (summary.byAction[action] ?? 0) + 1;
      } catch (err) {
        deps.ctx.log("qualify_error", { url: opportunity.url, err: String(err) });
        summary.errors += 1;
      }
    }
  }

  return summary;
}
