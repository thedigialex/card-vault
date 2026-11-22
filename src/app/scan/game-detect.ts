/** Words each game prints in big, clear type, worth more the less likely another game prints them. */
const SIGNS: Record<string, [RegExp, number][]> = {
  mtg: [
    [/WIZARDS OF THE COAST/, 4],
    [/(?:^|[^A-Z0-9])[A-Z0-9]{3,5}\s*[•·*]\s*EN(?![A-Z])/, 3],
    [/\b(?:CREATURE|INSTANT|SORCERY|ENCHANTMENT|ARTIFACT|PLANESWALKER|LAND|BATTLE)\s*[—–-]/, 3],
    [/\b(?:INSTANT|SORCERY)\b/, 2],
    [/\bLEGENDARY\b/, 1],
    [/\bFLYING\b|\bTRAMPLE\b|\bHASTE\b|\bVIGILANCE\b/, 1],
  ],
  pokemon: [
    [/\bWEAKNESS\b/, 4],
    [/\bRETREAT\b/, 4],
    [/\bRESISTANCE\b/, 3],
    [/POK[EÉ]MON/, 2],
    [/NINTENDO|GAME ?FREAK/, 3],
    [/\bHP ?\d{2,3}\b|\b\d{2,3} ?HP\b/, 2],
    [/\bSTAGE ?[12]\b/, 2],
    [/\bTRAINER\b|\bSUPPORTER\b/, 1],
  ],
  yugioh: [
    [/KONAMI/, 4],
    [/\bATK ?\/|\bDEF ?\//, 4],
    [/\[ ?(?:SPELL|TRAP) CARD/, 4],
    [/\b(?:SPELL|TRAP) CARD\b/, 2],
    [/\/ ?EFFECT ?\]|\[ ?[A-Z-]+ ?\/ ?[A-Z]+ ?\]/, 2],
    [/\bLINK-\d\b/, 2],
  ],
  digimon: [
    [/BANDAI/, 4],
    [/DIGIVOLV/, 4],
    [/\[ ?(?:ON PLAY|WHEN DIGIVOLVING|WHEN ATTACKING|ON DELETION|YOUR TURN|OPPONENT'S TURN|MAIN|SECURITY) ?\]/, 3],
    [/INHERITED EFFECT|\bINHERIT/, 3],
    [/\bDIGI-?EGG\b|\bDIGITAMA\b|\bDIGIMON\b/, 2],
    [/\bLV\.? ?\d\b/, 1],
    [/\bDP\b/, 1],
  ],
  palworld: [
    [/PALWORLD/, 4],
    [/POCKETPAIR/, 4],
    [/\bLUCKY PAL\b/, 3],
    [/\bSTRIKE\b/, 2],
    [/\b(?:KINDLING|WATERING|PLANTING|HANDIWORK|MINING|LUMBERING|TRANSPORTING|COOLING|FARMING|GATHERING)\b/, 1],
    [/\bPOWER\b/, 1],
  ],
};

/** Each game's score for one frame of OCR text; games with no signs at all are left out. */
export function scoreGames(text: string): Map<string, number> {
  const upper = text.toUpperCase();
  const scores = new Map<string, number>();
  for (const [game, signs] of Object.entries(SIGNS)) {
    const score = signs.reduce((sum, [pattern, weight]) => sum + (pattern.test(upper) ? weight : 0), 0);
    if (score) scores.set(game, score);
  }
  return scores;
}

const DECAY = 0.75;
const CONFIDENT = 4;
const MARGIN = 1.5;

/**
 * Builds confidence over a few frames rather than trusting one, and keeps the last game it was sure
 * of while the camera sees nothing: people scan a stack of one game, so the answer rarely changes.
 */
export class GameVote {
  private readonly totals = new Map<string, number>();
  private current: string | null = null;

  get leader(): string | null {
    return this.current;
  }

  add(text: string): string | null {
    const scores = scoreGames(text);
    if (!scores.size) return this.current;
    for (const [game, total] of this.totals) this.totals.set(game, total * DECAY);
    for (const [game, score] of scores) this.totals.set(game, (this.totals.get(game) ?? 0) + score);

    const [best, second] = [...this.totals].sort((a, b) => b[1] - a[1]);
    if (best && best[1] >= CONFIDENT && (!second || best[1] >= second[1] * MARGIN)) this.current = best[0];
    return this.current;
  }

  reset(): void {
    this.totals.clear();
    this.current = null;
  }
}
