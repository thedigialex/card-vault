import { CardDetails, CardStat, CatalogCard, CatalogDownload, FetchOptions, GameDefinition, GameSet } from '../data/models';
import { PriceRow, PriceVariant, priceKey } from '../prices/prices';
import { getJson, trimmed } from './card-codes';

const API = 'https://api.scryfall.com';
const SETS_URL = `${API}/sets`;
const SET_CARDS_URL = (code: string) =>
  `${API}/cards/search?q=${encodeURIComponent(`e:${code}`)}&unique=prints&order=set&include_variations=true`;
/** Scryfall asks for 50-100ms between requests. */
const REQUEST_GAP_MS = 110;

/** Sets a collector would open packs of; everything else (promos, tokens, oversized...) is behind "All sets". */
export const MAIN_SET_KINDS = new Set([
  'core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter', 'funny', 'duel_deck', 'eternal',
]);
const SKIPPED_SET_KINDS = new Set(['memorabilia', 'minigame', 'vanguard', 'alchemy', 'treasure_chest']);

const COLOUR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

interface ImageUris {
  normal?: string;
  large?: string;
  grid?: string;
  display?: string;
}

export interface ScryfallSet {
  code: string;
  name: string;
  released_at?: string | null;
  set_type: string;
  card_count: number;
  digital: boolean;
  icon_svg_uri?: string | null;
}

interface ScryfallFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  image_uris?: ImageUris;
}

export interface ScryfallCard extends ScryfallFace {
  set: string;
  set_name: string;
  collector_number: string;
  released_at?: string;
  rarity: string;
  artist?: string;
  finishes?: string[];
  card_faces?: ScryfallFace[];
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
}

interface SearchPage {
  data: ScryfallCard[];
  has_more?: boolean;
  next_page?: string;
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function magicNumber(set: string, collector: string): string {
  return `${set.toUpperCase()}-${collector}`;
}

/** Collector numbers mix digits with letters and stars ("12a", "★3", "S1"), so sort on the digits first. */
export function collectorKey(collector: string): string {
  const match = /^(\D*)(\d+)(.*)$/.exec(collector);
  if (!match) return `99999${collector}`;
  const [, prefix, digits, suffix] = match;
  return `${digits.padStart(5, '0')}${prefix}${suffix}`;
}

export function magicSortKey(card: Pick<ScryfallCard, 'set' | 'collector_number'>, released: string): string {
  return `${released || '9999-99-99'}|${card.set.toUpperCase().padEnd(6, '_')}|${collectorKey(card.collector_number)}`;
}

function images(card: ScryfallCard): ImageUris {
  return card.image_uris ?? card.card_faces?.[0]?.image_uris ?? {};
}

function faces(card: ScryfallCard): ScryfallFace[] {
  return card.card_faces?.length ? card.card_faces : [card];
}

function colourOf(card: ScryfallCard): string {
  const codes = card.colors ?? card.card_faces?.[0]?.colors ?? [];
  return codes.map(code => COLOUR_NAMES[code] ?? code).join(' / ') || 'Colourless';
}

function detailsFrom(card: ScryfallCard): CardDetails {
  const sides = faces(card);
  const front = sides[0];
  const pt = front.power !== undefined ? `${front.power}/${front.toughness}` : undefined;
  const stats = [
    { label: 'Mana cost', value: sides.map(side => side.mana_cost).filter(Boolean).join(' // ') || undefined },
    { label: 'Type', value: trimmed(card.type_line) ?? trimmed(front.type_line) },
    { label: 'Colour', value: colourOf(card) },
    { label: 'Power/Toughness', value: pt },
    { label: 'Loyalty', value: trimmed(front.loyalty) },
    { label: 'Defense', value: trimmed(front.defense) },
    { label: 'Artist', value: trimmed(card.artist) },
  ].filter((stat): stat is CardStat => !!stat.value);

  const effect =
    sides.length > 1
      ? sides.map(side => `${side.name}\n${side.oracle_text ?? ''}`.trim()).join('\n\n')
      : card.oracle_text;
  const flavour = sides.map(side => side.flavor_text).filter(Boolean).join('\n\n');
  return { effect: trimmed(effect), extra: trimmed(flavour), stats };
}

export function buildMagicCatalog(cards: ScryfallCard[], sets: Map<string, ScryfallSet>): CatalogCard[] {
  return cards.map(card => {
    const set = sets.get(card.set);
    const setCode = card.set.toUpperCase();
    const number = magicNumber(card.set, card.collector_number);
    const finishes = card.finishes ?? [];
    const art = images(card);
    return {
      id: `mtg:${number}`,
      game: 'mtg',
      number,
      setCode,
      setName: `${setCode} · ${card.set_name}`,
      setIcon: set?.icon_svg_uri ?? undefined,
      name: card.name,
      type: card.type_line ?? faces(card)[0].type_line ?? '',
      color: colourOf(card),
      rarity: card.rarity.toUpperCase(),
      image: art.grid ?? art.normal ?? '',
      sortKey: magicSortKey(card, set?.released_at ?? card.released_at ?? ''),
      printings: [
        ...(finishes.includes('foil') && finishes.includes('nonfoil') ? [{ id: 'foil', label: 'Foil', note: '' }] : []),
        ...(finishes.includes('etched') ? [{ id: 'etched', label: 'Foil-etched', note: '' }] : []),
      ],
      details: detailsFrom(card),
    };
  });
}

const dollars = (value: string | null | undefined): number | undefined => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Scryfall carries TCGplayer market prices on every card, so Magic needs no second price download. */
export function magicPrices(cards: ScryfallCard[], updatedAt: number): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const card of cards) {
    const usd = dollars(card.prices?.usd);
    const variants: PriceVariant[] = [];
    const foil = dollars(card.prices?.usd_foil);
    const etched = dollars(card.prices?.usd_etched);
    if (foil !== undefined && usd !== undefined) variants.push({ label: 'Foil', market: foil });
    if (etched !== undefined) variants.push({ label: 'Foil-etched', market: etched });
    const market = usd ?? foil ?? etched;
    if (market === undefined) continue;
    const number = magicNumber(card.set, card.collector_number);
    const art = images(card);
    rows.push({
      key: priceKey('mtg', number),
      game: 'mtg',
      number,
      market,
      image: art.display ?? art.large,
      variants,
      updatedAt,
    });
  }
  return rows;
}

export function toGameSet(set: ScryfallSet): GameSet {
  return {
    code: set.code,
    name: set.name,
    releasedAt: set.released_at ?? '',
    cardCount: set.card_count,
    kind: set.set_type,
    main: MAIN_SET_KINDS.has(set.set_type),
    icon: set.icon_svg_uri ?? undefined,
  };
}

async function paperSets(): Promise<ScryfallSet[]> {
  const sets = (await getJson<{ data: ScryfallSet[] }>(SETS_URL)).data ?? [];
  return sets.filter(set => !set.digital && set.card_count > 0 && !SKIPPED_SET_KINDS.has(set.set_type));
}

/** A set with no paper cards answers 404, which just means "nothing to add". */
async function cardsOfSet(code: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | undefined = SET_CARDS_URL(code);
  while (url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const page = (await response.json()) as SearchPage;
    cards.push(...page.data);
    url = page.has_more ? page.next_page : undefined;
    await pause(REQUEST_GAP_MS);
  }
  return cards;
}

/** Card numbers sit bottom-left: "0123 R" or "123/302 R" above "NEO • EN". */
export function magicScanCandidates(text: string): string[] {
  const upper = text.toUpperCase();
  const sets = new Set<string>();
  for (const [, code] of upper.matchAll(/(?:^|[^A-Z0-9])([A-Z0-9]{3,5})\s*[•·*.+-]?\s*(?:EN|ES|FR|DE|IT|PT|JA|JP|KO|RU|ZHS|ZHT|PH)(?![A-Z])/g)) {
    if (/[A-Z]/.test(code)) sets.add(code);
  }
  const numbers = new Set<string>();
  const digitsOf = (raw: string) => raw.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1');
  for (const [, raw] of upper.matchAll(/(?:^|[^A-Z0-9])([0-9OQDIL|]{1,4})\s*\/\s*[0-9OIL]{1,4}/g)) numbers.add(digitsOf(raw));
  for (const [, raw] of upper.matchAll(/(?:^|[^A-Z0-9/])([0-9OQDIL|]{3,4})\s+[CURMSLTP](?![A-Z])/g)) numbers.add(digitsOf(raw));

  const found: string[] = [];
  for (const code of sets) {
    for (const raw of numbers) {
      if (!/^\d+$/.test(raw)) continue;
      found.push(magicNumber(code, String(Number(raw))));
    }
  }
  return found;
}

export const magic: GameDefinition = {
  id: 'mtg',
  name: 'Magic: The Gathering',
  shortName: 'Magic',
  sources: 'Card data, images and prices from Scryfall. Magic has 100k+ printings, so pick the sets you collect.',
  pricesWithCatalog: true,
  async listSets() {
    return (await paperSets()).map(toGameSet);
  },
  async fetchCatalog(options: FetchOptions = {}): Promise<CatalogDownload> {
    const wanted = new Set(options.sets ?? []);
    const sets = new Map((await paperSets()).map(set => [set.code, set]));
    const codes = [...wanted].filter(code => sets.has(code));
    const raw: ScryfallCard[] = [];
    for (const [index, code] of codes.entries()) {
      raw.push(...(await cardsOfSet(code)));
      options.onProgress?.((index + 1) / codes.length);
    }
    return { cards: buildMagicCatalog(raw, sets), prices: magicPrices(raw, Date.now()) };
  },
  scanCandidates: magicScanCandidates,
};
