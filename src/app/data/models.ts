import { PriceRow } from '../prices/prices';

export interface Printing {
  id: string;
  label: string;
  note: string;
}

export interface CardStat {
  label: string;
  value: string;
}

/** Printed on the card; shown as sharp text because card scans top out at 430x600. */
export interface CardDetails {
  effect?: string;
  inherited?: string;
  extra?: string;
  /** Labelled in the game's own words, since "DP" and "Digi-type" mean nothing in another game. */
  stats?: CardStat[];
}

export interface CatalogCard {
  id: string;
  game: string;
  number: string;
  setCode: string;
  setName: string;
  /** A set symbol image, where the game's source has one. */
  setIcon?: string;
  name: string;
  type: string;
  color: string;
  rarity: string;
  image: string;
  /** A sharper scan for the full-card view, where the source has one. */
  imageLarge?: string;
  sortKey: string;
  printings: Printing[];
  details?: CardDetails;
}

export interface OwnedCard {
  id?: number;
  game: string;
  cardId: string;
  printingId: string;
  sortKey: string;
  addedAt: number;
}

export interface InstalledGame {
  id: string;
  cardCount: number;
  installedAt: number;
  pricesUpdatedAt?: number;
  pricedCards?: number;
  /** Set codes the user picked, for games too big to download whole. */
  sets?: string[];
}

export interface GameSet {
  code: string;
  name: string;
  releasedAt: string;
  cardCount: number;
  kind: string;
  /** A main release rather than a promo, token or oversized product. */
  main: boolean;
  icon?: string;
}

export interface FetchOptions {
  sets?: string[];
  onProgress?: (fraction: number) => void;
}

export interface CatalogDownload {
  cards: CatalogCard[];
  prices?: PriceRow[];
}

export interface GameDefinition {
  id: string;
  name: string;
  sources: string;
  fetchCatalog(options?: FetchOptions): Promise<CatalogCard[] | CatalogDownload>;
  /** Present when the catalog is downloaded set by set, from sets the user picks. */
  listSets?(): Promise<GameSet[]>;
  /** The set a scanned number comes from, when its printed code isn't the set's own code. */
  scanSet?(number: string): Promise<GameSet | undefined>;
  /** The catalog download carries prices too, so there's no separate price step. */
  pricesWithCatalog?: boolean;
  /** The game's key on worththerip.com, where prices come from. */
  priceGame?: string;
  /**
   * Reads Worth the Rip numbers that aren't shaped like "BT1-084 SR" (Pokémon's are "083/088", with the
   * set only in the file's name), given the installed cards to match them against.
   */
  priceNumberReader?(cards: CatalogCard[]): (raw: string, setName: string) => string | null;
  /** Fits a segment button; falls back to the full name. */
  shortName?: string;
  /** Possible card numbers in OCR text, most likely first; the scanner keeps the ones in the catalog. */
  scanCandidates(text: string): string[];
}

export const REGULAR_PRINTING = '';

export function ownedSortKey(card: CatalogCard, printingId: string): string {
  return `${card.sortKey}|${printingId}`;
}

export type RarityTier = 'common' | 'rare' | 'ultra';

/** Gold-edged rarities across the games (Digimon SR, Pokémon RR/IR, Magic rare/mythic...). */
const RARE = new Set('sr rr rh ir ace ar rad shr rare mythic'.split(' '));
/** Purple-edged chase rarities (secret, special illustration, hyper, ultimate...). */
const ULTRA = new Set('sec ur sir hr mhr sur utr scr qcsr cr ps pscr str gr gur pg'.split(' '));

export function rarityTier(card: Pick<CatalogCard, 'rarity'>): RarityTier {
  const rarity = card.rarity.toLowerCase();
  return ULTRA.has(rarity) ? 'ultra' : RARE.has(rarity) ? 'rare' : 'common';
}

/** Rarer cards get a warmer edge and, for the tiers, a shine; the classes live in global.scss. */
export function rarityClass(card: Pick<CatalogCard, 'rarity'>): string {
  const tier = rarityTier(card);
  return `r-${card.rarity.toLowerCase()}${tier === 'common' ? '' : ` tier-${tier}`}`;
}

export function printingLabel(card: CatalogCard, printingId: string): string {
  if (printingId === REGULAR_PRINTING) return 'Regular';
  return card.printings.find(p => p.id === printingId)?.label ?? printingId;
}
