import type { ProjectProfile } from "@oia/database";

/**
 * TheStudio project profiles (Phase 2) — the EXISTING ProjectProfile type
 * from @oia/database, no DTO redefined.
 *
 * WORKING HYPOTHESES, not gospel: sectors/keywords/geographies are Claude's
 * best current understanding, written to be reviewed and corrected by
 * Mickael. The suggestion engine always shows WHICH signals matched, so a
 * wrong keyword is visible and fixable here, in one place.
 *
 * Entity doctrine (reminder): EU/FR funding routes through Oolala France SAS
 * (IP + financements), GCC commercial through Oolala Next FZ-LLC; dedicated
 * entities (Bawaba SAS, BEAU SAS…) only on precise triggers.
 */
export const THESTUDIO_PROJECTS: ProjectProfile[] = [
  {
    slug: "bawaba",
    name: "BAWABA",
    legalEntities: [],
    sectors: ["AI", "data", "digital", "creative industries", "culture"],
    geographies: ["EU", "FR", "AE", "GCC", "MENA"],
    stage: "pre-launch",
    fundingTypes: ["grant", "subsidy", "equity-free"],
    keywords: [
      "artificial intelligence",
      "ai",
      "data",
      "platform",
      "digital",
      "creative",
      "culture",
      "media",
      "software",
      "innovation",
    ],
    exclusions: [],
  },
  {
    slug: "sillon",
    name: "SILLON",
    legalEntities: [],
    sectors: ["digital", "software"],
    geographies: ["FR", "EU"],
    stage: "build",
    fundingTypes: ["grant"],
    // Profile deliberately thin — to be filled by Mickael (SIL- product).
    keywords: ["software", "saas", "application"],
    exclusions: [],
  },
  {
    slug: "maisons-co",
    name: "Maisons.co",
    legalEntities: [],
    sectors: ["hospitality", "tourism", "real estate"],
    geographies: ["FR", "GE", "AE"],
    stage: "operating",
    fundingTypes: ["grant", "subsidy"],
    keywords: [
      "hospitality",
      "tourism",
      "accommodation",
      "rural",
      "heritage",
      "renovation",
      "real estate",
      "hotel",
    ],
    exclusions: [],
  },
  {
    slug: "myoolala",
    name: "myOolala",
    legalEntities: [],
    sectors: ["digital", "consumer app"],
    geographies: ["FR", "EU", "AE"],
    stage: "build",
    fundingTypes: ["grant"],
    // Profile deliberately thin — to be filled by Mickael (MYO- product).
    keywords: ["app", "application", "consumer", "family", "saas"],
    exclusions: [],
  },
  {
    slug: "beau",
    name: "BEAU",
    legalEntities: [],
    sectors: ["creative industries", "design"],
    geographies: ["FR", "EU"],
    stage: "concept",
    fundingTypes: ["grant"],
    // Profile deliberately thin — to be filled by Mickael (BEAU SAS trigger-gated).
    keywords: ["design", "creative", "brand", "craft"],
    exclusions: [],
  },
  {
    slug: "ludography",
    name: "Ludography",
    legalEntities: [],
    sectors: ["games", "culture", "creative industries", "publishing"],
    geographies: ["FR", "EU"],
    stage: "concept",
    fundingTypes: ["grant"],
    keywords: ["game", "games", "ludic", "play", "culture", "publishing", "creative", "catalogue"],
    exclusions: [],
  },
];
