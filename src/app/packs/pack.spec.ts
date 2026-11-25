import { CatalogCard, rarityTier } from '../data/models';
import { openPack } from './pack';

function card(index: number, rarity: string): CatalogCard {
  const number = `BT1-${String(index).padStart(3, '0')}`;
  return {
    id: `digimon:${number}`,
    game: 'digimon',
    number,
    setCode: 'BT1',
    setName: '',
    name: number,
    type: '',
    color: '',
    rarity,
    image: '',
    sortKey: number,
    printings: [],
  };
}

const set = [
  ...Array.from({ length: 30 }, (_, i) => card(i, 'C')),
  ...Array.from({ length: 20 }, (_, i) => card(100 + i, 'U')),
  ...Array.from({ length: 10 }, (_, i) => card(200 + i, 'R')),
  ...Array.from({ length: 5 }, (_, i) => card(300 + i, 'SR')),
  ...Array.from({ length: 2 }, (_, i) => card(400 + i, 'SEC')),
];

/** A seeded generator, so the odds test is the same on every run. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe('openPack', () => {
  it('fills the pack without repeats and reveals the best card last', () => {
    const pack = openPack(set, 12, seeded(1));
    expect(pack.length).toBe(12);
    expect(new Set(pack.map(c => c.id)).size).toBe(12);
    const ranks = pack.map(c => ['C', 'U', 'R', 'SR', 'SEC'].indexOf(c.rarity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('hits a rare or better about as often as the odds say', () => {
    const random = seeded(42);
    let hits = 0;
    let chase = 0;
    for (let i = 0; i < 2000; i++) {
      const last = openPack(set, 12, random).at(-1)!;
      if (rarityTier(last) !== 'common') hits++;
      if (rarityTier(last) === 'ultra') chase++;
    }
    expect(hits / 2000).toBeGreaterThan(0.38);
    expect(hits / 2000).toBeLessThan(0.52);
    expect(chase / 2000).toBeGreaterThan(0.06);
    expect(chase / 2000).toBeLessThan(0.14);
  });

  it('copes with a tiny set by allowing repeats', () => {
    expect(openPack([card(1, 'P')], 5).length).toBe(5);
    expect(openPack([], 5)).toEqual([]);
  });
});
