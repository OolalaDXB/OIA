"use client";

import { useState } from "react";
import { OPPORTUNITY_KINDS, KIND_PROFILES } from "@oia/ingestion/opportunity-kinds";
import { PROJECT_ENTRIES } from "@oia/workspace";
import { supabase, isConfigured } from "../../../lib/supabase";

/**
 * The universal intake: paste any link.
 *
 * Most of what matters is not on a machine-readable portal. A Brittany regional
 * scheme, a call circulated on a mailing list, a marketplace posting, a site
 * with no API and no intention of having one — writing a connector for each is
 * not a plan.
 *
 * So: paste the URL. The worker fetches the page with the same SSRF-guarded
 * fetcher, hashes it, checks the domain against what it claims, reads its scope
 * and eligibility, and lands it in the ledger as an ordinary record.
 *
 * What it does NOT do is shortcut the pipeline. A pasted URL comes out at "not
 * verified yet", exactly like a TED notice, because a human pasting a link is
 * not the same as a human verifying a source.
 */
export function AddByUrl({ projectSlug }: { projectSlug?: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("GRANT");
  const [project, setProject] = useState(projectSlug ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const client = supabase();
    if (!client) return;
    setBusy(true);
    setMessage(null);
    const { error } = await client.from("requests").insert({
      kind: "INGEST_URL",
      payload: { url: url.trim(), ...(project ? { projectSlug: project } : {}), kindHint: kind },
      requested_by: "mickael",
    });
    setBusy(false);
    if (error) {
      setMessage(`Could not queue it: ${error.message}`);
      return;
    }
    setMessage(
      "Queued. The worker fetches and reads the page on its next run, then it appears like any other record — " +
        "at 'not verified yet', because pasting a link is not verifying a source.",
    );
    setUrl("");
  }

  if (!isConfigured()) return null;

  return (
    <section className="sec">
      <div className="secHead">
        <h3>Found something elsewhere?</h3>
        <button className="ghostBtn" onClick={() => setOpen(!open)}>
          {open ? "cancel" : "add by link"}
        </button>
      </div>
      {!open && (
        <div className="muted small">
          Paste any call you found — a regional scheme, a mailing list, a marketplace posting, a site with no API.
          It goes through the same checks as everything else.
        </div>
      )}
      {open && (
        <>
          <div className="viewsRow wrapRow">
            <input
              className="comment inputLine wideInput"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {OPPORTUNITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_PROFILES[k].label}
                </option>
              ))}
            </select>
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">no project</option>
              {PROJECT_ENTRIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn on" disabled={!url.trim() || busy} onClick={() => void submit()}>
              {busy ? "queueing…" : "add it"}
            </button>
          </div>
          <div className="muted small">{KIND_PROFILES[kind as keyof typeof KIND_PROFILES]?.description}</div>
        </>
      )}
      {message && <div className="ok small">{message}</div>}
    </section>
  );
}

/** Ask for a fresh search on one project. */
export function RunSearch({ slug, enabled }: { slug: string; enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isConfigured()) return null;

  return (
    <span className="viewsRow">
      <button
        className="ghostBtn"
        disabled={busy}
        onClick={async () => {
          const client = supabase();
          if (!client) return;
          setBusy(true);
          const { error } = await client
            .from("requests")
            .insert({ kind: "DISCOVERY", payload: { projects: [slug] }, requested_by: "mickael" });
          setBusy(false);
          setMessage(
            error
              ? `Could not queue it: ${error.message}`
              : enabled
                ? "Queued — it runs with the next discovery pass."
                : "Queued, but this project has no automated search configured: add CPV codes or search terms first, or it will find nothing.",
          );
        }}
      >
        {busy ? "queueing…" : "run a search"}
      </button>
      {message && <span className="muted small">{message}</span>}
    </span>
  );
}
