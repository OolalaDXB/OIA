"use client";

import type { ReactNode } from "react";
import { Rail, StorageNote, type RailKey } from "./Console";
import { useLang } from "../lib/lang";
import type { Phrase } from "../lib/vocabulary";

/**
 * The one page shell every surface shares: rail on the left, hero band, then
 * whatever the surface is. Phase 1 built it for opportunities; Phase 3 reuses
 * it unchanged for tasks, notes, contacts, the digest and metrics — which was
 * the point of designing a generic record skeleton rather than an opportunity
 * screen.
 */
export function Shell({
  active,
  title,
  stats,
  note,
  children,
  onExportAudit,
}: {
  active: RailKey;
  /** A fixed string, or the same title in both languages. */
  title: string | Phrase;
  stats?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  onExportAudit?: () => void;
}) {
  const { lang, toggle } = useLang();
  return (
    <div className="shell">
      <Rail active={active} {...(onExportAudit ? { onExportAudit } : {})} />
      <div className="app">
        <header className="hero">
          <div className="heroRow">
            <h1>{typeof title === "string" ? title : title[lang]}</h1>
            <span className="heroStats">
              {stats}
              <button
                className="langBtn"
                onClick={toggle}
                title={lang === "fr" ? "Switch to English" : "Passer en français"}
              >
                {lang === "fr" ? "EN" : "FR"}
              </button>
            </span>
          </div>
          {note && <p className="heroNote">{note}</p>}
        </header>
        <StorageNote />
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
