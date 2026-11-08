import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from } }));
import { lireVueMoney } from "@/lib/donnees/money-reel";
import { ESPACE_OIA } from "@/lib/money-contrat";
beforeEach(() => { vi.clearAllMocks(); const builder = { select: () => builder, eq: mock.eq, range: mock.range }; mock.eq.mockReturnValue(builder); mock.from.mockReturnValue(builder); });
describe("lectures réelles Money", () => {
  it("filtre exclusivement l'espace OIA et l'horizon demandé", async () => { mock.range.mockResolvedValue({ data: [], error: null }); expect(await lireVueMoney("ml_aujourdhui_v2", { horizon: 7 })).toEqual([]); expect(mock.from).toHaveBeenCalledWith("ml_aujourdhui_v2"); expect(mock.eq).toHaveBeenCalledWith("espace_id", ESPACE_OIA); expect(mock.eq).toHaveBeenCalledWith("horizon", 7); });
  it("pagine au-delà de la limite de mille lignes", async () => { mock.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })), error: null }).mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id: String(id + 500) })), error: null }).mockResolvedValueOnce({ data: [{ id: "1000" }], error: null }); const rows = await lireVueMoney("ml_toutes_v2"); expect(rows).toHaveLength(1001); expect(mock.range).toHaveBeenNthCalledWith(3, 1000, 1499); });
  it("préserve le message et le code de refus sans retourner un cache", async () => { mock.range.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } }); await expect(lireVueMoney("ml_toutes_v2")).rejects.toMatchObject({ message: "permission denied", code: "42501" }); });
});