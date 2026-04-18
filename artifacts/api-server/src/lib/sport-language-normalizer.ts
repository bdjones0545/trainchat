/**
 * Sport Language Normalization System
 *
 * Translates free-text sport references — slang, shorthand, nicknames,
 * role words, and informal language — into canonical sport/role IDs that
 * the ranking, scoring, and programming engines consume.
 *
 * Core principle: keep three layers separate:
 *   1. rawInput  — what the user actually typed
 *   2. matched alias — what word/phrase triggered the match
 *   3. canonicalSportId / canonicalRoleId — what the engine uses
 *
 * Design decisions:
 * - All alias logic lives here; nothing else in the codebase does ad-hoc
 *   sport string parsing.
 * - Aliases that appear in MULTIPLE sport entries are naturally ambiguous.
 *   When findCandidates returns multiple matches, disambiguation runs.
 * - Ambiguous aliases never silently over-resolve — they return
 *   resolutionType "ambiguous" unless context makes the intent clear.
 * - Unknown phrases do not crash; they return resolutionType "none".
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** The fully-resolved output from the normalizer. */
export type SportResolution = {
  /** The original, unmodified user input. */
  rawInput: string;
  /** The normalized form used for matching (lowercased, stripped). */
  normalizedText: string;
  /** The specific alias that triggered the match, if any. */
  matchedAlias?: string;
  /**
   * Canonical sport ID (e.g. "pickleball", "cricket_bowler").
   * For role-based resolutions, this may BE the role sport ID
   * (e.g. "cricket_bowler") rather than the parent sport ("cricket").
   */
  canonicalSportId?: string;
  /**
   * Canonical role ID within a base sport, when the resolution is at
   * the role level (e.g. "volleyball_setter", "baseball_position_player").
   * Only set when the role does not have its own full sport profile.
   */
  canonicalRoleId?: string;
  /**
   * 0–1 confidence score.
   * ≥0.8 = safe to use without user confirmation
   * 0.5–0.79 = use with caution or prompt for confirmation
   * <0.5 = ambiguous or very low confidence
   */
  confidence: number;
  /**
   * When resolutionType is "ambiguous", lists the candidate sport IDs that
   * could all be valid.
   */
  ambiguity?: string[];
  /**
   * How the resolution was reached:
   * "exact"      — matched the canonical ID directly
   * "alias"      — matched via alias registry (single unambiguous candidate)
   * "contextual" — matched by combining alias + profile context
   * "ambiguous"  — multiple valid candidates; did not auto-resolve
   * "none"       — no match found
   */
  resolutionType: "exact" | "alias" | "contextual" | "ambiguous" | "none";
};

/** A role within a sport, with its own set of aliases. */
type RoleAliasEntry = {
  /**
   * The canonical role ID.
   * If this ID also exists as a top-level sport profile (e.g. "cricket_bowler"),
   * the resolver will set canonicalSportId = canonicalRoleId for the result.
   */
  canonicalRoleId: string;
  aliases: string[];
};

/** One entry in the alias registry. */
type SportAliasEntry = {
  /** The canonical sport ID (e.g. "pickleball", "flag_football"). */
  canonicalSportId: string;
  /** A human-readable display name for use in explanations. */
  displayName: string;
  /**
   * All text strings that should map to this sport.
   * If the same alias appears in MULTIPLE registry entries, those aliases
   * are naturally ambiguous and will trigger the disambiguation flow.
   */
  aliases: string[];
  /** Role-level aliases within this sport. */
  roleAliases?: RoleAliasEntry[];
};

/** A candidate during multi-match resolution. */
export type SportResolutionCandidate = {
  canonicalSportId: string;
  canonicalRoleId?: string;
  confidence: number;
  matchedAlias: string;
};

// ─── Low-Confidence Aliases ───────────────────────────────────────────────────
//
// Aliases that match a sport but with reduced confidence (0.55) because they
// are informal, very overloaded, or unlikely to be sport identity signals.

const LOW_CONFIDENCE_ALIASES: Set<string> = new Set([
  "pickles",     // pickleball slang — very informal
  "pb",          // pickleball vs "personal best"
  "ball",        // basketball vs football
  "fight",       // boxing vs mma vs general
  "pitch",       // cricket vs baseball (equipment/action word)
  "baddy",       // badminton — very unusual identity word
  "shuttlecock", // badminton — equipment word, not identity
  "puck",        // hockey — equipment word
  "gridiron",    // football — archaic
  "rugger",      // rugby — rare
]);

// ─── Alias Registry ───────────────────────────────────────────────────────────
//
// The single source of truth for all sport alias mappings.
//
// Important: If an alias string appears in MULTIPLE entries, it will generate
// multiple candidates and trigger disambiguation (this is intentional).
// Do NOT rely on `ambiguousAliases` fields — just register the alias in each
// sport it can mean and let the system detect the ambiguity automatically.

export const SPORT_ALIAS_REGISTRY: SportAliasEntry[] = [
  // ── American Football ──────────────────────────────────────────────────
  {
    canonicalSportId: "football",
    displayName: "Football",
    // "football" also appears in soccer for UK disambiguation
    aliases: [
      "american football",
      "football",
      "gridiron",
      "nfl",
      "high school football",
      "college football",
    ],
    roleAliases: [
      {
        canonicalRoleId: "lineman",
        aliases: ["lineman", "linemen", "o-line", "d-line", "offensive lineman", "defensive lineman"],
      },
      {
        canonicalRoleId: "skill",
        aliases: ["wide receiver", "wr", "running back", "rb", "quarterback", "qb", "tight end", "te", "linebacker", "lb", "defensive back", "db"],
      },
    ],
  },

  // ── Flag Football ──────────────────────────────────────────────────────
  {
    canonicalSportId: "flag_football",
    displayName: "Flag Football",
    aliases: [
      "flag football",
      "flag",
      "7on7",
      "7v7",
      "seven on seven",
    ],
  },

  // ── Basketball ────────────────────────────────────────────────────────
  {
    canonicalSportId: "basketball",
    displayName: "Basketball",
    aliases: [
      "basketball",
      "hoops",
      "hooper",
      "bball",
      "b-ball",
      "nba",
      "basketball player",
      "baller",
      "ball",        // low-confidence — also registered in football
    ],
    roleAliases: [
      { canonicalRoleId: "guard",        aliases: ["point guard", "shooting guard", "pg", "sg"] },
      { canonicalRoleId: "forward_wing", aliases: ["small forward", "power forward", "sf", "pf", "wing"] },
      { canonicalRoleId: "big_post",     aliases: ["big", "post", "big man", "five", "center"] },
    ],
  },

  // ── Soccer ────────────────────────────────────────────────────────────
  {
    canonicalSportId: "soccer",
    displayName: "Soccer",
    // "football" also in football entry; "keeper"/"goalkeeper" also in hockey/cricket
    aliases: [
      "soccer",
      "football",   // UK usage — ambiguous with American football
      "futbol",
      "fútbol",
      "mls",
      "premier league",
      "footballer",
    ],
    roleAliases: [
      { canonicalRoleId: "goalkeeper", aliases: ["goalkeeper", "goalie", "gk", "goaltender"] },
      { canonicalRoleId: "goalkeeper", aliases: ["keeper"] },  // "keeper" also in cricket_wicketkeeper
      { canonicalRoleId: "defender",   aliases: ["defender", "cb", "lb", "rb", "fullback", "center back"] },
      { canonicalRoleId: "midfielder", aliases: ["midfielder", "cm", "cdm", "cam", "box-to-box"] },
      { canonicalRoleId: "forward_wing", aliases: ["striker", "winger", "cf", "lw", "rw"] },
    ],
  },

  // ── Baseball ──────────────────────────────────────────────────────────
  {
    canonicalSportId: "baseball",
    displayName: "Baseball",
    aliases: [
      "baseball",
      "mlb",
      "ballplayer",
      "baseball player",
    ],
    roleAliases: [
      {
        // This role also has its own full sport profile: baseball_pitcher
        canonicalRoleId: "baseball_pitcher",
        aliases: ["pitcher", "starter", "closer", "reliever", "righty", "lefty", "southpaw", "thrower"],
      },
      {
        canonicalRoleId: "baseball_position_player",
        // "batter" also registered in cricket_batter → triggers disambiguation
        aliases: ["hitter", "batter", "position player", "outfielder", "infielder", "shortstop", "catcher", "first base", "second base", "third base", "1b", "2b", "3b", "ss"],
      },
    ],
  },

  // ── Baseball Pitcher (standalone profile) ─────────────────────────────
  {
    canonicalSportId: "baseball_pitcher",
    displayName: "Baseball Pitcher",
    aliases: [
      "baseball pitcher",
      "baseball_pitcher",
    ],
  },

  // ── Softball ──────────────────────────────────────────────────────────
  {
    canonicalSportId: "softball",
    displayName: "Softball",
    aliases: [
      "softball",
      "fastpitch",
      "fast-pitch",
      "slowpitch",
      "slow-pitch",
    ],
    roleAliases: [
      { canonicalRoleId: "baseball_pitcher", aliases: ["pitcher"] },
    ],
  },

  // ── Hockey ────────────────────────────────────────────────────────────
  {
    canonicalSportId: "hockey",
    displayName: "Hockey",
    aliases: [
      "hockey",
      "ice hockey",
      "field hockey",
      "nhl",
      "puck",
    ],
    roleAliases: [
      // "goalie" and "keeper" also in soccer → disambiguation triggered
      { canonicalRoleId: "goalkeeper", aliases: ["goalie", "goaltender", "netminder"] },
      { canonicalRoleId: "goalkeeper", aliases: ["keeper"] },
      { canonicalRoleId: "defender",   aliases: ["defenseman", "blueliner", "d-man"] },
    ],
  },

  // ── Rugby ──────────────────────────────────────────────────────────────
  {
    canonicalSportId: "rugby",
    displayName: "Rugby",
    aliases: [
      "rugby",
      "rugby union",
      "rugby league",
      "rugger",
      "rugby player",
      "sevens",
      "7s rugby",
    ],
  },

  // ── Lacrosse ──────────────────────────────────────────────────────────
  {
    canonicalSportId: "lacrosse",
    displayName: "Lacrosse",
    aliases: [
      "lacrosse",
      "lax",
      "laxer",
      "lacrosse player",
    ],
  },

  // ── Volleyball ────────────────────────────────────────────────────────
  {
    canonicalSportId: "volleyball",
    displayName: "Volleyball",
    aliases: [
      "volleyball",
      "vb",
      "v-ball",
      "beach volleyball",
      "beach vb",
      "volleyball player",
    ],
    roleAliases: [
      { canonicalRoleId: "volleyball_setter",  aliases: ["setter"] },
      { canonicalRoleId: "volleyball_libero",  aliases: ["libero", "ds", "defensive specialist"] },
      {
        canonicalRoleId: "volleyball_hitter",
        aliases: [
          "hitter",
          "outside",
          "outside hitter",
          "opposite",
          "middle blocker",
          "middle",
          "mb",
          "rs",
          "right side",
        ],
      },
    ],
  },

  // ── Tennis ────────────────────────────────────────────────────────────
  {
    canonicalSportId: "tennis",
    displayName: "Tennis",
    aliases: [
      "tennis",
      "tennis player",
      "atp",
      "wta",
    ],
  },

  // ── Pickleball ────────────────────────────────────────────────────────
  {
    canonicalSportId: "pickleball",
    displayName: "Pickleball",
    aliases: [
      "pickleball",
      "pickle",
      "pickles",   // very informal slang — LOW_CONFIDENCE_ALIASES applies
      "pb",        // low-confidence — may mean personal best
    ],
  },

  // ── Padel ─────────────────────────────────────────────────────────────
  {
    canonicalSportId: "padel",
    displayName: "Padel",
    aliases: [
      "padel",
      "padel tennis",
    ],
  },

  // ── Badminton ─────────────────────────────────────────────────────────
  {
    canonicalSportId: "badminton",
    displayName: "Badminton",
    aliases: [
      "badminton",
      "shuttlecock",  // low-confidence — equipment word
      "baddy",        // low-confidence — very informal
    ],
  },

  // ── Squash ────────────────────────────────────────────────────────────
  {
    canonicalSportId: "squash",
    displayName: "Squash",
    aliases: [
      "squash",
      "squash player",
    ],
  },

  // ── Bowling ───────────────────────────────────────────────────────────
  {
    canonicalSportId: "bowling",
    displayName: "Bowling",
    // "bowler" also registered in cricket_bowler → disambiguation triggered
    aliases: [
      "bowling",
      "ten-pin bowling",
      "10-pin",
      "tenpin",
      "bowler",   // ambiguous: also means cricket bowler
    ],
  },

  // ── Wrestling ─────────────────────────────────────────────────────────
  {
    canonicalSportId: "wrestling",
    displayName: "Wrestling",
    aliases: [
      "wrestling",
      "wrestler",
      "folkstyle",
      "freestyle wrestling",
      "greco-roman",
      "greco roman",
      "grappling",
      "grappler",
    ],
  },

  // ── Boxing ────────────────────────────────────────────────────────────
  {
    canonicalSportId: "boxing",
    displayName: "Boxing",
    // "fighter" also in mma → disambiguation triggered
    aliases: [
      "boxing",
      "boxer",
      "sweet science",
      "pugilist",
      "fighter",  // ambiguous: also means mma
    ],
  },

  // ── MMA ───────────────────────────────────────────────────────────────
  {
    canonicalSportId: "mma",
    displayName: "MMA",
    // "fighter" also in boxing → disambiguation triggered
    aliases: [
      "mma",
      "mixed martial arts",
      "ufc",
      "cage fighter",
      "cage fighting",
      "martial arts",
      "fighter",  // ambiguous: also means boxing
    ],
  },

  // ── Cricket (base) ────────────────────────────────────────────────────
  {
    canonicalSportId: "cricket",
    displayName: "Cricket",
    aliases: [
      "cricket",
      "cricket player",
      "cricketer",
    ],
    roleAliases: [
      // "bowler" also in bowling.aliases → disambiguation triggered
      // canonicalRoleId = "cricket_bowler" which is a full sport profile
      {
        canonicalRoleId: "cricket_bowler",
        aliases: ["bowler", "cricket bowler", "fast bowler", "spin bowler", "pace bowler", "seamer"],
      },
      // "batter"/"batsman" also in baseball → disambiguation triggered
      // canonicalRoleId = "cricket_batter" which is a full sport profile
      {
        canonicalRoleId: "cricket_batter",
        aliases: ["batter", "batsman", "cricket batter", "cricket batsman"],
      },
      // "keeper" also in soccer and hockey → disambiguation triggered
      // canonicalRoleId = "cricket_wicketkeeper" which is a full sport profile
      {
        canonicalRoleId: "cricket_wicketkeeper",
        aliases: ["keeper", "wicketkeeper", "cricket keeper", "cricket wicketkeeper"],
      },
    ],
  },

  // ── Cricket Bowler (full standalone profile) ──────────────────────────
  {
    canonicalSportId: "cricket_bowler",
    displayName: "Cricket Bowler",
    aliases: [
      "cricket bowler",
      "fast bowler",
      "spin bowler",
      "pace bowler",
      "seamer",
    ],
  },

  // ── Cricket Batter (full standalone profile) ──────────────────────────
  {
    canonicalSportId: "cricket_batter",
    displayName: "Cricket Batter",
    aliases: [
      "cricket batter",
      "cricket batsman",
    ],
  },

  // ── Cricket Wicketkeeper (full standalone profile) ────────────────────
  {
    canonicalSportId: "cricket_wicketkeeper",
    displayName: "Cricket Wicketkeeper",
    aliases: [
      "wicketkeeper",
      "cricket keeper",
      "cricket wicketkeeper",
    ],
  },

  // ── Golf ──────────────────────────────────────────────────────────────
  {
    canonicalSportId: "golf",
    displayName: "Golf",
    aliases: [
      "golf",
      "golfer",
      "pga",
      "lpga",
      "scratch golfer",
      "golf player",
    ],
  },

  // ── Swimming ──────────────────────────────────────────────────────────
  {
    canonicalSportId: "swimming",
    displayName: "Swimming",
    aliases: [
      "swimming",
      "swimmer",
      "swim",
      "pool",
      "freestyle swimmer",
    ],
  },

  // ── Track & Field ─────────────────────────────────────────────────────
  {
    canonicalSportId: "track",
    displayName: "Track & Field",
    aliases: [
      "track",
      "track and field",
      "sprinter",
      "track athlete",
      "runner",
      "hurdler",
      "jumper",
      "throws",
      "field events",
    ],
  },

  // ── Rowing ────────────────────────────────────────────────────────────
  {
    canonicalSportId: "rowing",
    displayName: "Rowing",
    aliases: [
      "rowing",
      "rower",
      "crew",
      "sculling",
      "sculler",
      "ergometer",
      "erg",
    ],
  },

  // ── Cycling ───────────────────────────────────────────────────────────
  {
    canonicalSportId: "cycling",
    displayName: "Cycling",
    aliases: [
      "cycling",
      "cyclist",
      "road cycling",
      "mountain biking",
      "mtb",
      "biking",
      "road bike",
      "triathlon",
      "triathlete",
    ],
  },
];

// ─── Sub-Sport Role IDs ───────────────────────────────────────────────────────
//
// These canonicalRoleIds have their own top-level sport profiles AND standalone
// sport entries in the registry. When a roleAlias resolves to one of these,
// canonicalSportId is promoted to the role ID (the role IS the sport).
//
// Volleyball roles are intentionally excluded — they are sub-profiles of the
// volleyball sport and should remain as canonicalRoleId under canonicalSportId="volleyball".
const ROLE_IS_FULL_SPORT = new Set([
  "cricket_bowler",
  "cricket_batter",
  "cricket_wicketkeeper",
  "baseball_pitcher",
  "baseball_position_player",
]);

// ─── Text Preprocessing ───────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''`]['']?s\b/g, "")    // strip possessives: golfer's → golfer
    .replace(/[''`]/g, "")            // remove remaining apostrophes
    .replace(/[^a-z0-9\s\-]/g, " ")   // strip non-alphanumeric punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function expandShorthand(text: string): string {
  const expansions: [RegExp, string][] = [
    [/\bufc\b/gi, "mma"],
    [/\bnba\b/gi, "basketball"],
    [/\bnfl\b/gi, "football"],
    [/\bnhl\b/gi, "hockey"],
    [/\bmlb\b/gi, "baseball"],
    [/\bpga\b/gi, "golf"],
    [/\blpga\b/gi, "golf"],
    [/\bmtb\b/gi, "mountain biking"],
  ];
  let result = text;
  for (const [pattern, replacement] of expansions) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Alias Registry Index ─────────────────────────────────────────────────────

type AliasIndexEntry = {
  canonicalSportId: string;
  canonicalRoleId?: string;
  displayName: string;
  isLowConfidence: boolean;
};

function buildAliasIndex(): Map<string, AliasIndexEntry[]> {
  const index = new Map<string, AliasIndexEntry[]>();

  const add = (rawAlias: string, entry: AliasIndexEntry) => {
    const key = normalizeText(rawAlias);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    // Avoid exact-duplicate entries (same sport + role)
    const existing = index.get(key)!;
    const isDupe = existing.some(
      e => e.canonicalSportId === entry.canonicalSportId && e.canonicalRoleId === entry.canonicalRoleId,
    );
    if (!isDupe) existing.push(entry);
  };

  for (const sportEntry of SPORT_ALIAS_REGISTRY) {
    // Top-level canonical ID always resolves exactly
    add(sportEntry.canonicalSportId.replace(/_/g, " "), {
      canonicalSportId: sportEntry.canonicalSportId,
      displayName: sportEntry.displayName,
      isLowConfidence: false,
    });

    // Regular aliases
    for (const alias of sportEntry.aliases) {
      const normAlias = normalizeText(alias);
      add(alias, {
        canonicalSportId: sportEntry.canonicalSportId,
        displayName: sportEntry.displayName,
        isLowConfidence: LOW_CONFIDENCE_ALIASES.has(normAlias),
      });
    }

    // Role aliases
    for (const roleEntry of sportEntry.roleAliases ?? []) {
      for (const alias of roleEntry.aliases) {
        const normAlias = normalizeText(alias);
        // If the role has its own full sport profile, promote it to canonicalSportId
        if (ROLE_IS_FULL_SPORT.has(roleEntry.canonicalRoleId)) {
          add(alias, {
            canonicalSportId: roleEntry.canonicalRoleId,  // ← the role IS the sport
            displayName: sportEntry.displayName,
            isLowConfidence: LOW_CONFIDENCE_ALIASES.has(normAlias),
          });
        } else {
          add(alias, {
            canonicalSportId: sportEntry.canonicalSportId,
            canonicalRoleId: roleEntry.canonicalRoleId,
            displayName: sportEntry.displayName,
            isLowConfidence: LOW_CONFIDENCE_ALIASES.has(normAlias),
          });
        }
      }
    }
  }

  return index;
}

const ALIAS_INDEX = buildAliasIndex();

// ─── Core Resolver ────────────────────────────────────────────────────────────

export function resolveSportLanguage(input: {
  text: string;
  currentProfile?: {
    primarySport?: string | null;
    secondarySports?: string[] | null;
    positionOrRole?: string | null;
  };
  availableSports?: string[];
}): SportResolution {
  const rawInput = input.text;
  const expanded = expandShorthand(rawInput);
  const normalizedText = normalizeText(expanded);

  if (!normalizedText) {
    return { rawInput, normalizedText: "", confidence: 0, resolutionType: "none" };
  }

  // ── Step 1: Exact canonical ID match ─────────────────────────────────
  const asCanonical = normalizedText.replace(/\s+/g, "_");
  for (const sportEntry of SPORT_ALIAS_REGISTRY) {
    if (sportEntry.canonicalSportId === asCanonical) {
      return {
        rawInput,
        normalizedText,
        matchedAlias: sportEntry.canonicalSportId,
        canonicalSportId: sportEntry.canonicalSportId,
        confidence: 1.0,
        resolutionType: "exact",
      };
    }
  }

  // ── Step 2: Find all alias candidates ────────────────────────────────
  const candidates = findCandidates(normalizedText);

  if (candidates.length === 0) {
    return { rawInput, normalizedText, confidence: 0, resolutionType: "none" };
  }

  // ── Step 3: Single unambiguous candidate ─────────────────────────────
  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      rawInput,
      normalizedText,
      matchedAlias: c.matchedAlias,
      canonicalSportId: c.canonicalSportId,
      canonicalRoleId: c.canonicalRoleId,
      confidence: c.confidence,
      resolutionType: "alias",
    };
  }

  // ── Step 4: Multiple candidates — disambiguate ────────────────────────
  return disambiguateSportAlias({
    rawInput,
    normalizedText,
    candidateMatches: candidates,
    currentProfile: input.currentProfile,
  });
}

// ─── Candidate Finder ─────────────────────────────────────────────────────────

function findCandidates(normalizedText: string): SportResolutionCandidate[] {
  const found: SportResolutionCandidate[] = [];
  const seen = new Set<string>();

  // Longest phrase first
  const sortedKeys = Array.from(ALIAS_INDEX.keys()).sort((a, b) => b.length - a.length);

  for (const aliasKey of sortedKeys) {
    if (!containsPhraseAsWord(normalizedText, aliasKey)) continue;

    const entries = ALIAS_INDEX.get(aliasKey)!;
    for (const entry of entries) {
      const uniqueKey = `${entry.canonicalSportId}:${entry.canonicalRoleId ?? ""}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const confidence = entry.isLowConfidence ? 0.55 : computeBaseConfidence(aliasKey);
      found.push({
        canonicalSportId: entry.canonicalSportId,
        canonicalRoleId: entry.canonicalRoleId,
        confidence,
        matchedAlias: aliasKey,
      });
    }
  }

  return found;
}

function containsPhraseAsWord(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  if (!phrase.includes(" ")) {
    // Single word: standard word boundary match
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  }
  // Multi-word phrase: must appear with word-boundary-like start and end
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i").test(text);
}

function computeBaseConfidence(alias: string): number {
  const words = alias.split(" ").length;
  if (words >= 3) return 0.95;
  if (words === 2) return 0.90;
  return 0.85;
}

// ─── Contextual Disambiguation ────────────────────────────────────────────────

export function disambiguateSportAlias(input: {
  rawInput: string;
  normalizedText: string;
  candidateMatches: SportResolutionCandidate[];
  currentProfile?: {
    primarySport?: string | null;
    secondarySports?: string[] | null;
    positionOrRole?: string | null;
  };
}): SportResolution {
  const { rawInput, normalizedText, candidateMatches, currentProfile } = input;

  // Build the full set of sports in the current profile
  const allProfileSports = [
    ...(currentProfile?.primarySport ? [currentProfile.primarySport] : []),
    ...(currentProfile?.secondarySports ?? []),
  ];

  const profileContains = (...sports: string[]) =>
    sports.some(s => allProfileSports.some(ps => ps?.includes(s)));

  const text = normalizedText;

  // ── "bowler" — bowling vs cricket_bowler ────────────────────────────
  if (text.includes("bowler") || text.includes("seamer")) {
    // Cricket-specific qualifier words that remove ambiguity
    const cricketBowlerCues = ["fast", "spin", "pace", "seam", "swing", "medium", "over"];
    const hasCricketCue = cricketBowlerCues.some(cue => text.includes(cue));
    if (hasCricketCue || text.includes("cricket")) {
      const alias = hasCricketCue ? text : "cricket bowler";
      return mk(rawInput, text, alias, "cricket_bowler", undefined, 0.95, "contextual");
    }
    if (profileContains("cricket")) {
      return mk(rawInput, text, "bowler", "cricket_bowler", undefined, 0.90, "contextual");
    }
    if (profileContains("bowling")) {
      return mk(rawInput, text, "bowler", "bowling", undefined, 0.90, "contextual");
    }
    // No context — return ambiguous
    return ambiguous(rawInput, text, "bowler", ["bowling", "cricket_bowler"], candidateMatches);
  }

  // ── "batter" / "batsman" — baseball vs cricket ───────────────────────
  if (text === "batter" || text === "batsman" || text === "batting") {
    if (profileContains("cricket")) {
      return mk(rawInput, text, "batter", "cricket_batter", undefined, 0.90, "contextual");
    }
    if (profileContains("baseball", "softball")) {
      return mk(rawInput, text, "batter", "baseball", "baseball_position_player", 0.90, "contextual");
    }
    if (text.includes("cricket")) {
      return mk(rawInput, text, "cricket batter", "cricket_batter", undefined, 0.95, "contextual");
    }
    return ambiguous(rawInput, text, "batter", ["baseball", "cricket_batter"], candidateMatches);
  }

  // ── "keeper" / "goalkeeper" — soccer vs hockey vs cricket ────────────
  if (text.includes("keeper") || text.includes("goalkeeper")) {
    if (text.includes("wicket") || text.includes("cricket")) {
      return mk(rawInput, text, "keeper", "cricket_wicketkeeper", undefined, 0.95, "contextual");
    }
    if (text.includes("soccer") || (text.includes("football") && !text.includes("cricket"))) {
      return mk(rawInput, text, "keeper", "soccer", "goalkeeper", 0.85, "contextual");
    }
    if (text.includes("hockey")) {
      return mk(rawInput, text, "keeper", "hockey", "goalkeeper", 0.85, "contextual");
    }
    if (profileContains("cricket")) {
      return mk(rawInput, text, "keeper", "cricket_wicketkeeper", undefined, 0.85, "contextual");
    }
    if (profileContains("soccer")) {
      return mk(rawInput, text, "keeper", "soccer", "goalkeeper", 0.85, "contextual");
    }
    if (profileContains("hockey")) {
      return mk(rawInput, text, "keeper", "hockey", "goalkeeper", 0.85, "contextual");
    }
    // goalkeeper without sport context → default soccer (most common)
    if (text === "goalkeeper") {
      return mk(rawInput, text, "goalkeeper", "soccer", "goalkeeper", 0.80, "alias");
    }
    return ambiguous(rawInput, text, "keeper", ["cricket_wicketkeeper", "soccer", "hockey"], candidateMatches);
  }

  // ── "pitcher" — baseball_pitcher vs cricket_bowler ───────────────────
  if (text === "pitcher") {
    if (text.includes("cricket") || profileContains("cricket")) {
      return mk(rawInput, text, "pitcher", "cricket_bowler", undefined, 0.80, "contextual");
    }
    // Baseball is the overwhelming default for "pitcher"
    return mk(rawInput, text, "pitcher", "baseball_pitcher", undefined, 0.90, "alias");
  }

  // ── "fighter" — boxing vs mma ────────────────────────────────────────
  if (text.includes("fighter")) {
    if (text.includes("boxing") || text.includes("boxer") || text.includes("punch")) {
      return mk(rawInput, text, "fighter", "boxing", undefined, 0.85, "contextual");
    }
    if (text.includes("mma") || text.includes("cage") || text.includes("ufc")) {
      return mk(rawInput, text, "fighter", "mma", undefined, 0.85, "contextual");
    }
    if (profileContains("boxing")) {
      return mk(rawInput, text, "fighter", "boxing", undefined, 0.82, "contextual");
    }
    if (profileContains("mma")) {
      return mk(rawInput, text, "fighter", "mma", undefined, 0.82, "contextual");
    }
    return ambiguous(rawInput, text, "fighter", ["boxing", "mma"], candidateMatches);
  }

  // ── "football" — American vs soccer ─────────────────────────────────
  if (text === "football" || (text.includes("football") && !text.includes("flag"))) {
    const soccerCues = ["premier league", "la liga", "bundesliga", "futbol", "serie a", "champions league", "footballer"];
    const americanCues = ["nfl", "american", "gridiron", "touchdown", "quarterback", "super bowl"];
    if (soccerCues.some(c => text.includes(c))) {
      return mk(rawInput, text, "football", "soccer", undefined, 0.85, "contextual");
    }
    if (americanCues.some(c => text.includes(c))) {
      return mk(rawInput, text, "football", "football", undefined, 0.90, "contextual");
    }
    if (profileContains("soccer")) {
      return mk(rawInput, text, "football", "soccer", undefined, 0.80, "contextual");
    }
    if (profileContains("football")) {
      return mk(rawInput, text, "football", "football", undefined, 0.80, "contextual");
    }
    // Default: American football (US context)
    return mk(rawInput, text, "football", "football", undefined, 0.70, "ambiguous");
  }

  // ── "ball" — basketball vs football ─────────────────────────────────
  if (text === "ball") {
    if (profileContains("basketball")) {
      return mk(rawInput, text, "ball", "basketball", undefined, 0.72, "contextual");
    }
    if (profileContains("football")) {
      return mk(rawInput, text, "ball", "football", undefined, 0.70, "contextual");
    }
    return ambiguous(rawInput, text, "ball", ["basketball", "football"], candidateMatches);
  }

  // ── Fallback: pick highest-confidence candidate if they agree ────────
  const sorted = [...candidateMatches].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const sportIds = [...new Set(candidateMatches.map(c => c.canonicalSportId))];

  if (sportIds.length === 1) {
    // Multiple candidates but same canonicalSportId (multiple roles for one sport)
    return {
      rawInput,
      normalizedText: text,
      matchedAlias: top.matchedAlias,
      canonicalSportId: top.canonicalSportId,
      canonicalRoleId: top.canonicalRoleId,
      confidence: top.confidence,
      resolutionType: "alias",
    };
  }

  // If one candidate was matched by a multi-word phrase and all others by
  // shorter single-word sub-matches, the longer/more-specific match wins.
  const byMatchLength = [...candidateMatches].sort(
    (a, b) => b.matchedAlias.length - a.matchedAlias.length,
  );
  const longestMatch = byMatchLength[0];
  const longestWords = longestMatch.matchedAlias.split(" ").length;
  const allOthersShorter = byMatchLength
    .slice(1)
    .every(c => c.matchedAlias.split(" ").length < longestWords);

  if (longestWords >= 2 && allOthersShorter) {
    return {
      rawInput,
      normalizedText: text,
      matchedAlias: longestMatch.matchedAlias,
      canonicalSportId: longestMatch.canonicalSportId,
      canonicalRoleId: longestMatch.canonicalRoleId,
      confidence: Math.min(longestMatch.confidence, 0.87),
      resolutionType: "alias",
    };
  }

  return {
    rawInput,
    normalizedText: text,
    matchedAlias: top.matchedAlias,
    confidence: 0.4,
    ambiguity: sportIds,
    resolutionType: "ambiguous",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mk(
  rawInput: string,
  normalizedText: string,
  matchedAlias: string,
  canonicalSportId: string | undefined,
  canonicalRoleId: string | undefined,
  confidence: number,
  resolutionType: "alias" | "contextual" | "ambiguous",
): SportResolution {
  return { rawInput, normalizedText, matchedAlias, canonicalSportId, canonicalRoleId, confidence, resolutionType };
}

function ambiguous(
  rawInput: string,
  normalizedText: string,
  matchedAlias: string,
  ambiguity: string[],
  candidateMatches: SportResolutionCandidate[],
): SportResolution {
  return {
    rawInput,
    normalizedText,
    matchedAlias,
    confidence: 0.4,
    ambiguity,
    resolutionType: "ambiguous",
  };
}

// ─── Phrase Extraction from Chat ──────────────────────────────────────────────

export function extractSportMentionsFromText(input: {
  text: string;
  currentProfile?: {
    primarySport?: string | null;
    secondarySports?: string[] | null;
    positionOrRole?: string | null;
  };
}): SportResolution[] {
  const { text, currentProfile } = input;
  if (!text?.trim()) return [];

  const expanded = expandShorthand(text);
  const normalized = normalizeText(expanded);
  const words = normalized.split(" ");

  const results: SportResolution[] = [];
  const seen = new Set<string>();

  // Build phrase windows, longest first
  const phraseWindows: string[] = [normalized]; // full text first
  for (let len = Math.min(words.length, 4); len >= 1; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const phrase = words.slice(start, start + len).join(" ");
      if (!phraseWindows.includes(phrase)) phraseWindows.push(phrase);
    }
  }

  for (const phrase of phraseWindows) {
    const resolution = resolveSportLanguage({ text: phrase, currentProfile });
    if (resolution.resolutionType === "none") continue;
    if (!resolution.canonicalSportId && resolution.resolutionType !== "ambiguous") continue;

    const seenKey = resolution.canonicalRoleId ?? resolution.canonicalSportId ?? "ambiguous";
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);

    results.push(resolution);
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

export function getBestSportResolution(
  text: string,
  currentProfile?: {
    primarySport?: string | null;
    secondarySports?: string[] | null;
    positionOrRole?: string | null;
  },
): SportResolution | null {
  const mentions = extractSportMentionsFromText({ text, currentProfile });
  const best = mentions[0];
  if (!best || best.confidence < 0.6) return null;
  return best;
}

export function buildResolutionExplanation(resolution: SportResolution): string {
  if (resolution.resolutionType === "none") {
    return `I didn't recognize "${resolution.rawInput}" as a sport. You can tell me what sport you play and I'll tailor your program.`;
  }
  if (resolution.resolutionType === "ambiguous") {
    const candidates = resolution.ambiguity?.join(" and ") ?? "multiple sports";
    return `I found "${resolution.rawInput}" ambiguous between ${candidates}. Could you clarify which one you meant?`;
  }
  const displayName = getDisplayName(resolution.canonicalSportId);
  const contextNote = resolution.resolutionType === "contextual" ? " based on your current profile" : "";
  return `I interpreted "${resolution.rawInput}" as ${displayName}${contextNote}.`;
}

export function getDisplayName(canonicalSportId: string | undefined): string {
  if (!canonicalSportId) return "Unknown sport";
  const entry = SPORT_ALIAS_REGISTRY.find(e => e.canonicalSportId === canonicalSportId);
  return entry?.displayName ?? canonicalSportId.replace(/_/g, " ");
}

export function isValidSportId(id: string): boolean {
  if (!id) return false;
  return SPORT_ALIAS_REGISTRY.some(e => e.canonicalSportId === id);
}
