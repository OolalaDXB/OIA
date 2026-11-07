"use client";

import { useState } from "react";
import { OPPORTUNITY_KINDS } from "@oia/ingestion/opportunity-kinds";
import { supabase, isConfigured } from "../../../lib/supabase";

/**
 * Add a project, and start looking for it — without touching a file or a
 * terminal.
 *
 * The console has no backend and no network of its own, so it cannot run a
 * search. It writes a DRAFT, and the worker — which has both — turns that draft
 * into `registry/projects/<slug>.yaml` and commits it. The YAML stays the
 * source of truth; this form is an editor for it, which is a very different
 * thing from a second place where projects live.
 *
 * Nothing here pretends to be instant. The button says what will happen and
 * when, because a button that claims to have searched when it has only queued
 * is the kind of small lie that makes a whole tool untrustworthy.
 */
export function NewProject({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    oneLiner: "",
    url: "",
    kind: "PRODUCT",
    status: "CONCEPT",
    sectors: "",
    keywords: "",
    geographies: "FR, EU",
    countries: "FRA",
    cpvCodes: "",
    queryTerms: "",
    watch: "GRANT,TENDER",
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const slug = form.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  async function submit() {
    const client = supabase();
    if (!client) {
      setMessage("No database configured — a draft has nowhere to go yet.");
      return;
    }
    setBusy(true);
    setMessage(null);

    const entry = {
      slug,
      name: form.name.trim(),
      kind: form.kind,
      status: form.status,
      oneLiner: form.oneLiner.trim(),
      ...(form.url.trim() ? { url: form.url.trim() } : {}),
      active: true,
      legalEntities: [],
      sectors: list(form.sectors),
      geographies: list(form.geographies),
      stage: "",
      fundingTypes: [],
      keywords: list(form.keywords),
      exclusions: [],
      discovery: {
        enabled: list(form.cpvCodes).length > 0 || list(form.queryTerms).length > 0,
        queryTerms: list(form.queryTerms),
        cpvCodes: list(form.cpvCodes),
        cpvNote: "Entered from the console — never checked against the official CPV nomenclature.",
        countries: list(form.countries),
        watch: list(form.watch),
      },
      profileReview: {
        status: "DRAFT",
        derivedFrom: ["created in the console"],
        note: "Created from the console. Matching signals are whatever was typed in the form — review them.",
      },
    };

    const { error: draftError } = await client
      .from("project_drafts")
      .upsert({ slug, entry, status: "PENDING", created_by: "mickael" });
    if (draftError) {
      setBusy(false);
      setMessage(`Could not save the draft: ${draftError.message}`);
      return;
    }

    const { error: requestError } = await client
      .from("requests")
      .insert({ kind: "DISCOVERY", payload: { projects: [slug] }, requested_by: "mickael" });
    setBusy(false);

    setMessage(
      requestError
        ? `Draft saved, but the search could not be queued: ${requestError.message}`
        : `Saved. "${form.name}" becomes a real profile on the next worker run, and a search is queued for it. ` +
          `Until then it does not appear in the lists — nothing is pretending otherwise.`,
    );
    if (!requestError) onDone();
  }

  if (!isConfigured()) {
    return (
      <section className="sec">
        <h3>Add a project</h3>
        <div className="muted">
          This needs the watch database. Without it, add a project by copying a file in{" "}
          <code>registry/projects/</code> — see <code>registry/README.md</code>.
        </div>
      </section>
    );
  }

  return (
    <section className="sec">
      <div className="secHead">
        <h3>Add a project</h3>
        <button className="ghostBtn" onClick={() => setOpen(!open)}>
          {open ? "cancel" : "new project"}
        </button>
      </div>

      {open && (
        <>
          <div className="viewsRow wrapRow">
            <input className="comment inputLine wideInput" placeholder="Name" value={form.name} onChange={set("name")} />
            <input className="comment inputLine wideInput" placeholder="One line: what is it?" value={form.oneLiner} onChange={set("oneLiner")} />
            <input className="comment inputLine wideInput" placeholder="Public URL (optional)" value={form.url} onChange={set("url")} />
            <select value={form.kind} onChange={set("kind")}>
              {["PRODUCT", "VENTURE", "ADVISORY", "FOUNDATION", "STUDIO"].map((k) => (
                <option key={k} value={k}>{k.toLowerCase()}</option>
              ))}
            </select>
            <select value={form.status} onChange={set("status")}>
              {["CONCEPT", "IN_DEVELOPMENT", "PROTOTYPE", "PRIVATE_BETA", "LIVE", "ON_HOLD"].map((k) => (
                <option key={k} value={k}>{k.toLowerCase().replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <div className="kv">
            <span className="k">What makes a call relevant</span>
            <span className="v">
              <div className="viewsRow wrapRow">
                <input className="comment inputLine wideInput" placeholder="Keywords, comma separated" value={form.keywords} onChange={set("keywords")} />
                <input className="comment inputLine wideInput" placeholder="Sectors, comma separated" value={form.sectors} onChange={set("sectors")} />
                <input className="comment inputLine" placeholder="Geographies" value={form.geographies} onChange={set("geographies")} />
              </div>
              <div className="muted small">
                These decide what the system puts in front of you. A wrong keyword raises no error — it quietly steers
                the queue — so they are worth a minute.
              </div>
            </span>
          </div>

          <div className="kv">
            <span className="k">Where to look</span>
            <span className="v">
              <div className="viewsRow wrapRow">
                <input className="comment inputLine wideInput" placeholder="CPV codes for public tenders (optional)" value={form.cpvCodes} onChange={set("cpvCodes")} />
                <input className="comment inputLine wideInput" placeholder="Search terms (optional)" value={form.queryTerms} onChange={set("queryTerms")} />
                <input className="comment inputLine" placeholder="Buyer countries (FRA, LUX…)" value={form.countries} onChange={set("countries")} />
              </div>
              <div className="viewsRow wrapRow">
                <select value={form.watch} onChange={set("watch")}>
                  {[
                    ["GRANT,TENDER", "grants and tenders"],
                    ["GRANT", "grants only"],
                    ["TENDER,PRE_SOLICITATION", "tenders and early signals"],
                    ["EQUITY", "investors"],
                    ["MARKETPLACE_PROJECT", "marketplace work"],
                    ["ACQUISITION", "things to buy"],
                    [OPPORTUNITY_KINDS.join(","), "everything"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="muted small">
                Leave the search fields empty to track the project without any automated search — an honest state,
                and the default for anything with no machine-readable source.
              </div>
            </span>
          </div>

          <div className="viewsRow">
            <button className="btn on" disabled={!form.name.trim() || busy} onClick={() => void submit()}>
              {busy ? "saving…" : "save and queue a search"}
            </button>
            {slug && <span className="muted small">will become <code>registry/projects/{slug}.yaml</code></span>}
          </div>
        </>
      )}

      {message && <div className="ok small">{message}</div>}
    </section>
  );
}
