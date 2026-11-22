import { YgoCard, buildYugiohCatalog, mergeSets, yugiohPriceNumber, yugiohScanCandidates, yugiohSortKey } from './yugioh';

const sets = mergeSets([
  { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB', num_of_cards: 355, tcg_date: '2002-03-08' },
  { set_name: 'Legend of Blue Eyes White Dragon (25th Anniversary Edition)', set_code: 'LOB', num_of_cards: 14, tcg_date: '2023-04-20' },
  { set_name: '25th Anniversary Rarity Collection', set_code: 'RA01', num_of_cards: 79, tcg_date: '2023-11-02' },
]);

const blueEyes: YgoCard = {
  id: 89631139,
  name: 'Blue-Eyes White Dragon',
  humanReadableCardType: 'Normal Monster',
  frameType: 'normal',
  race: 'Dragon',
  atk: 3000,
  def: 2500,
  level: 8,
  attribute: 'LIGHT',
  card_sets: [
    { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB-001', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '62.15' },
    { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB-EN001', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '0' },
    { set_name: 'Legend of Blue Eyes White Dragon (25th Anniversary Edition)', set_code: 'LOB-EN001', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '3.10' },
    { set_name: 'Starter Deck: Kaiba', set_code: 'SDK-001', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '20' },
  ],
  card_images: [{ image_url: 'big.jpg', image_url_small: 'small.jpg' }],
};

const alpha: YgoCard = {
  id: 73304257,
  name: 'Alpha, the Master of Beasts',
  frameType: 'effect',
  card_sets: [
    { set_name: '25th Anniversary Rarity Collection', set_code: 'RA01-EN022', set_rarity: "Collector's Rare", set_rarity_code: '(CR)', set_price: '4' },
    { set_name: '25th Anniversary Rarity Collection', set_code: 'RA01-EN022', set_rarity: 'Quarter Century Secret Rare', set_rarity_code: '', set_price: '12' },
    { set_name: '25th Anniversary Rarity Collection', set_code: 'RA01-EN022', set_rarity: 'Super Rare', set_rarity_code: '(SR)', set_price: '0.2' },
  ],
};

describe('mergeSets', () => {
  it('folds releases that share a code', () => {
    expect(sets.map(set => [set.code, set.names.length, set.date])).toEqual([
      ['LOB', 2, '2002-03-08'],
      ['RA01', 1, '2023-11-02'],
    ]);
  });
});

describe('buildYugiohCatalog', () => {
  const { cards, prices = [] } = buildYugiohCatalog([blueEyes, alpha, blueEyes], sets, 1);
  const byNumber = new Map(cards.map(card => [card.number, card]));

  it('makes one card per printed code in the picked sets', () => {
    expect([...byNumber.keys()].sort()).toEqual(['LOB-001', 'LOB-EN001', 'RA01-EN022']);
    expect(byNumber.get('LOB-EN001')).toMatchObject({
      id: 'yugioh:LOB-EN001',
      setCode: 'LOB',
      setName: 'LOB · Legend of Blue Eyes White Dragon',
      rarity: 'UR',
      image: 'small.jpg',
      imageLarge: 'big.jpg',
    });
    expect(byNumber.get('LOB-EN001')!.printings).toEqual([
      { id: 'UR·Legend of Blue Eyes White Dragon (25th Anniversary Edition)', label: 'Ultra Rare', note: 'Legend of Blue Eyes White Dragon (25th Anniversary Edition)' },
    ]);
  });

  it('treats the plainest rarity as regular and prices the rest as variants', () => {
    const ra01 = byNumber.get('RA01-EN022')!;
    expect(ra01.rarity).toBe('SR');
    expect(ra01.printings.map(p => p.id)).toEqual(['QCSR', 'CR']);
    expect(prices.find(row => row.number === 'RA01-EN022')).toMatchObject({
      market: 0.2,
      variants: [
        { label: 'Quarter Century Secret Rare', market: 12 },
        { label: "Collector's Rare", market: 4 },
      ],
    });
    expect(prices.find(row => row.number === 'LOB-EN001')?.market).toBe(3.1);
  });
});

describe('yugioh numbers', () => {
  it('sorts on set, region, digits', () => {
    expect(yugiohSortKey('LOB-EN002', '2002') > yugiohSortKey('LOB-EN001', '2002')).toBe(true);
  });

  it('reads Worth the Rip numbers', () => {
    expect(yugiohPriceNumber('RA01-EN079')).toBe('RA01-EN079');
    expect(yugiohPriceNumber('083/088')).toBeNull();
  });

  it('finds the printed code and fixes OCR digits', () => {
    expect(yugiohScanCandidates('ATK/3000 LOB-EN0O1 DEF')).toEqual(['LOB-EN001']);
    expect(yugiohScanCandidates('L0B-E001')).toEqual(['L0B-E001', 'LOB-E001']);
  });
});
