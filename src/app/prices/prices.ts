export interface PriceVariant {
  label: string;
  market: number;
  image?: string;
}

export interface PriceRow {
  key: string;
  game: string;
  number: string;
  /** The plain printing's market price in USD, or the cheapest one when every entry is a variant. */
  market: number;
  /** The regular printing's scan (430x600), larger than the catalog's own image. */
  image?: string;
  variants: PriceVariant[];
  updatedAt: number;
}

export interface RipCard {
  name: string;
  number?: string;
  rarity?: string;
  marketPrice?: number | null;
  imageLarge?: string;
}

export function priceKey(game: string, number: string): string {
  return `${game}:${number}`;
}

/** Worth the Rip writes "BT1-084 SR"; the rarity suffix isn't part of the card number. */
export function numberOf(raw: string | undefined): string | null {
  const code = (raw ?? '').trim().split(/\s+/)[0]?.toUpperCase();
  return code && /^[A-Z]+\d*-\d+$/.test(code) ? code : null;
}

/** Variants carry their difference in brackets: "Upamon (Winner Pack Dimensional Phase)". */
export function variantLabel(name: string): string | null {
  const match = /\(([^)]+)\)\s*$/.exec(name.trim());
  return match ? match[1] : null;
}

export function foldPrices(game: string, cards: RipCard[], updatedAt: number): PriceRow[] {
  const rows = new Map<string, PriceRow>();
  for (const card of cards) {
    const number = numberOf(card.number);
    const market = card.marketPrice;
    if (!number || typeof market !== 'number') continue;
    const row = rows.get(number) ?? {
      key: priceKey(game, number),
      game,
      number,
      market: Number.POSITIVE_INFINITY,
      variants: [],
      updatedAt,
    };
    const label = variantLabel(card.name);
    if (label) {
      row.variants.push({ label, market, image: card.imageLarge });
    } else {
      if (market <= row.market) row.image = card.imageLarge;
      row.market = Math.min(row.market, market);
    }
    rows.set(number, row);
  }
  for (const row of rows.values()) {
    if (row.market === Number.POSITIVE_INFINITY) {
      row.market = Math.min(...row.variants.map(variant => variant.market));
    }
    row.variants.sort((a, b) => b.market - a.market);
  }
  return [...rows.values()];
}

export function formatPrice(value: number | undefined | null): string {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : '—';
}

/** Cards with no price simply don't count towards the total. */
export function totalValue(keys: string[], prices: Map<string, number>): number {
  return keys.reduce((sum, key) => sum + (prices.get(key) ?? 0), 0);
}
