import { buildPalworldCatalog, palworldScanCandidates, palworldSortKey, setOrderOf } from './palworld';

const sets = [
  { code: 'BP01', name: 'Dawn of Palpagos', release_date: '2026-07-30' },
  { code: 'BP02', name: 'Legends Awaken', release_date: '2026-11-20' },
];

describe('palworld set order', () => {
  it('orders sets by release date and sorts card numbers naturally', () => {
    const order = setOrderOf(sets);
    const numbers = ['BP02-001', 'BP01-100', 'BP01-002'];

    expect([...numbers].sort((a, b) => palworldSortKey(a, order).localeCompare(palworldSortKey(b, order)))).toEqual([
      'BP01-002',
      'BP01-100',
      'BP02-001',
    ]);
  });
});

describe('buildPalworldCatalog', () => {
  it('maps a card, makes the image absolute and keeps its text', () => {
    const [card] = buildPalworldCatalog(
      [
        {
          card_number: 'BP01-001',
          set_code: 'BP01',
          name: 'Jormuntide Ignis – Savage Lava Dragon',
          pal_name: 'Jormuntide Ignis',
          card_type: 'Pal',
          color: ['Red'],
          cost: 8,
          power: 1700,
          strike: 4,
          rarity: 'RR',
          effect_text: 'Stand this card.',
          work_keywords: ['Kindling'],
          image_url: '/img/card-images/official/BP01/BP01-001.png',
        },
      ],
      sets,
    );

    expect(card).toMatchObject({
      id: 'palworld:BP01-001',
      game: 'palworld',
      setName: 'BP01 · Dawn of Palpagos',
      rarity: 'RR',
      image: 'https://palworldtcg.gg/img/card-images/official/BP01/BP01-001.png',
      printings: [],
    });
    expect(card.details?.effect).toBe('Stand this card.');
    expect(card.details?.stats).toEqual([
      { label: 'Type', value: 'Pal' },
      { label: 'Colour', value: 'Red' },
      { label: 'Cost', value: '8' },
      { label: 'Power', value: '1700' },
      { label: 'Strike', value: '4' },
      { label: 'Pal', value: 'Jormuntide Ignis' },
      { label: 'Keywords', value: 'Kindling' },
    ]);
  });

  it('skips rows without a usable card number', () => {
    expect(buildPalworldCatalog([{ card_number: null, name: 'Mystery' }], sets)).toEqual([]);
  });
});

describe('palworldScanCandidates', () => {
  it('reads a number off noisy text', () => {
    expect(palworldScanCandidates('Pal  BPO1-OO1  RR')).toEqual(['BP01-001']);
  });
});
