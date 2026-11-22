import { CardDetails, CardStat, CatalogCard, FetchOptions, GameDefinition, GameSet, Printing } from '../data/models';
import { asText, getJson, trimmed } from './card-codes';
import { collectorKey } from './magic';

const API = 'https://api.tcgdex.net/v2';
const GRAPHQL = `${API}/graphql`;
const SET_URL = (id: string) => `${API}/en/sets/${encodeURIComponent(id)}`;
/** TCGdex's GraphQL caps a page at 100 cards. */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
/** Pokémon TCG Pocket is a phone game; its "sets" have no paper cards. */
const DIGITAL_SERIES = new Set(['tcgp']);
const SIDE_SERIES = new Set(['tk', 'mc', 'misc', 'pop']);

/** Short tags for tiles and rarity glows; anything unlisted falls back to its initials. */
const RARITY_CODES: Record<string, string> = {
  common: 'C',
  uncommon: 'U',
  rare: 'R',
  'rare holo': 'RH',
  'double rare': 'RR',
  'ultra rare': 'UR',
  'illustration rare': 'IR',
  'special illustration rare': 'SIR',
  'hyper rare': 'HR',
  'mega hyper rare': 'MHR',
  'shiny rare': 'SHR',
  'shiny ultra rare': 'SUR',
  'ace spec rare': 'ACE',
  'secret rare': 'SEC',
  'amazing rare': 'AR',
  'radiant rare': 'RAD',
  none: '',
};

export interface DexSet {
  id: string;
  name: string;
  releaseDate?: string | null;
  cardCount?: { total?: number; official?: number } | null;
  serie?: { id: string; name: string } | null;
}

interface DexSetDetail {
  id: string;
  abbreviation?: { official?: string | null } | null;
}

interface DexAttack {
  name: string;
  cost?: string[] | null;
  damage?: string | number | null;
  effect?: string | null;
}

export interface DexCard {
  id: string;
  localId: string;
  name: string;
  rarity?: string | null;
  category?: string | null;
  hp?: number | null;
  types?: string[] | null;
  stage?: string | null;
  illustrator?: string | null;
  image?: string | null;
  regulationMark?: string | null;
  trainerType?: string | null;
  energyType?: string | null;
  effect?: string | null;
  attacks?: DexAttack[] | null;
  abilities?: { name: string; effect?: string | null; type?: string | null }[] | null;
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean } | null;
  set?: { id: string } | null;
}

/** What the set prints next to the card number ("SVI EN 025/198"), and the set's details. */
export interface PokemonSetInfo extends DexSet {
  code?: string;
}

const CARD_FIELDS = `id localId name rarity category hp types stage illustrator image regulationMark trainerType
  energyType effect attacks { name cost damage effect } abilities { name effect type }
  variants { normal reverse holo firstEdition } set { id }`;

export function rarityCode(rarity: string | null | undefined): string {
  const words = (rarity ?? '').trim().toLowerCase();
  if (words in RARITY_CODES) return RARITY_CODES[words];
  return words
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Printed numbers are three digits ("025/198"); older sets' "1/102" reads the same once padded. */
export function padNumber(localId: string): string {
  return /^\d+$/.test(localId) ? localId.padStart(3, '0') : localId.toUpperCase();
}

export function pokemonNumber(set: PokemonSetInfo, localId: string): string {
  return `${(set.code ?? set.id).toUpperCase()}-${padNumber(localId)}`;
}

function costText(cost: string[] | null | undefined): string {
  return (cost ?? []).map(type => (type === 'Colorless' ? 'C' : type[0])).join('');
}

function detailsFrom(card: DexCard): CardDetails {
  const stats = [
    { label: 'Category', value: [card.category, card.stage ?? card.trainerType ?? card.energyType].filter(Boolean).join(' · ') || undefined },
    { label: 'HP', value: asText(card.hp) },
    { label: 'Type', value: (card.types ?? []).join(' / ') || undefined },
    { label: 'Regulation', value: trimmed(card.regulationMark) },
    { label: 'Rarity', value: trimmed(card.rarity) },
    { label: 'Illustrator', value: trimmed(card.illustrator) },
  ].filter((stat): stat is CardStat => !!stat.value);

  const lines = [
    ...(card.abilities ?? []).map(ability => `${ability.type ?? 'Ability'}: ${ability.name}\n${ability.effect ?? ''}`.trim()),
    ...(card.attacks ?? []).map(attack => {
      const damage = attack.damage === null || attack.damage === undefined ? '' : String(attack.damage);
      const head = [costText(attack.cost) && `[${costText(attack.cost)}]`, attack.name, damage]
        .filter(Boolean)
        .join(' ');
      return `${head}\n${attack.effect ?? ''}`.trim();
    }),
  ];
  if (card.effect) lines.push(card.effect);
  return { effect: trimmed(lines.join('\n\n')), stats };
}

function printingsFrom(card: DexCard): Printing[] {
  const variants = card.variants ?? {};
  const printings: Printing[] = [];
  if (variants.holo && variants.normal) printings.push({ id: 'holo', label: 'Holo', note: '' });
  if (variants.reverse) printings.push({ id: 'reverse', label: 'Reverse holo', note: '' });
  if (variants.firstEdition) printings.push({ id: '1st', label: '1st Edition', note: '' });
  return printings;
}

export function buildPokemonCatalog(cards: DexCard[], sets: Map<string, PokemonSetInfo>): CatalogCard[] {
  const built: CatalogCard[] = [];
  for (const card of cards) {
    const set = card.set ? sets.get(card.set.id) : undefined;
    if (!set) continue;
    const number = pokemonNumber(set, card.localId);
    const setCode = set.id.toUpperCase();
    built.push({
      // The id keeps TCGdex's own key, so a set code added later can't orphan owned cards.
      id: `pokemon:${card.id}`,
      game: 'pokemon',
      number,
      setCode,
      setName: `${setCode} · ${set.name}`,
      name: card.name,
      type: card.category ?? '',
      color: (card.types ?? []).join(' / '),
      rarity: rarityCode(card.rarity),
      image: card.image ? `${card.image}/low.webp` : '',
      imageLarge: card.image ? `${card.image}/high.webp` : undefined,
      sortKey: `${set.releaseDate || '9999-99-99'}|${setCode.padEnd(10, '_')}|${collectorKey(card.localId)}`,
      printings: printingsFrom(card),
      details: detailsFrom(card),
    });
  }
  return built;
}

async function graphql<T>(query: string): Promise<T> {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`TCGdex answered ${response.status}`);
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? 'TCGdex sent no data');
  return body.data;
}

async function paperSets(): Promise<DexSet[]> {
  const { sets } = await graphql<{ sets: DexSet[] }>(
    '{ sets { id name releaseDate cardCount { total official } serie { id name } } }',
  );
  return sets.filter(set => !DIGITAL_SERIES.has(set.serie?.id ?? ''));
}

/** The id filter matches anywhere in a card id, so cards are kept only when their set really matches. */
async function cardsOfSet(setId: string): Promise<DexCard[]> {
  const cards: DexCard[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const filter = JSON.stringify(`${setId}-`);
    const { cards: batch } = await graphql<{ cards: (DexCard | null)[] }>(
      `{ cards(filters: { id: ${filter} }, pagination: { page: ${page}, count: ${PAGE_SIZE} }) { ${CARD_FIELDS} } }`,
    );
    cards.push(...batch.filter((card): card is DexCard => !!card && card.set?.id === setId));
    if (batch.length < PAGE_SIZE) break;
  }
  return cards;
}

export function toGameSet(set: DexSet): GameSet {
  return {
    code: set.id.toUpperCase(),
    name: set.name,
    releasedAt: set.releaseDate ?? '',
    cardCount: set.cardCount?.total ?? 0,
    kind: set.serie?.name ?? '',
    main: !SIDE_SERIES.has(set.serie?.id ?? '') && !/promo/i.test(set.name),
  };
}

const looseName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();

/** Worth the Rip names the set and prints "083/088"; the catalog knows both, so match on the pair. */
export function pokemonPriceReader(cards: CatalogCard[]): (raw: string, setName: string) => string | null {
  const bySet = new Map<string, Map<string, string>>();
  for (const card of cards) {
    const name = looseName(card.setName.slice(card.setName.indexOf(' · ') + 3));
    const local = card.number.slice(card.number.lastIndexOf('-') + 1).replace(/^0+(?=\d)/, '');
    let numbers = bySet.get(name);
    if (!numbers) bySet.set(name, (numbers = new Map()));
    numbers.set(local, card.number);
  }
  return (raw, setName) => {
    const local = raw.trim().split('/')[0].toUpperCase().replace(/^0+(?=\d)/, '');
    return bySet.get(looseName(setName))?.get(local) ?? null;
  };
}

const AS_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', B: '8' };

/** Scarlet & Violet onwards print "SVI EN 025/198" bottom-left; older cards carry only a set symbol. */
export function pokemonScanCandidates(text: string): string[] {
  const found = new Set<string>();
  const pattern = /(?:^|[^A-Z0-9])([A-Z]{2,4})\s*(?:EN\s*)?([0-9OQDILSB|]{1,3})\s*\/\s*[0-9OQDILSB|]{2,3}(?![0-9])/g;
  for (const [, code, raw] of text.toUpperCase().matchAll(pattern)) {
    if (code === 'EN') continue;
    const digits = [...raw].map(character => AS_DIGIT[character] ?? character).join('');
    if (/^\d+$/.test(digits)) found.add(`${code}-${digits.padStart(3, '0')}`);
  }
  return [...found];
}

/** Only Scarlet & Violet onwards print a set code, and TCGdex lists it per set, not in the set list. */
const PRINTED_CODE_SERIES = new Set(['sv', 'me']);
let printedCodes: Promise<Map<string, DexSet>> | undefined;

async function setsByPrintedCode(): Promise<Map<string, DexSet>> {
  const sets = (await paperSets()).filter(set => PRINTED_CODE_SERIES.has(set.serie?.id ?? ''));
  const details = await Promise.all(
    sets.map(set => getJson<DexSetDetail>(SET_URL(set.id)).catch(() => null)),
  );
  const byCode = new Map<string, DexSet>();
  details.forEach((detail, i) => {
    const code = trimmed(detail?.abbreviation?.official ?? undefined)?.toUpperCase();
    if (code && !byCode.has(code)) byCode.set(code, sets[i]);
  });
  return byCode;
}

export const pokemon: GameDefinition = {
  id: 'pokemon',
  name: 'Pokémon TCG',
  shortName: 'Pokémon',
  sources: 'Card data and images from TCGdex. Pick the sets you collect. Prices cover Black & White onwards.',
  priceGame: 'pokemon',
  async listSets() {
    return (await paperSets()).map(toGameSet);
  },
  async fetchCatalog(options: FetchOptions = {}) {
    const wanted = new Set((options.sets ?? []).map(code => code.toLowerCase()));
    const all = await paperSets();
    const picked = all.filter(set => wanted.has(set.id.toLowerCase()));
    const sets = new Map<string, PokemonSetInfo>();
    const codes = new Set<string>();
    const cards: DexCard[] = [];
    for (const [index, set] of picked.entries()) {
      const detail = await getJson<DexSetDetail>(SET_URL(set.id));
      const code = trimmed(detail.abbreviation?.official ?? undefined)?.toUpperCase();
      // Two sets printing the same code would share card numbers, so the second keeps its id.
      const unique = code && !codes.has(code) ? code : undefined;
      if (unique) codes.add(unique);
      sets.set(set.id, { ...set, code: unique });
      cards.push(...(await cardsOfSet(set.id)));
      options.onProgress?.((index + 1) / picked.length);
    }
    return buildPokemonCatalog(cards, sets);
  },
  priceNumberReader: pokemonPriceReader,
  scanCandidates: pokemonScanCandidates,
  async scanSet(number: string) {
    printedCodes ??= setsByPrintedCode();
    printedCodes.catch(() => (printedCodes = undefined));
    const set = (await printedCodes).get(number.slice(0, number.indexOf('-')).toUpperCase());
    return set && toGameSet(set);
  },
};
