import { CatalogCard } from '../data/models';
import { NameIndex, editDistance, narrowByClues, normalizeName } from './name-match';

const card = (number: string, name: string): CatalogCard => ({
  id: `palworld:${number}`,
  game: 'palworld',
  number,
  setCode: number.split('-')[0],
  setName: '',
  name,
  type: '',
  color: '',
  rarity: '',
  image: '',
  sortKey: number,
  printings: [],
});

const jormuntide = card('BP01-001', 'Jormuntide Ignis – Savage Lava Dragon');
const lamballA = card('BP01-050', 'Lamball');
const lamballB = card('BP02-010', 'Lamball');
const index = new NameIndex([lamballB, jormuntide, lamballA, card('BP01-002', 'Pal')]);

describe('normalizeName', () => {
  it('keeps only letters and digits', () => {
    expect(normalizeName('Jormuntide Ignis – Savage Lava Dragon!')).toBe('jormuntide ignis savage lava dragon');
  });
});

describe('editDistance', () => {
  it('counts edits and stops past the limit', () => {
    expect(editDistance('lava dragon', 'lava dragom', 2)).toBe(1);
    expect(editDistance('lamball', 'dragon', 2)).toBe(3);
  });
});

describe('NameIndex', () => {
  it('finds a card from its name among the other text on the card', () => {
    const text = '8\nPal\nJormuntide Ignis - Savage Lava Dragon\nLucky Pal\nKindling\n<RR> EBP01-001';
    expect(index.find(text)).toEqual([jormuntide]);
  });

  it('forgives a misread letter and a stray icon', () => {
    expect(index.find('Jormuntlde Ignis – Savage Lava Dragon 6')).toEqual([jormuntide]);
  });

  it('finds a name that wrapped onto two lines', () => {
    expect(index.find('Jormuntide Ignis –\nSavage Lava Dragon')).toEqual([jormuntide]);
  });

  it('returns every card sharing a name, in catalog order', () => {
    expect(index.find('Lamball')).toEqual([lamballA, lamballB]);
  });

  it('ignores short words and unrelated text', () => {
    expect(index.find('Pal\nPower 1700\nStrike 4')).toEqual([]);
  });
});

describe('narrowByClues', () => {
  const both = [lamballA, lamballB];

  it('keeps the card whose set code shows on the card', () => {
    expect(narrowByClues('Lamball\nBP02 C', both)).toEqual([lamballB]);
  });

  it('uses a collector number of three digits or more', () => {
    expect(narrowByClues('Lamball\n050', both)).toEqual([lamballA]);
  });

  it('ignores short numbers like power or HP', () => {
    expect(narrowByClues('Lamball\nPower 10\n50', both)).toEqual(both);
  });

  it('keeps every card when nothing tells them apart', () => {
    expect(narrowByClues('Lamball', both)).toEqual(both);
  });
});
