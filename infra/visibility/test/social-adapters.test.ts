import { describe, expect, it } from "vitest";
import {
  checkBioLink,
  createFakeReader,
  createOfficialReader,
  postingRegularity,
  profileUrl,
} from "../src/social/adapters.js";

const now = new Date("2026-11-07T12:00:00Z");
const account = {
  profile: { handle: "demo_coach", displayName: "Demo Coach", biography: "Coach à Demo City", website: "https://demo.example/", postsCount: 3 },
  posts: [
    { id: "p1", publishedAt: "2026-11-05T10:00:00Z", caption: "Séance du jour", permalink: "https://www.instagram.com/p/p1" },
    { id: "p2", publishedAt: "2026-10-20T10:00:00Z", caption: "Padel", permalink: "https://www.instagram.com/p/p2" },
    { id: "p3", publishedAt: "2026-06-01T10:00:00Z", caption: "Ancienne", permalink: "https://www.instagram.com/p/p3" },
  ],
};

describe("adaptateurs réseaux sociaux (versions simulées)", () => {
  it("forme l'adresse publique du profil comme les assistants la citent", () => {
    expect(profileUrl("instagram", "@demo_coach")).toBe("https://www.instagram.com/demo_coach");
    expect(profileUrl("tiktok", "demo_coach")).toBe("https://www.tiktok.com/@demo_coach");
  });

  it("lit un profil fictif sans réseau, et refuse un profil non autorisé", async () => {
    const r = createFakeReader("instagram", [account], now);
    expect(r.live).toBe(false);
    const p = await r.getProfile("@Demo_Coach");
    expect(p).toMatchObject({ platform: "instagram", url: "https://www.instagram.com/demo_coach", website: "https://demo.example/" });
    await expect(r.getProfile("inconnu")).rejects.toThrow(/non autorisé/);
  });

  it("ne renvoie que les publications de la période, plus récentes d'abord", async () => {
    const posts = await createFakeReader("tiktok", [account], now).listRecentPosts("demo_coach", 90);
    expect(posts.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(postingRegularity(posts, 90, now)).toEqual({ posts: 2, perWeek: 0.2, daysSinceLast: 2 });
  });

  it("N02 : lien de biographie vers un domaine de la marque, sous-domaines compris", async () => {
    const p = await createFakeReader("instagram", [account], now).getProfile("demo_coach");
    expect(checkBioLink(p, ["demo.example"])).toBe("conforme");
    expect(checkBioLink({ ...p, website: "https://linktr.ee/demo" }, ["demo.example"])).toBe("non conforme");
    expect(checkBioLink({ ...p, website: null }, ["demo.example"])).toBe("non conforme");
  });

  it("la version officielle refuse de lire tant qu'elle n'est pas branchée (ADR 0003)", async () => {
    for (const platform of ["instagram", "tiktok"] as const) {
      const r = createOfficialReader(platform);
      await expect(r.getProfile("demo_coach")).rejects.toThrow(/non branché.*ADR 0003/);
      await expect(r.listRecentPosts("demo_coach", 30)).rejects.toThrow(/Aucune lecture faite/);
    }
  });
});
