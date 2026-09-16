"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { supabase } from "./supabase";

/**
 * Reading the permanent ledger.
 *
 * The bundled snapshot remains the fallback, and the UI says which of the two
 * it is showing. "Where did this come from and when" is not a footnote in an
 * evidence-first tool — a stale snapshot presented as live data is the failure
 * this product exists to avoid.
 */

export type DataSource = "LEDGER" | "SNAPSHOT";

export interface LedgerRecord {
  record: ConsoleRecord;
  firstSeenAt: string;
  lastSeenAt: string;
  timesSeen: number;
  disappearedAt: string | null;
  discoveredFor: string[];
}

export function useLedger(fallback: ConsoleData) {
  const [state, setState] = useState<{
    source: DataSource;
    records: ConsoleRecord[];
    ledger: LedgerRecord[];
    loading: boolean;
    error: string | null;
  }>({ source: "SNAPSHOT", records: fallback.records, ledger: [], loading: true, error: null });

  useEffect(() => {
    const client = supabase();
    if (!client) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await client
        .from("watch_opportunities")
        .select("payload, first_seen_at, last_seen_at, times_seen, disappeared_at, discovered_for")
        .order("first_seen_at", { ascending: false });
      if (!active) return;
      if (error) {
        // Say so and keep the snapshot, rather than showing an empty console.
        setState((s) => ({ ...s, loading: false, error: error.message }));
        return;
      }
      const rows = (data ?? []) as {
        payload: ConsoleRecord;
        first_seen_at: string;
        last_seen_at: string;
        times_seen: number;
        disappeared_at: string | null;
        discovered_for: string[];
      }[];
      if (rows.length === 0) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      setState({
        source: "LEDGER",
        records: rows.map((r) => r.payload),
        ledger: rows.map((r) => ({
          record: r.payload,
          firstSeenAt: r.first_seen_at,
          lastSeenAt: r.last_seen_at,
          timesSeen: r.times_seen,
          disappearedAt: r.disappeared_at,
          discoveredFor: r.discovered_for ?? [],
        })),
        loading: false,
        error: null,
      });
    })();
    return () => {
      active = false;
    };
  }, [fallback.records]);

  return state;
}

export interface AlertRow {
  id: string;
  kind: string;
  projectSlug: string | null;
  headline: string;
  detail: string;
  nextAction: string;
  severity: number;
  createdAt: string;
  acknowledgedAt: string | null;
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = supabase();
    if (!client) {
      setLoading(false);
      return;
    }
    const { data, error: err } = await client
      .from("alerts")
      .select("id, kind, project_slug, headline, detail, next_action, severity, created_at, acknowledged_at")
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setAlerts(
      ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r["id"]),
        kind: String(r["kind"]),
        projectSlug: (r["project_slug"] as string | null) ?? null,
        headline: String(r["headline"]),
        detail: String(r["detail"] ?? ""),
        nextAction: String(r["next_action"] ?? ""),
        severity: Number(r["severity"] ?? 5),
        createdAt: String(r["created_at"]),
        acknowledgedAt: (r["acknowledged_at"] as string | null) ?? null,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Acknowledge, not delete. An alert that was raised stays raised — what
   * changes is that it no longer asks for attention. The row is the record that
   * the system did warn you, and when.
   */
  const acknowledge = useCallback(
    async (id: string, actor: string) => {
      const client = supabase();
      if (!client) return;
      const at = new Date().toISOString();
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledgedAt: at } : a)));
      const { error: err } = await client
        .from("alerts")
        .update({ acknowledged_at: at, acknowledged_by: actor })
        .eq("id", id);
      if (err) {
        setError(err.message);
        void load();
      }
    },
    [load],
  );

  const open = alerts.filter((a) => !a.acknowledgedAt);
  return { alerts, open, loading, error, acknowledge, reload: load };
}

export interface LinkStatusRow {
  url: string;
  status: string;
  httpCode: number | null;
  finalUrl: string | null;
  checkedAt: string;
  note: string;
}

/**
 * What the link checker found, for every URL the console shows.
 *
 * A URL with no row has simply never been checked, and the UI says "unchecked"
 * rather than implying it works — which is the whole difference between a link
 * that was verified and one that was merely typed.
 */
export function useLinkStatus() {
  const [byUrl, setByUrl] = useState<Map<string, LinkStatusRow>>(new Map());

  useEffect(() => {
    const client = supabase();
    if (!client) return;
    let active = true;
    void (async () => {
      const { data, error } = await client
        .from("link_checks")
        .select("url, status, http_code, final_url, checked_at, note");
      if (!active || error || !data) return;
      setByUrl(
        new Map(
          (data as Record<string, unknown>[]).map((r) => [
            String(r["url"]),
            {
              url: String(r["url"]),
              status: String(r["status"]),
              httpCode: (r["http_code"] as number | null) ?? null,
              finalUrl: (r["final_url"] as string | null) ?? null,
              checkedAt: String(r["checked_at"]),
              note: String(r["note"] ?? ""),
            },
          ]),
        ),
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  const statusOf = useCallback((url: string): LinkStatusRow | null => byUrl.get(url) ?? null, [byUrl]);
  const brokenCount = useMemo(
    () => [...byUrl.values()].filter((r) => r.status === "DEAD" || r.status === "UNREACHABLE").length,
    [byUrl],
  );

  return { statusOf, brokenCount, checked: byUrl.size };
}
