import { CardDetails, CardStat, CatalogCard, CatalogDownload, FetchOptions, GameDefinition, GameSet, Printing } from '../data/models';
import { PriceRow, PriceVariant, priceKey } from '../prices/prices';
import { asText, getJson, trimmed } from './card-codes';

const API = 'https://db.ygoprodeck.com/api/v7';
const SETS_URL = `${API}/cardsets.php`;
const SET_CARDS_URL = (name: string) => `${API}/cardinfo.php?cardset=${encodeURIComponent(name)}`;
/** YGOPRODeck blocks clients for an hour past 20 requests a second. */
const REQUEST_GAP_MS = 120;

/** Cheapest first: the plainest rarity in a set is the regular printing, the rest are printings of it. */
const RARITY_RANK = ['C', 'SP', 'SSP', 'NR', 'R', 'SR', 'UR', 'UTR', 'SCR', 'QCSR', 'CR', 'PS', 'PSCR', 'STR', 'GR'];

const SIDE_SET =
  /\b(tins?|promos?|prize|sneak peek|participation|championship|tournament|duelist league|mattel|gift|movie pack|special edition|deluxe edition|premiere|ots|magazine|book|video game|jump|shonen)\b/i;

export interface YgoSet {
  set_name: string;
  set_code: string;
  num_of_cards?: number;
  tcg_date?: string | null;
  set_image?: string | null;
}

export interface YgoCardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code?: string;
  set_price?: string;
}

export interface YgoCard {
  id: number;
  name: string;
  type?: string;
  humanReadableCardType?: string;
  frameType?: string;
  desc?: string;
  race?: string;
  atk?: number | null;
  def?: number | null;
  level?: number | null;
  scale?: number | null;
  linkval?: number | null;
  linkmarkers?: string[] | null;
  attribute?: string | null;
  archetype?: string | null;
  card_sets?: YgoCardSet[];
  card_images?: { image_url: string; image_url_small: string }[];
}

/** One code can cover several releases (tin waves, 25th-anniversary reprints), so sets merge by code. */
export interface MergedSet {
  code: string;
  names: string[];
  date: string;
  cardCount: number;
}

export function mergeSets(sets: YgoSet[]): MergedSet[] {
  const byCode = new Map<string, MergedSet>();
  const ordered = [...sets].sort((a, b) => (a.tcg_date ?? '9999').localeCompare(b.tcg_date ?? '9999'));
  for (const set of ordered) {
    const code = set.set_code.trim().toUpperCase();
    if (!code) continue;
    const merged = byCode.get(code);
    if (merged) {
      merged.names.push(set.set_name);
      merged.cardCount += set.num_of_cards ?? 0;
    } else {
      byCode.set(code, { code, names: [set.set_name], date: set.tcg_date ?? '', cardCount: set.num_of_cards ?? 0 });
    }
  }
  return [...byCode.values()];
}

/** "(UR)" -> "UR"; rarities without a code ("Quarter Century Secret Rare") use their initials. */
export function rarityCodeOf(entry: Pick<YgoCardSet, 'set_rarity' | 'set_rarity_code'>): string {
  const code = (entry.set_rarity_code ?? '').replace(/[()]/g, '').trim();
  if (code) return code;
  return entry.set_rarity
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .toUpperCase();
}

const rankOf = (code: string) => {
  const index = RARITY_RANK.indexOf(code.toUpperCase());
  return index < 0 ? RARITY_RANK.length : index;
};

/** "LOB-EN001" sorts on set, then region, then the digits. */
export function yugiohSortKey(number: string, date: string): string {
  const dash = number.indexOf('-');
  const set = dash < 0 ? number : number.slice(0, dash);
  const match = /^([A-Z]*)(\d+)(.*)$/.exec(number.slice(dash + 1));
  const tail = match ? `${match[1].padEnd(2, '_')}${match[2].padStart(4, '0')}${match[3]}` : number.slice(dash + 1);
  return `${date || '9999-99-99'}|${set.padEnd(8, '_')}|${tail}`;
}

function statsOf(card: YgoCard): CardStat[] {
  const frame = card.frameType ?? '';
  const levelLabel = frame.startsWith('xyz') ? 'Rank' : 'Level';
  const isMonster = !['spell', 'trap', 'skill', 'token'].includes(frame);
  return [
    { label: 'Card type', value: trimmed(card.humanReadableCardType ?? card.type) },
    { label: 'Attribute', value: trimmed(card.attribute) },
    { label: isMonster ? 'Type' : 'Property', value: trimmed(card.race) },
    { label: levelLabel, value: asText(card.level) },
    { label: 'Link', value: asText(card.linkval) },
    { label: 'ATK', value: isMonster ? asText(card.atk) : undefined },
    { label: 'DEF', value: isMonster && card.linkval == null ? asText(card.def) : undefined },
    { label: 'Pendulum scale', value: asText(card.scale) },
    { label: 'Link arrows', value: (card.linkmarkers ?? []).join(', ') || undefined },
    { label: 'Archetype', value: trimmed(card.archetype) },
  ].filter((stat): stat is CardStat => !!stat.value);
}

function detailsFrom(card: YgoCard): CardDetails {
  return { effect: trimmed(card.desc), stats: statsOf(card) };
}

interface Printed {
  card: YgoCard;
  number: string;
  entries: YgoCardSet[];
}

/** Every distinct printed code ("LOB-001", "LOB-E001", "LOB-EN001") is its own card; rarities are printings. */
function printedCards(cards: YgoCard[], codeOfName: Map<string, string>): Printed[] {
  const byNumber = new Map<string, Printed>();
  // A card reprinted in two picked sets comes back from both downloads.
  const unique = new Map(cards.map(card => [card.id, card]));
  for (const card of unique.values()) {
    for (const entry of card.card_sets ?? []) {
      if (!codeOfName.has(entry.set_name)) continue;
      const number = entry.set_code.trim().toUpperCase();
      const printed = byNumber.get(number) ?? { card, number, entries: [] };
      printed.entries.push(entry);
      byNumber.set(number, printed);
    }
  }
  for (const printed of byNumber.values()) {
    printed.entries.sort((a, b) => rankOf(rarityCodeOf(a)) - rankOf(rarityCodeOf(b)));
  }
  return [...byNumber.values()];
}

function printingsFrom(entries: YgoCardSet[]): Printing[] {
  const [regular, ...rest] = entries;
  const seen = new Set([rarityCodeOf(regular)]);
  const printings: Printing[] = [];
  for (const entry of rest) {
    let id = rarityCodeOf(entry);
    if (entry.set_name !== regular.set_name) id = `${id}·${entry.set_name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    printings.push({ id, label: entry.set_rarity, note: entry.set_name !== regular.set_name ? entry.set_name : '' });
  }
  return printings;
}

const dollars = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export function buildYugiohCatalog(cards: YgoCard[], sets: MergedSet[], updatedAt = Date.now()): CatalogDownload {
  const codeOfName = new Map<string, string>();
  const setOf = new Map<string, MergedSet>();
  for (const set of sets) {
    setOf.set(set.code, set);
    for (const name of set.names) codeOfName.set(name, set.code);
  }

  const catalog: CatalogCard[] = [];
  const prices: PriceRow[] = [];
  for (const { card, number, entries } of printedCards(cards, codeOfName)) {
    const setCode = codeOfName.get(entries[0].set_name)!;
    const set = setOf.get(setCode)!;
    const art = card.card_images?.[0];
    catalog.push({
      id: `yugioh:${number}`,
      game: 'yugioh',
      number,
      setCode,
      setName: `${setCode} · ${set.names[0]}`,
      name: card.name,
      type: card.humanReadableCardType ?? card.type ?? '',
      color: card.attribute ?? (card.frameType === 'spell' ? 'Spell' : card.frameType === 'trap' ? 'Trap' : ''),
      rarity: rarityCodeOf(entries[0]),
      image: art?.image_url_small ?? '',
      imageLarge: art?.image_url,
      sortKey: yugiohSortKey(number, set.date),
      printings: printingsFrom(entries),
      details: detailsFrom(card),
    });

    const regular = dollars(entries[0].set_price);
    const variants: PriceVariant[] = entries
      .slice(1)
      .map(entry => ({ label: entry.set_rarity, market: dollars(entry.set_price) }))
      .filter((variant): variant is PriceVariant => variant.market !== undefined);
    const market = regular ?? (variants.length ? Math.min(...variants.map(variant => variant.market)) : undefined);
    if (market !== undefined) {
      prices.push({
        key: priceKey('yugioh', number),
        game: 'yugioh',
        number,
        market,
        image: art?.image_url,
        variants: variants.sort((a, b) => b.market - a.market),
        updatedAt,
      });
    }
  }
  return { cards: catalog, prices };
}

export function toGameSet(set: MergedSet): GameSet {
  return {
    code: set.code,
    name: set.names.join(' / '),
    releasedAt: set.date,
    cardCount: set.cardCount,
    kind: '',
    main: !set.names.every(name => SIDE_SET.test(name)),
  };
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function allSets(): Promise<MergedSet[]> {
  return mergeSets(await getJson<YgoSet[]>(SETS_URL));
}

/** A set YGOPRODeck has no cards for answers 400 with an error body, which just means nothing to add. */
async function cardsOfSet(name: string): Promise<YgoCard[]> {
  const response = await fetch(SET_CARDS_URL(name));
  if (response.status === 400) return [];
  if (!response.ok) throw new Error(`YGOPRODeck answered ${response.status}`);
  return ((await response.json()) as { data?: YgoCard[] }).data ?? [];
}

/** Worth the Rip prints the same "RA01-EN079" the card does, with the rarity in the name instead. */
export function yugiohPriceNumber(raw: string): string | null {
  const code = raw.trim().split(/\s+/)[0]?.toUpperCase();
  return code && /^[A-Z0-9]+-[A-Z]*\d+[A-Z]?$/.test(code) ? code : null;
}

const AS_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', B: '8' };

/** The code sits under the art, right side: "LOB-EN001", older "LOB-001" or "LOB-E001". */
export function yugiohScanCandidates(text: string): string[] {
  const found = new Set<string>();
  const pattern = /(?:^|[^A-Z0-9])([A-Z0-9]{2,5})\s?[-–—~]\s?([A-Z]{0,2})([0-9OQDILSB|]{3})(?![0-9])/g;
  for (const [, set, region, raw] of text.toUpperCase().matchAll(pattern)) {
    const digits = [...raw].map(character => AS_DIGIT[character] ?? character).join('');
    if (!/^\d{3}$/.test(digits) || !/[A-Z]/.test(set)) continue;
    found.add(`${set}-${region}${digits}`);
    // OCR reads the letter O in a set code ("LOB") as a zero.
    if (set.includes('0')) found.add(`${set.replace(/0/g, 'O')}-${region}${digits}`);
  }
  return [...found];
}

export const yugioh: GameDefinition = {
  id: 'yugioh',
  name: 'Yu-Gi-Oh! TCG',
  shortName: 'Yu-Gi-Oh!',
  sources:
    'Card data and images from YGOPRODeck (images are saved on the phone the first time they show). Pick the sets you collect.',
  pricesWithCatalog: true,
  priceGame: 'yugioh',
  async listSets() {
    return (await allSets()).map(toGameSet);
  },
  async fetchCatalog(options: FetchOptions = {}): Promise<CatalogDownload> {
    const wanted = new Set((options.sets ?? []).map(code => code.toUpperCase()));
    const sets = (await allSets()).filter(set => wanted.has(set.code));
    const names = sets.flatMap(set => set.names);
    const cards: YgoCard[] = [];
    for (const [index, name] of names.entries()) {
      cards.push(...(await cardsOfSet(name)));
      options.onProgress?.((index + 1) / names.length);
      await pause(REQUEST_GAP_MS);
    }
    return buildYugiohCatalog(cards, sets);
  },
  priceNumberReader: () => yugiohPriceNumber,
  scanCandidates: yugiohScanCandidates,
};
