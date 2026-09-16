import { describe, expect, it } from "vitest";
import {
  forProject,
  forRecord,
  openTasks,
  overdueTasks,
  tasksDueWithin,
  toggleTask,
  type TaskItem,
} from "../src/items";
import {
  createLocalStorageStore,
  createMemoryStore,
  exportWorkspace,
  importWorkspace,
  type StorageLike,
} from "../src/store";

const NOW = "2026-09-16T09:00:00Z";

function task(over: Partial<TaskItem> & { id: string }): TaskItem {
  return { at: "2026-09-01T00:00:00Z", actor: "mickael", status: "OPEN", title: "a task", ...over };
}

describe("tasks", () => {
  it("orders open tasks by due date, undated last", () => {
    const tasks = [
      task({ id: "c" }),
      task({ id: "a", due: "2026-09-20" }),
      task({ id: "b", due: "2026-09-18" }),
      task({ id: "done", due: "2026-09-01", status: "DONE" }),
    ];
    expect(openTasks(tasks).map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("separates overdue from due-soon", () => {
    const tasks = [task({ id: "late", due: "2026-09-10" }), task({ id: "soon", due: "2026-09-20" })];
    expect(overdueTasks(tasks, NOW).map((t) => t.id)).toEqual(["late"]);
    expect(tasksDueWithin(tasks, NOW, 14).map((t) => t.id)).toEqual(["soon"]);
  });

  it("stamps and clears the completion time on toggle", () => {
    const done = toggleTask(task({ id: "t" }), NOW);
    expect(done.status).toBe("DONE");
    expect(done.completedAt).toBe(NOW);
    const reopened = toggleTask(done, NOW);
    expect(reopened.status).toBe("OPEN");
    expect(reopened.completedAt).toBeUndefined();
  });

  it("finds items through a direct project link or through a tagged opportunity", () => {
    const items = [
      task({ id: "direct", projectSlug: "sillon" }),
      task({ id: "viaRecord", recordId: "rec-1" }),
      task({ id: "other", projectSlug: "bawaba" }),
    ];
    const tagOf = (recordId: string) => (recordId === "rec-1" ? "sillon" : undefined);
    expect(forProject(items, "sillon", tagOf).map((t) => t.id)).toEqual(["direct", "viaRecord"]);
    expect(forRecord(items, "rec-1").map((t) => t.id)).toEqual(["viaRecord"]);
  });
});

describe("workspace store", () => {
  it("falls back to memory when there is no web storage (server render)", () => {
    const store = createLocalStorageStore(null);
    expect(store.durability).toBe("EPHEMERAL");
    expect(store.read("oia.tasks.v1", [])).toEqual([]);
  });

  it("degrades to the fallback instead of throwing when storage misbehaves", () => {
    const hostile: StorageLike = {
      getItem: () => "{ not json",
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    const store = createLocalStorageStore(hostile);
    expect(store.read("oia.tasks.v1", ["fallback"])).toEqual(["fallback"]);
    expect(() => store.write("oia.tasks.v1", [1])).not.toThrow();
  });

  it("exports every workspace key and refuses a foreign file on import", () => {
    const store = createMemoryStore({ "oia.tasks.v1": [task({ id: "t" })] });
    const backup = exportWorkspace(store, NOW);
    expect(Object.keys(backup.data)).toContain("oia.contacts.v1");
    expect(() => importWorkspace(createMemoryStore(), { some: "file" })).toThrow(/not an OIA workspace backup/);
  });

  it("MERGES the audit log on import — restoring a backup never erases decisions", () => {
    const store = createMemoryStore({
      "oia.audit.v1": [{ id: "new", at: "2026-09-16T00:00:00Z", action: "APPROVE" }],
    });
    const backup = {
      kind: "oia.workspace.backup",
      version: 1,
      exportedAt: NOW,
      driver: "localStorage",
      data: {
        "oia.audit.v1": [
          { id: "old", at: "2026-08-01T00:00:00Z", action: "REJECT" },
          { id: "new", at: "2026-09-16T00:00:00Z", action: "APPROVE" },
        ],
        "unknown.key": [1, 2, 3],
      },
    };
    const result = importWorkspace(store, backup);
    const log = store.read<{ id: string }[]>("oia.audit.v1", []);
    expect(log.map((e) => e.id)).toEqual(["old", "new"]); // merged, de-duplicated, chronological
    expect(result.skipped).toContain("unknown.key");
  });
});
