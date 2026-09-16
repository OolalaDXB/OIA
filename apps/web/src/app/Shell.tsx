"use client";

import type { ReactNode } from "react";
import { Rail, StorageNote, type RailKey } from "./Console";

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
  title: string;
  stats?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  onExportAudit?: () => void;
}) {
  return (
    <div className="shell">
      <Rail active={active} {...(onExportAudit ? { onExportAudit } : {})} />
      <div className="app">
        <header className="hero">
          <div className="heroRow">
            <h1>{title}</h1>
            {stats && <span className="heroStats">{stats}</span>}
          </div>
          {note && <p className="heroNote">{note}</p>}
        </header>
        <StorageNote />
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
