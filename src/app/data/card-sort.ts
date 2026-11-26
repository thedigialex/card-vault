import { LibraryEntry } from './collection.service';
import { formatPrice } from '../prices/prices';
import { CatalogCard, rarityTier } from './models';

/** 'set' | 'name' | 'rarity' | 'color' | 'type' | 'price' | 'added' | `stat:<label>` */
export type SortId = string;

export interface SortOption {
  id: SortId;
  label: string;
}

export const DEFAULT_SORT: SortId = 'set';

const BASE_OPTIONS: SortOption[] = [
  { id: 'set', label: 'Set order' },
  { id: 'name', label: 'Name' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'color', label: 'Color / element' },
  { id: 'type', label: 'Type' },
  { id: 'price', label: 'Price' },
  { id: 'added', label: 'Recently added' },
];

const STAT = 'stat:';
/** "7000", "2/3" (power first) or "-1"; "{2}{U}" and "?" aren't numbers to sort on. */
const NUMERIC = /^\s*(-?\d+(?:\.\d+)?)\s*(?:\/.*)?$/;

export type PriceOf = (card: CatalogCard) => number | undefined;

export function statNumber(card: CatalogCard, label: string): number | undefined {
  const value = card.details?.stats?.find(stat => stat.label === label)?.value;
  const match = value?.match(NUMERIC);
  return match ? Number(match[1]) : undefined;
}

/** The fixed sorts plus every numeric stat (DP, ATK, HP, Power...) that any of these cards has. */
export function sortOptionsFor(cards: CatalogCard[]): SortOption[] {
  const stats: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    for (const stat of card.details?.stats ?? []) {
      if (seen.has(stat.label) || !NUMERIC.test(stat.value)) continue;
      seen.add(stat.label);
      stats.push(stat.label);
    }
  }
  return [...BASE_OPTIONS, ...stats.map(label => ({ id: STAT + label, label }))];
}

export function sortLabel(id: SortId | undefined): string {
  if (id?.startsWith(STAT)) return id.slice(STAT.length);
  return BASE_OPTIONS.find(option => option.id === id)?.label ?? BASE_OPTIONS[0].label;
}

/** Within the common tier, commons sit below uncommons, which sit below the rest (Digimon's R, promos). */
const LOW_RARITIES: Record<string, number> = { c: 0, common: 0, u: 1, uncommon: 1 };
const TIER_RANK = { common: 0, rare: 1, ultra: 2 };

export function rarityRank(card: Pick<CatalogCard, 'rarity'>): number {
  const sub = LOW_RARITIES[card.rarity.toLowerCase()] ?? 2;
  return TIER_RANK[rarityTier(card)] * 10 + sub;
}

const bySet = (a: LibraryEntry, b: LibraryEntry) =>
  a.owned.game.localeCompare(b.owned.game) || a.owned.sortKey.localeCompare(b.owned.sortKey);

/** Missing values always go last, whichever way the sort runs. */
function byNumber(value: (entry: LibraryEntry) => number | undefined) {
  return (a: LibraryEntry, b: LibraryEntry) => {
    const x = value(a);
    const y = value(b);
    if (x === y) return 0;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return y - x;
  };
}

function byText(value: (entry: LibraryEntry) => string) {
  return (a: LibraryEntry, b: LibraryEntry) => {
    const x = value(a).trim();
    const y = value(b).trim();
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return x.localeCompare(y);
  };
}

/** Big numbers first (rarer, pricier, stronger); words A to Z; ties keep set order. */
export function cardSorter(id: SortId | undefined, priceOf: PriceOf): (a: LibraryEntry, b: LibraryEntry) => number {
  const primary = primaryFor(id ?? DEFAULT_SORT, priceOf);
  return primary ? (a, b) => primary(a, b) || bySet(a, b) : bySet;
}

function primaryFor(id: SortId, priceOf: PriceOf): ((a: LibraryEntry, b: LibraryEntry) => number) | null {
  if (id.startsWith(STAT)) {
    const label = id.slice(STAT.length);
    return byNumber(entry => statNumber(entry.card, label));
  }
  switch (id) {
    case 'name':
      return byText(entry => entry.card.name);
    case 'rarity':
      return (a, b) => rarityRank(b.card) - rarityRank(a.card) || a.card.rarity.localeCompare(b.card.rarity);
    case 'color':
      return byText(entry => entry.card.color);
    case 'type':
      return byText(entry => entry.card.type);
    case 'price':
      return byNumber(entry => priceOf(entry.card));
    case 'added':
      return (a, b) => b.owned.addedAt - a.owned.addedAt;
    default:
      return null;
  }
}

export function sortEntries<T>(items: T[], id: SortId | undefined, priceOf: PriceOf, entryOf: (item: T) => LibraryEntry): T[] {
  const compare = cardSorter(id, priceOf);
  return [...items].sort((a, b) => compare(entryOf(a), entryOf(b)));
}

/** What a card shows for the active sort, for row headings like "SEC – R" or "DP 12000 – 3000". */
export function sortValue(id: SortId | undefined, card: CatalogCard, priceOf: PriceOf): string {
  if (id?.startsWith(STAT)) {
    const label = id.slice(STAT.length);
    const value = statNumber(card, label);
    return value === undefined ? '—' : `${label} ${value}`;
  }
  switch (id) {
    case 'name':
      return card.name;
    case 'rarity':
      return card.rarity || '—';
    case 'color':
      return card.color || '—';
    case 'type':
      return card.type || '—';
    case 'price': {
      const price = priceOf(card);
      return price === undefined ? 'No price' : formatPrice(price);
    }
    default:
      return card.number;
  }
}
