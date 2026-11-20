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
  /** The catalog download carries prices too, so there's no separate price step. */
  pricesWithCatalog?: boolean;
  /** The game's key on worththerip.com, where prices come from. */
  priceGame?: string;
  /** Fits a segment button; falls back to the full name. */
  shortName?: string;
  /** Possible card numbers in OCR text, most likely first; the scanner keeps the ones in the catalog. */
  scanCandidates(text: string): string[];
}

export const REGULAR_PRINTING = '';

export function ownedSortKey(card: CatalogCard, printingId: string): string {
  return `${card.sortKey}|${printingId}`;
}

/** Rarer cards get a warmer edge; the classes live in global.scss. */
export function rarityClass(card: Pick<CatalogCard, 'rarity'>): string {
  return `r-${card.rarity.toLowerCase()}`;
}

export function printingLabel(card: CatalogCard, printingId: string): string {
  if (printingId === REGULAR_PRINTING) return 'Regular';
  return card.printings.find(p => p.id === printingId)?.label ?? printingId;
}
