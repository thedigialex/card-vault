import { rarityRank } from '../data/card-sort';
import { CatalogCard, rarityTier } from '../data/models';

/** Roughly a real booster's card count per game; it's a toy, so close is good enough. */
const PACK_SIZES: Record<string, number> = { digimon: 12, pokemon: 10, mtg: 14, yugioh: 9, palworld: 10 };

export function packSize(gameId: string): number {
  return PACK_SIZES[gameId] ?? 10;
}

/** Odds that the last slot is a chase card, then a gold-tier one; otherwise it's the best common-tier card. */
export const ULTRA_ODDS = 0.1;
export const RARE_ODDS = 0.45;

type Random = () => number;

interface Bucket {
  rank: number;
  cards: CatalogCard[];
}

/**
 * A fake booster from one set, in reveal order: fillers first, the hit last. Fillers lean hard on the
 * lowest rarity, one slot is a step up, and the last slot rolls for a rare or better.
 */
export function openPack(cards: CatalogCard[], size: number, random: Random = Math.random): CatalogCard[] {
  if (!cards.length || size < 1) return [];
  const buckets = bucketsOf(cards);
  const common = buckets.filter(bucket => rarityTier(bucket.cards[0]) === 'common');
  const low = common.length ? common : buckets;
  const pulled = new Set<string>();
  const pack: CatalogCard[] = [];
  const take = (bucket: Bucket) => {
    pack.push(pick(bucket.cards, pulled, random));
  };

  for (let slot = 0; slot < Math.max(0, size - 2); slot++) take(weighted(low, random));
  if (size >= 2) take(low.length > 1 ? low[1 + Math.floor(random() * (low.length - 1))] : low[0]);
  take(hitBucket(buckets, low, random));

  return pack
    .map((card, index) => ({ card, index, rank: rarityRank(card) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.card);
}

function bucketsOf(cards: CatalogCard[]): Bucket[] {
  const byRank = new Map<number, CatalogCard[]>();
  for (const card of cards) {
    const rank = rarityRank(card);
    const bucket = byRank.get(rank);
    if (bucket) bucket.push(card);
    else byRank.set(rank, [card]);
  }
  return [...byRank].map(([rank, cards]) => ({ rank, cards })).sort((a, b) => a.rank - b.rank);
}

/** Each step up is a quarter as likely as the one below it. */
function weighted(buckets: Bucket[], random: Random): Bucket {
  const weights = buckets.map((_, index) => 0.25 ** index);
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < buckets.length; index++) {
    roll -= weights[index];
    if (roll < 0) return buckets[index];
  }
  return buckets[0];
}

function hitBucket(buckets: Bucket[], low: Bucket[], random: Random): Bucket {
  const ultra = buckets.filter(bucket => rarityTier(bucket.cards[0]) === 'ultra');
  const rare = buckets.filter(bucket => rarityTier(bucket.cards[0]) === 'rare');
  const roll = random();
  if (ultra.length && roll < ULTRA_ODDS) return ultra[Math.floor(random() * ultra.length)];
  if (rare.length && roll < RARE_ODDS) return rare[Math.floor(random() * rare.length)];
  return low.at(-1)!;
}

/** No repeats inside one pack unless the set is too small to avoid them. */
function pick(cards: CatalogCard[], pulled: Set<string>, random: Random): CatalogCard {
  const fresh = cards.filter(card => !pulled.has(card.id));
  const from = fresh.length ? fresh : cards;
  const card = from[Math.floor(random() * from.length)];
  pulled.add(card.id);
  return card;
}
