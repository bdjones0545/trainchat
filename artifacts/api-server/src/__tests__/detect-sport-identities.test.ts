import { describe, it, expect } from "vitest";
import { detectSport } from "../lib/intent";

const cases: [string, string][] = [
  ["i am a golfer give me a 3 day program", "golf"],
  ["i am a volleyball player", "volleyball"],
  ["i am a footballer build me a plan", "soccer"],
  ["i play pickleball 4 times a week", "pickleball"],
  ["i am a lacrosse player", "lacrosse"],
  ["i am a rower looking to get stronger", "rowing"],
  ["i am a cyclist", "cycling"],
  ["i am a rugby player", "rugby"],
  ["i am a cricketer", "cricket"],
  ["i am a badminton player", "badminton"],
  ["i am a wrestler", "combat_sports"],
  ["i am a boxer", "combat_sports"],
  ["i play padel", "tennis"],
  ["i am a hooper", "basketball"],
  ["i swim competitively", "swimming"],
  ["i am a soccer player", "soccer"],
  ["i am a baseball player", "baseball"],
  ["i am a softball player", "baseball"],
  ["i play lacrosse in college", "lacrosse"],
  ["i am a lax player", "lacrosse"],
  ["build me a 3 day program i am a golfer", "golf"],
  ["i play mma and need a strength plan", "combat_sports"],
  ["i am a tennis player", "tennis"],
  ["i am a hockey player", "hockey"],
  ["build me a plan for a pickleball player", "pickleball"],
];

describe("detectSport — identity words and player nouns", () => {
  for (const [msg, expected] of cases) {
    it(`"${msg}" → ${expected}`, () => {
      expect(detectSport(msg.toLowerCase())).toBe(expected);
    });
  }
});
