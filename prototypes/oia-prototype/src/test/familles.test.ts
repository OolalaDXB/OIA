import { describe, expect, it } from "vitest";
import { onboarding } from "@/data/demo";
describe("contrôles", () => {
  it("13 familles totalisent 85 contrôles", () => {
    expect(onboarding.familles).toHaveLength(13);
    expect(onboarding.familles.reduce((s, [, a, b, c]) => s + a + b + c, 0)).toBe(85);
  });
});
