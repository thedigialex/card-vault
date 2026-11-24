import { CatalogCard } from '../data/models';

const MIN_LENGTH = 5;
const PREFIX = 3;

/** Lowercase letters and digits only, so dashes, accents and stray marks don't matter. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Lines to try: each line, each pair of neighbouring lines (names can wrap), and each without a stray end token. */
function phrasesOf(text: string): string[] {
  const lines = text.split(/\r?\n/).map(normalizeName).filter(Boolean);
  const phrases = new Set<string>();
  const add = (phrase: string) => {
    if (phrase.length < MIN_LENGTH) return;
    phrases.add(phrase);
    const words = phrase.split(' ');
    // OCR often reads a nearby icon as a letter or two either side of the name.
    if (words.length > 2 && words.at(-1)!.length <= 2) phrases.add(words.slice(0, -1).join(' '));
    if (words.length > 2 && words[0].length <= 2) phrases.add(words.slice(1).join(' '));
  };
  lines.forEach((line, i) => {
    add(line);
    if (i + 1 < lines.length) add(`${line} ${lines[i + 1]}`);
  });
  return [...phrases];
}

/** How strongly the text points at this card: its set code counts double, its collector number once. */
function clueScore(card: CatalogCard, tokens: Set<string>): number {
  const dash = card.number.lastIndexOf('-');
  const codes = [card.setCode, card.number.slice(0, Math.max(dash, 0))].map(code => code.toUpperCase());
  const collector = card.number.slice(dash + 1).toUpperCase();
  const digits = /\d+$/.exec(collector)?.[0] ?? '';
  let score = codes.some(code => code.length >= 2 && tokens.has(code)) ? 2 : 0;
  // Three digits or more ("084"), so an HP or power value can't pass for a collector number.
  if ((collector.length >= 3 && tokens.has(collector)) || (digits.length >= 3 && tokens.has(digits))) score += 1;
  return score;
}

/**
 * Of the cards sharing a name, the ones whose set code or collector number also shows in the text;
 * all of them when nothing on the card tells them apart.
 */
export function narrowByClues(text: string, cards: CatalogCard[]): CatalogCard[] {
  if (cards.length < 2) return cards;
  const tokens = new Set(text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean));
  const scored = cards.map(card => ({ card, score: clueScore(card, tokens) }));
  const best = Math.max(...scored.map(row => row.score));
  return best ? scored.filter(row => row.score === best).map(row => row.card) : cards;
}

/** Finds cards by their printed name, for cards whose number is too small for the camera. */
export class NameIndex {
  private readonly exact = new Map<string, CatalogCard[]>();
  private readonly buckets = new Map<string, string[]>();

  constructor(cards: CatalogCard[]) {
    for (const card of cards) {
      const name = normalizeName(card.name);
      if (name.length < MIN_LENGTH) continue;
      const list = this.exact.get(name);
      if (list) {
        list.push(card);
        continue;
      }
      this.exact.set(name, [card]);
      const key = name.slice(0, PREFIX);
      const bucket = this.buckets.get(key) ?? [];
      bucket.push(name);
      this.buckets.set(key, bucket);
    }
    for (const list of this.exact.values()) list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  /** Every card with the best-matching name, in catalog order; empty when no line looks like a name. */
  find(text: string): CatalogCard[] {
    let best: { name: string; distance: number } | null = null;
    for (const phrase of phrasesOf(text)) {
      if (this.exact.has(phrase)) {
        if (!best || best.distance > 0 || phrase.length > best.name.length) best = { name: phrase, distance: 0 };
        continue;
      }
      // Short names must be read exactly; longer ones may have a few misread letters.
      const limit = Math.floor(phrase.length / 8);
      if (!limit || (best && best.distance === 0)) continue;
      for (const name of this.buckets.get(phrase.slice(0, PREFIX)) ?? []) {
        const distance = editDistance(phrase, name, limit);
        if (distance <= limit && (!best || distance < best.distance || (distance === best.distance && name.length > best.name.length))) {
          best = { name, distance };
        }
      }
    }
    return best ? this.exact.get(best.name)! : [];
  }
}
