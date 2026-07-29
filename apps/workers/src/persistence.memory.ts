import type { Persistence, PersistInput } from "./persistence";

export interface MemoryPersistence extends Persistence {
  records: PersistInput[];
}

/** In-memory persistence for tests and dry runs. */
export function createMemoryPersistence(): MemoryPersistence {
  const records: PersistInput[] = [];
  let counter = 0;
  return {
    records,
    async persist(input: PersistInput): Promise<string> {
      records.push(input);
      counter += 1;
      return `mem-opp-${counter}`;
    },
  };
}
