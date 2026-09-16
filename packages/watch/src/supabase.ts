import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleRecord } from "@oia/ingestion/console";
import type { Alert } from "./alerts";
import type { LedgerRow, WatchEvent } from "./ledger";

/**
 * Supabase driver for the watch ledger.
 *
 * The pure core (ledger.ts, alerts.ts) decides WHAT to write; this decides
 * where. Keeping them apart is why the reconciliation logic is testable without
 * a database, and why swapping the store later is a file rather than a rewrite.
 *
 * Two callers, two keys:
 *   - the worker uses the service role key and bypasses RLS to write;
 *   - the console uses the publishable key and an authenticated session, and
 *     can only read (plus acknowledge alerts).
 */

export interface WatchConfig {
  url: string;
  key: string;
}

/** Config from the environment, or null when the watch is not wired up. */
export function watchConfigFromEnv(env: Record<string, string | undefined>): WatchConfig | null {
  const url = env["SUPABASE_URL"] ?? env["NEXT_PUBLIC_SUPABASE_URL"];
  const key =
    env["SUPABASE_SERVICE_ROLE_KEY"] ?? env["SUPABASE_ANON_KEY"] ?? env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!url || !key) return null;
  return { url, key };
}

export function createWatchClient(config: WatchConfig): SupabaseClient {
  return createClient(config.url, config.key, { auth: { persistSession: false } });
}

// ── Row mapping ──────────────────────────────────────────────────────────────

interface DbLedgerRow {
  id: string;
  watch_key: string;
  record_id: string;
  title: string;
  issuer: string;
  opportunity_kind: string | null;
  official_url: string | null;
  deadline_at: string | null;
  recommendation: string;
  verification_status: string;
  info_confidence: number;
  gate_pursue_eligible: boolean;
  gate_failed_reasons: string[];
  discovered_for: string[];
  payload: ConsoleRecord;
  content_fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  times_seen: number;
  disappeared_at: string | null;
}

export function fromDb(row: DbLedgerRow): LedgerRow {
  return {
    watchKey: row.watch_key,
    recordId: row.record_id,
    title: row.title,
    issuer: row.issuer,
    opportunityKind: row.opportunity_kind ?? undefined,
    officialUrl: row.official_url ?? undefined,
    deadlineAt: row.deadline_at,
    recommendation: row.recommendation,
    verificationStatus: row.verification_status,
    infoConfidence: row.info_confidence,
    gatePursueEligible: row.gate_pursue_eligible,
    gateFailedReasons: row.gate_failed_reasons ?? [],
    discoveredFor: row.discovered_for ?? [],
    contentFingerprint: row.content_fingerprint,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    timesSeen: row.times_seen,
    disappearedAt: row.disappeared_at,
    payload: row.payload,
  };
}

export function toDb(row: LedgerRow): Omit<DbLedgerRow, "id"> {
  return {
    watch_key: row.watchKey,
    record_id: row.recordId,
    title: row.title,
    issuer: row.issuer,
    opportunity_kind: row.opportunityKind ?? null,
    official_url: row.officialUrl ?? null,
    deadline_at: row.deadlineAt,
    recommendation: row.recommendation,
    verification_status: row.verificationStatus,
    info_confidence: row.infoConfidence,
    gate_pursue_eligible: row.gatePursueEligible,
    gate_failed_reasons: row.gateFailedReasons,
    discovered_for: row.discoveredFor,
    payload: row.payload,
    content_fingerprint: row.contentFingerprint,
    first_seen_at: row.firstSeenAt,
    last_seen_at: row.lastSeenAt,
    times_seen: row.timesSeen,
    disappeared_at: row.disappearedAt,
  };
}

// ── Repository ───────────────────────────────────────────────────────────────

export interface WatchRepository {
  loadLedger(): Promise<LedgerRow[]>;
  /** Insert or update rows, returning watchKey → row id for event writing. */
  upsertRows(rows: LedgerRow[]): Promise<Map<string, string>>;
  appendEvents(events: WatchEvent[], ids: Map<string, string>, runId: string | null): Promise<void>;
  knownAlertHashes(): Promise<Set<string>>;
  raiseAlerts(alerts: Alert[], ids: Map<string, string>): Promise<number>;
  startRun(source: string, projects: string[]): Promise<string>;
  finishRun(
    runId: string,
    summary: { records: number; new: number; updated: number; disappeared: number },
    report: unknown,
  ): Promise<void>;
  /** Latest review per record id, for the alert rules. */
  reviewsByRecord(): Promise<Map<string, "APPROVE" | "REJECT" | "NEEDS_VERIFICATION">>;
  tagsByRecord(): Promise<Map<string, string>>;
}

export function createWatchRepository(client: SupabaseClient): WatchRepository {
  const fail = (what: string, error: { message: string } | null): void => {
    if (error) throw new Error(`watch: ${what} failed — ${error.message}`);
  };

  return {
    async loadLedger() {
      // Paged: the ledger grows without bound by design, and a silently
      // truncated read would make every unseen row look new.
      const rows: LedgerRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client
          .from("watch_opportunities")
          .select("*")
          .order("first_seen_at", { ascending: true })
          .range(from, from + pageSize - 1);
        fail("loadLedger", error);
        const page = (data ?? []) as DbLedgerRow[];
        rows.push(...page.map(fromDb));
        if (page.length < pageSize) break;
      }
      return rows;
    },

    async upsertRows(rows) {
      const ids = new Map<string, string>();
      if (rows.length === 0) return ids;
      const { data, error } = await client
        .from("watch_opportunities")
        .upsert(rows.map(toDb), { onConflict: "watch_key" })
        .select("id, watch_key");
      fail("upsertRows", error);
      for (const r of (data ?? []) as { id: string; watch_key: string }[]) ids.set(r.watch_key, r.id);
      return ids;
    },

    async appendEvents(events, ids, runId) {
      const payload = events
        .map((e) => ({
          opportunity_id: ids.get(e.watchKey),
          event_type: e.type,
          at: e.at,
          run_id: runId,
          detail: e.detail,
        }))
        .filter((e) => !!e.opportunity_id);
      if (payload.length === 0) return;
      const { error } = await client.from("watch_events").insert(payload);
      fail("appendEvents", error);
    },

    async knownAlertHashes() {
      const hashes = new Set<string>();
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client.from("alerts").select("dedup_hash").range(from, from + pageSize - 1);
        fail("knownAlertHashes", error);
        const page = (data ?? []) as { dedup_hash: string }[];
        for (const r of page) hashes.add(r.dedup_hash);
        if (page.length < pageSize) break;
      }
      return hashes;
    },

    async raiseAlerts(alerts, ids) {
      if (alerts.length === 0) return 0;
      const payload = alerts.map((a) => ({
        kind: a.kind,
        opportunity_id: ids.get(a.watchKey) ?? null,
        project_slug: a.projectSlug,
        headline: a.headline,
        detail: a.detail,
        next_action: a.nextAction,
        severity: a.severity,
        dedup_hash: a.dedupHash,
      }));
      // ignoreDuplicates: raising the same condition twice is a no-op, which is
      // the database-level half of the idempotence the rules already guarantee.
      const { data, error } = await client
        .from("alerts")
        .upsert(payload, { onConflict: "dedup_hash", ignoreDuplicates: true })
        .select("id");
      fail("raiseAlerts", error);
      return (data ?? []).length;
    },

    async startRun(source, projects) {
      const { data, error } = await client
        .from("watch_runs")
        .insert({ source, projects })
        .select("id")
        .single();
      fail("startRun", error);
      return (data as { id: string }).id;
    },

    async finishRun(runId, summary, report) {
      const { error } = await client
        .from("watch_runs")
        .update({
          finished_at: new Date().toISOString(),
          records_seen: summary.records,
          new_count: summary.new,
          updated_count: summary.updated,
          disappeared_count: summary.disappeared,
          report,
        })
        .eq("id", runId);
      fail("finishRun", error);
    },

    async reviewsByRecord() {
      const { data, error } = await client
        .from("reviews")
        .select("record_id, action, at")
        .neq("action", "COMMENT")
        .order("at", { ascending: true });
      fail("reviewsByRecord", error);
      const latest = new Map<string, "APPROVE" | "REJECT" | "NEEDS_VERIFICATION">();
      for (const r of (data ?? []) as { record_id: string; action: string }[]) {
        latest.set(r.record_id, r.action as "APPROVE" | "REJECT" | "NEEDS_VERIFICATION");
      }
      return latest;
    },

    async tagsByRecord() {
      const { data, error } = await client.from("project_tags").select("record_id, project_slug");
      fail("tagsByRecord", error);
      return new Map(
        ((data ?? []) as { record_id: string; project_slug: string }[]).map((r) => [r.record_id, r.project_slug]),
      );
    },
  };
}
