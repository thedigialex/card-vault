import { cardSorter, rarityRank, sortEntries, sortOptionsFor, statNumber } from './card-sort';
import { LibraryEntry } from './collection.service';
import { CatalogCard } from './models';
import { stacksOf } from './stacks';

let nextId = 1;

function card(number: string, extra: Partial<CatalogCard> = {}): CatalogCard {
  return {
    id: `digimon:${number}`,
    game: 'digimon',
    number,
    setCode: number.split('-')[0],
    setName: '',
    name: number,
    type: '',
    color: '',
    rarity: 'C',
    image: '',
    sortKey: number,
    printings: [],
    ...extra,
  };
}

function entry(catalog: CatalogCard, printingId = '', addedAt = 0): LibraryEntry {
  return {
    owned: { id: nextId++, game: catalog.game, cardId: catalog.id, printingId, sortKey: `${catalog.sortKey}|${printingId}`, addedAt },
    card: catalog,
    printing: '',
  };
}

const numbers = (entries: LibraryEntry[]) => entries.map(e => e.card.number);
const noPrice = () => undefined;

describe('card sorting', () => {
  it('reads numeric stats and skips ones that are not numbers', () => {
    const magic = card('NEO-1', { details: { stats: [{ label: 'Power/Toughness', value: '3/2' }, { label: 'Mana cost', value: '{2}{U}' }] } });
    expect(statNumber(magic, 'Power/Toughness')).toBe(3);
    expect(statNumber(magic, 'Mana cost')).toBeUndefined();
    expect(sortOptionsFor([magic]).map(o => o.id)).toContain('stat:Power/Toughness');
    expect(sortOptionsFor([magic]).map(o => o.id)).not.toContain('stat:Mana cost');
  });

  it('puts the rarest first, with uncommons above commons', () => {
    const entries = [entry(card('BT1-001', { rarity: 'C' })), entry(card('BT1-002', { rarity: 'SEC' })), entry(card('BT1-003', { rarity: 'U' })), entry(card('BT1-004', { rarity: 'SR' }))];
    expect(numbers(sortEntries(entries, 'rarity', noPrice, e => e))).toEqual(['BT1-002', 'BT1-004', 'BT1-003', 'BT1-001']);
    expect(rarityRank({ rarity: 'U' })).toBeGreaterThan(rarityRank({ rarity: 'C' }));
  });

  it('sorts a stat high to low and leaves cards without it last', () => {
    const dp = (value?: string) => (value ? { details: { stats: [{ label: 'DP', value }] } } : {});
    const entries = [entry(card('BT1-001', dp())), entry(card('BT1-002', dp('3000'))), entry(card('BT1-003', dp('12000')))];
    expect(numbers(sortEntries(entries, 'stat:DP', noPrice, e => e))).toEqual(['BT1-003', 'BT1-002', 'BT1-001']);
  });

  it('breaks ties in set order and sorts unpriced cards last', () => {
    const prices: Record<string, number> = { 'BT1-002': 5, 'BT1-003': 5 };
    const entries = [entry(card('BT1-003')), entry(card('BT1-001')), entry(card('BT1-002'))];
    const sorted = [...entries].sort(cardSorter('price', c => prices[c.number]));
    expect(numbers(sorted)).toEqual(['BT1-002', 'BT1-003', 'BT1-001']);
  });

  it('keeps copies of one card next to each other so they stack', () => {
    const agumon = card('BT1-010', { name: 'Agumon' });
    const entries = [entry(agumon), entry(card('BT1-001', { name: 'Zudomon' })), entry(agumon), entry(agumon, 'alt')];
    const stacks = stacksOf(sortEntries(entries, 'name', noPrice, e => e), e => e, true);
    expect(stacks.map(s => s.items.length)).toEqual([2, 1, 1]);
  });
});

describe('stacksOf', () => {
  it('only merges neighbours when told to, and never across printings', () => {
    const a = card('BT1-001');
    const b = card('BT1-002');
    const row = [entry(a), entry(a), entry(b), entry(a), entry(a, 'alt')];
    expect(stacksOf(row, e => e, true).map(s => s.items.length)).toEqual([2, 1, 1, 1]);
    expect(stacksOf(row, e => e, false).map(s => s.items.length)).toEqual([3, 1, 1]);
  });
});
