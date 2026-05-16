/**
 * Social/export label formatter for exercise names.
 * Share cards show concise labels; detailed names stay inside the app.
 */

const ABBREVIATIONS: [RegExp, string][] = [
  [/rear[\s-]?foot[\s-]?elevated[\s-]?split[\s-]?squat/i, "RFESS"],
  [/single[\s-]?leg[\s-]?romanian[\s-]?deadlift/i, "SL-RDL"],
  [/single[\s-]?leg[\s-]?rdl/i, "SL-RDL"],
  [/romanian[\s-]?deadlift/i, "RDL"],
  [/glute[\s-]?ham[\s-]?raise/i, "GHR"],
  [/nordic[\s-]?(curl|hamstring[\s-]?curl)/i, "Nordic Curl"],
  [/reverse[\s-]?nordic/i, "Reverse Nordic"],
  [/copenhagen[\s-]?(plank|adductor)/i, "Copenhagen"],
  [/dumbbell[\s-]?romanian[\s-]?deadlift/i, "DB RDL"],
  [/barbell[\s-]?romanian[\s-]?deadlift/i, "BB RDL"],
  [/trap[\s-]?bar[\s-]?deadlift/i, "Trap Bar DL"],
  [/hex[\s-]?bar[\s-]?deadlift/i, "Hex Bar DL"],
  [/sumo[\s-]?deadlift/i, "Sumo DL"],
  [/conventional[\s-]?deadlift/i, "Conventional DL"],
  [/romanian[\s-]?deadlift/i, "RDL"],
  [/deficit[\s-]?deadlift/i, "Deficit DL"],
  [/rack[\s-]?pull/i, "Rack Pull"],
  [/box[\s-]?squat/i, "Box Squat"],
  [/front[\s-]?squat/i, "Front Squat"],
  [/goblet[\s-]?squat/i, "Goblet Squat"],
  [/bulgarian[\s-]?split[\s-]?squat/i, "Bulgarian SS"],
  [/split[\s-]?squat/i, "Split Squat"],
  [/step[\s-]?up/i, "Step-Up"],
  [/hip[\s-]?thrust/i, "Hip Thrust"],
  [/glute[\s-]?bridge/i, "Glute Bridge"],
  [/single[\s-]?leg[\s-]?hip[\s-]?thrust/i, "SL Hip Thrust"],
  [/chest[\s-]?supported[\s-]?row/i, "Chest-Sup Row"],
  [/bent[\s-]?over[\s-]?row/i, "Bent-Over Row"],
  [/pendlay[\s-]?row/i, "Pendlay Row"],
  [/seal[\s-]?row/i, "Seal Row"],
  [/cable[\s-]?row/i, "Cable Row"],
  [/lat[\s-]?pulldown/i, "Lat Pulldown"],
  [/pull[\s-]?up/i, "Pull-Up"],
  [/chin[\s-]?up/i, "Chin-Up"],
  [/incline[\s-]?bench[\s-]?press/i, "Incline Press"],
  [/decline[\s-]?bench[\s-]?press/i, "Decline Press"],
  [/overhead[\s-]?press/i, "OHP"],
  [/military[\s-]?press/i, "Military Press"],
  [/landmine[\s-]?press/i, "Landmine Press"],
  [/face[\s-]?pull/i, "Face Pull"],
  [/band[\s-]?pull[\s-]?apart/i, "Band Pull-Apart"],
  [/external[\s-]?rotation/i, "External Rot."],
  [/farmers[\s']?[\s]?carry/i, "Farmer Carry"],
  [/suitcase[\s-]?carry/i, "Suitcase Carry"],
  [/prowler[\s-]?push/i, "Prowler Push"],
  [/sled[\s-]?push/i, "Sled Push"],
  [/sled[\s-]?pull/i, "Sled Pull"],
  [/power[\s-]?clean/i, "Power Clean"],
  [/hang[\s-]?clean/i, "Hang Clean"],
  [/hang[\s-]?snatch/i, "Hang Snatch"],
  [/push[\s-]?press/i, "Push Press"],
];

/**
 * Returns a concise social-safe label for an exercise name.
 * Strips parenthetical setup details, applies common abbreviations,
 * and hard-truncates anything still over the safe character limit.
 */
export function formatExerciseForShareCard(name: string): string {
  if (!name) return name;

  // 1. Try known abbreviations first (before stripping anything)
  for (const [pattern, abbr] of ABBREVIATIONS) {
    if (pattern.test(name)) return abbr;
  }

  // 2. Strip parenthetical content — e.g. "(squat-mode, low handles)"
  let cleaned = name.replace(/\s*\([^)]*\)/g, "").trim();

  // 3. Strip inline variant suffixes after em-dash or colon
  //    e.g. "Box Squat – paused" → "Box Squat"
  cleaned = cleaned.replace(/\s*[–—:]\s*.+$/, "").trim();

  // 4. Strip leading modality prefix (e.g. "Barbell ", "Dumbbell ", "DB ", "BB ", "KB ")
  //    only when the remaining name is still recognizable without it
  cleaned = cleaned.replace(/^(barbell|dumbbell|kettlebell|cable|machine)\s+/i, (m, g) => {
    const rest = cleaned.slice(m.length).trim();
    return rest.length >= 4 ? "" : m;
  });

  // 5. Hard truncate at 26 chars with ellipsis
  if (cleaned.length > 26) {
    cleaned = cleaned.slice(0, 24).trimEnd() + "…";
  }

  return cleaned || name;
}
