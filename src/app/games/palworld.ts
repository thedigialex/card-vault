import { CardDetails, CardStat, CatalogCard, GameDefinition } from '../data/models';
import { CARD_NUMBER, asText, candidatesFrom, getJson, setCodeOf, trimmed } from './card-codes';

const SITE = 'https://palworldtcg.gg';
const SETS_URL = `${SITE}/api/v1/sets`;
const CARDS_URL = (page: number) => `${SITE}/api/v1/cards?per_page=100&page=${page}`;
const MAX_PAGES = 40;

export interface PalSet {
  code: string;
  name: string;
  release_date?: string | null;
}

export interface PalCard {
  card_number?: string | null;
  set_code?: string | null;
  name?: string | null;
  pal_name?: string | null;
  card_type?: string | null;
  subtype?: string | null;
  color?: string[] | null;
  cost?: number | null;
  power?: number | null;
  strike?: number | null;
  rarity?: string | null;
  effect_text?: string | null;
  keywords?: string[] | null;
  work_keywords?: string[] | null;
  image_url?: string | null;
}

export function palworldSortKey(number: string, setOrder: Map<string, number>): string {
  const match = CARD_NUMBER.exec(number);
  if (!match) return `99${number}`;
  const [, family, setNum, cardNum] = match;
  const code = `${family}${setNum}`;
  const rank = setOrder.get(code) ?? 90;
  return [String(rank).padStart(2, '0'), code.padEnd(6, '_'), cardNum.padStart(4, '0')].join('');
}

/** Sets are ordered by release date, with trial decks after the booster that shares their date. */
export function setOrderOf(sets: PalSet[]): Map<string, number> {
  const ordered = [...sets].sort(
    (a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? '') || a.code.localeCompare(b.code),
  );
  return new Map(ordered.map((set, index) => [set.code, index]));
}

function detailsFrom(card: PalCard): CardDetails {
  const keywords = [...(card.keywords ?? []), ...(card.work_keywords ?? [])].filter(Boolean).join(', ');
  const stats = [
    { label: 'Type', value: trimmed(card.card_type) },
    { label: 'Colour', value: (card.color ?? []).join(' / ') || undefined },
    { label: 'Cost', value: asText(card.cost) },
    { label: 'Power', value: asText(card.power) },
    { label: 'Strike', value: asText(card.strike) },
    { label: 'Subtype', value: trimmed(card.subtype) },
    { label: 'Pal', value: trimmed(card.pal_name) },
    { label: 'Keywords', value: keywords || undefined },
  ].filter((stat): stat is CardStat => !!stat.value);

  return { effect: trimmed(card.effect_text), stats };
}

export function buildPalworldCatalog(cards: PalCard[], sets: PalSet[]): CatalogCard[] {
  const order = setOrderOf(sets);
  const names = new Map(sets.map(set => [set.code, `${set.code} · ${set.name}`]));
  return cards
    .filter(card => !!card.card_number && CARD_NUMBER.test(card.card_number))
    .map(card => {
      const number = card.card_number!;
      const setCode = card.set_code ?? setCodeOf(number);
      const image = card.image_url ?? '';
      return {
        id: `palworld:${number}`,
        game: 'palworld',
        number,
        setCode,
        setName: names.get(setCode) ?? setCode,
        name: card.name?.trim() || card.pal_name?.trim() || number,
        type: card.card_type ?? '',
        color: (card.color ?? []).join(' / '),
        rarity: (card.rarity ?? '').toUpperCase(),
        image: image.startsWith('http') ? image : `${SITE}${image}`,
        sortKey: palworldSortKey(number, order),
        printings: [],
        details: detailsFrom(card),
      };
    });
}

/** Palworld prints a two-letter family (BP, TD, PR), so any two letters are fair game. */
export function palworldScanCandidates(text: string): string[] {
  return candidatesFrom(text, { familyLength: [2] });
}

export const palworld: GameDefinition = {
  id: 'palworld',
  name: 'Palworld TCG',
  sources: 'Card data from the palworldtcg.gg public API.',
  async fetchCatalog() {
    const sets = (await getJson<{ data: PalSet[] }>(SETS_URL)).data ?? [];
    const cards: PalCard[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await getJson<{ data: PalCard[]; meta?: { total_pages?: number } }>(CARDS_URL(page));
      cards.push(...(body.data ?? []));
      if (page >= (body.meta?.total_pages ?? 1)) break;
    }
    return buildPalworldCatalog(cards, sets);
  },
  scanCandidates: palworldScanCandidates,
  shortName: 'Palworld',
};
