/**
 * Lecture des profils officiels sur les réseaux sociaux (famille N du modèle
 * de vérification). Contrat unique, versions simulées sur données fictives,
 * versions réelles NON BRANCHÉES : voir docs/visibility/adr/0003-reseaux-sociaux.md
 * (accès officiels avec l'autorisation du titulaire, jamais d'aspiration).
 */

export type SocialPlatform = "instagram" | "tiktok";

export interface SocialProfile {
  platform: SocialPlatform;
  handle: string;
  /** Adresse publique du profil, telle que les assistants la citent. */
  url: string;
  displayName: string;
  biography: string;
  /** Lien affiché dans la biographie, null s'il n'y en a pas. */
  website: string | null;
  postsCount: number | null;
}

export interface SocialPost {
  id: string;
  publishedAt: string;
  caption: string;
  permalink: string;
}

export interface SocialProfileReader {
  readonly platform: SocialPlatform;
  /** Vrai seulement pour une connexion réelle autorisée par le titulaire. */
  readonly live: boolean;
  getProfile(handle: string): Promise<SocialProfile>;
  /** Publications des `days` derniers jours, plus récentes d'abord. */
  listRecentPosts(handle: string, days: number): Promise<SocialPost[]>;
}

export function profileUrl(platform: SocialPlatform, handle: string): string {
  const h = handle.replace(/^@/, "");
  return platform === "instagram" ? `https://www.instagram.com/${h}` : `https://www.tiktok.com/@${h}`;
}

export interface FakeAccount {
  profile: Omit<SocialProfile, "platform" | "url">;
  posts: SocialPost[];
}

/** Version simulée : lit des comptes fictifs, ne touche jamais le réseau. */
export function createFakeReader(platform: SocialPlatform, accounts: FakeAccount[], now = new Date()): SocialProfileReader {
  const find = (handle: string) => {
    const h = handle.replace(/^@/, "").toLowerCase();
    const a = accounts.find((x) => x.profile.handle.toLowerCase() === h);
    if (!a) throw new Error(`${platform} (simulé) : profil @${h} inconnu ou non autorisé`);
    return a;
  };
  return {
    platform,
    live: false,
    async getProfile(handle) {
      const a = find(handle);
      return { ...a.profile, platform, url: profileUrl(platform, a.profile.handle) };
    },
    async listRecentPosts(handle, days) {
      const since = now.getTime() - days * 86_400_000;
      return find(handle)
        .posts.filter((p) => Date.parse(p.publishedAt) >= since)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    },
  };
}

/**
 * Version réelle : pas écrite. Elle refuse de s'exécuter tant que l'ADR 0003
 * n'est pas validé et que l'accès officiel (OAuth du titulaire) n'existe pas.
 */
export function createOfficialReader(platform: SocialPlatform): SocialProfileReader {
  const refuse = async (): Promise<never> => {
    throw new Error(
      `${platform} : accès officiel non branché (ADR 0003 à valider, autorisation du titulaire requise). Aucune lecture faite.`,
    );
  };
  return { platform, live: true, getProfile: refuse, listRecentPosts: refuse };
}

// ---- Contrôles de la famille N qui se calculent à partir d'un profil lu ----

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** N02 : le lien de la biographie pointe vers un domaine de la marque. */
export function checkBioLink(profile: SocialProfile, brandDomains: string[]): "conforme" | "non conforme" {
  const h = profile.website ? host(profile.website) : "";
  return h && brandDomains.some((d) => h === d || h.endsWith(`.${d}`)) ? "conforme" : "non conforme";
}

/** N04 : régularité sur la période (publications, jours depuis la dernière). */
export function postingRegularity(posts: SocialPost[], days: number, now = new Date()) {
  const last = posts[0] ? Math.floor((now.getTime() - Date.parse(posts[0].publishedAt)) / 86_400_000) : null;
  return { posts: posts.length, perWeek: Math.round((posts.length / days) * 7 * 10) / 10, daysSinceLast: last };
}
