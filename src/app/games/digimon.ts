import { CardDetails, CardStat, CatalogCard, GameDefinition, Printing } from '../data/models';
import { CARD_NUMBER, asText, candidatesFrom, getJson, setCodeOf, trimmed } from './card-codes';

const CATALOG_URL = 'https://digimoncard.io/api-public/search?series=Digimon%20Card%20Game';
const PRINTINGS_URL =
  'https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/main/src/assets/cardlists/DigimonCards.json';

/** Boosters first, then the other product lines; numbering inside each line is already chronological. */
const FAMILY_ORDER = ['BT', 'EX', 'ST', 'RB', 'LM', 'AD', 'BD', 'SD', 'ED'];
const PROMO_FAMILY = 'P';

export interface DcioCard {
  id: string;
  name: string;
  type: string;
  color: string | null;
  rarity: string | null;
  set_name?: string[] | null;
  level?: number | null;
  dp?: number | null;
  play_cost?: number | null;
  evolution_cost?: number | null;
  attribute?: string | null;
  form?: string | null;
  digi_type?: string | null;
  digi_type2?: string | null;
  main_effect?: string | null;
  source_effect?: string | null;
  alt_effect?: string | null;
}

export interface TakaCard {
  cardNumber: string;
  notes?: string;
  AAs?: { id: string; type?: string; note?: string }[];
}

export function digimonSortKey(number: string): string {
  const match = CARD_NUMBER.exec(number);
  if (!match) return `99${number}`;
  const [, family, setNum, cardNum] = match;
  const known = FAMILY_ORDER.indexOf(family);
  const rank = family === PROMO_FAMILY ? 98 : known >= 0 ? known : 50;
  return [
    String(rank).padStart(2, '0'),
    family.padEnd(4, '_'),
    (setNum || '0').padStart(3, '0'),
    cardNum.padStart(4, '0'),
  ].join('');
}

function printingsFrom(taka: TakaCard | undefined): Printing[] {
  return (taka?.AAs ?? []).map(aa => ({
    id: aa.id.slice(aa.id.lastIndexOf('_') + 1),
    label: (aa.type ?? '').trim() || 'Alternate printing',
    note: (aa.note ?? '').trim(),
  }));
}

const SET_FALLBACK_NAMES: Record<string, string> = { P: 'Promos' };

/** "BT1" matches "BT-01" or "[BT01]" but not the reprint range "[BT01-03]". */
function mentionsSet(note: string, setCode: string): boolean {
  const match = /^([A-Z]+)(\d+)$/.exec(setCode);
  if (!match) return false;
  const [, family, num] = match;
  return new RegExp(`\\b${family}-?0*${Number(num)}(?![\\d-])`).test(note.toUpperCase());
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b[a-z][a-z']*/g, word => (/^[ivxlc]+$/.test(word) && word.length > 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)));
}

export function cleanSetName(note: string): string {
  const name = note
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^[A-Z]+-?\d+:\s*/, '')
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .trim();
  return titleCase(name);
}

/** Product names may be reprint packs, so only a name containing the set's own code titles it. */
function setNamesFrom(dcio: DcioCard[], taka: TakaCard[]): Map<string, string> {
  const tallies = new Map<string, Map<string, number>>();
  const count = (number: string, note: string | undefined) => {
    const code = setCodeOf(number);
    note = note?.trim();
    if (!note || !mentionsSet(note, code)) return;
    const tally = tallies.get(code) ?? new Map<string, number>();
    tally.set(note, (tally.get(note) ?? 0) + 1);
    tallies.set(code, tally);
  };
  for (const card of dcio) for (const name of card.set_name ?? []) count(card.id, name);
  for (const card of taka) count(card.cardNumber, card.notes);
  const names = new Map<string, string>();
  for (const [code, tally] of tallies) {
    const best = [...tally].sort((a, b) => b[1] - a[1])[0][0];
    names.set(code, `${code} · ${cleanSetName(best)}`);
  }
  for (const [code, name] of Object.entries(SET_FALLBACK_NAMES)) {
    if (!names.has(code)) names.set(code, name);
  }
  return names;
}

export function buildDigimonCatalog(dcio: DcioCard[], taka: TakaCard[]): CatalogCard[] {
  const takaByNumber = new Map(taka.map(card => [card.cardNumber, card]));
  const setNames = setNamesFrom(dcio, taka);
  return dcio
    .filter(card => CARD_NUMBER.test(card.id))
    .map(card => {
      const setCode = setCodeOf(card.id);
      return {
        id: `digimon:${card.id}`,
        game: 'digimon',
        number: card.id,
        setCode,
        setName: setNames.get(setCode) ?? setCode,
        name: card.name,
        type: card.type,
        color: card.color ?? '',
        rarity: (card.rarity ?? '').toUpperCase(),
        image: `https://images.digimoncard.io/images/cards/${card.id}.webp`,
        sortKey: digimonSortKey(card.id),
        printings: printingsFrom(takaByNumber.get(card.id)),
        details: detailsFrom(card),
      };
    });
}

const SCAN_FAMILIES = [...FAMILY_ORDER, PROMO_FAMILY];

export function digimonScanCandidates(text: string): string[] {
  return candidatesFrom(text, { families: SCAN_FAMILIES, unpadded: true });
}

function detailsFrom(card: DcioCard): CardDetails {
  const types = [card.digi_type, card.digi_type2].filter(Boolean).join(' / ');
  const stats = [
    { label: 'Type', value: trimmed(card.type) },
    { label: 'Colour', value: trimmed(card.color) },
    { label: 'Level', value: asText(card.level) },
    { label: 'DP', value: asText(card.dp) },
    { label: 'Play cost', value: asText(card.play_cost) },
    { label: 'Evolve cost', value: asText(card.evolution_cost) },
    { label: 'Attribute', value: trimmed(card.attribute) },
    { label: 'Form', value: trimmed(card.form) },
    { label: 'Digi-type', value: types || undefined },
  ].filter((stat): stat is CardStat => !!stat.value);

  return {
    effect: trimmed(card.main_effect),
    inherited: trimmed(card.source_effect),
    extra: trimmed(card.alt_effect),
    stats,
  };
}

export const digimon: GameDefinition = {
  id: 'digimon',
  name: 'Digimon Card Game',
  sources: 'Card data from digimoncard.io; alternate printings from TakaOtaku/Digimon-Card-App.',
  async fetchCatalog() {
    const [dcio, taka] = await Promise.all([
      getJson<DcioCard[]>(CATALOG_URL),
      // Alternate printings are a bonus: a failed download still installs the catalog.
      getJson<TakaCard[]>(PRINTINGS_URL).catch(() => [] as TakaCard[]),
    ]);
    return buildDigimonCatalog(dcio, taka);
  },
  scanCandidates: digimonScanCandidates,
  priceGame: 'digimon',
  shortName: 'Digimon',
};
