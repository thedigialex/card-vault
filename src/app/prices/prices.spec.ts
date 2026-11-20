import { foldPrices, formatPrice, numberOf, priceKey, totalValue, variantLabel } from './prices';

describe('numberOf', () => {
  it('drops the rarity suffix and refuses anything that is not a card number', () => {
    expect(numberOf('BT1-084 SR')).toBe('BT1-084');
    expect(numberOf('P-104')).toBe('P-104');
    expect(numberOf('Booster Box')).toBeNull();
    expect(numberOf(undefined)).toBeNull();
  });
});

describe('variantLabel', () => {
  it('reads the bracketed difference, if any', () => {
    expect(variantLabel('Upamon - BT1-003 (Winner Pack Dimensional Phase)')).toBe('Winner Pack Dimensional Phase');
    expect(variantLabel('Upamon - BT1-003')).toBeNull();
  });
});

describe('foldPrices', () => {
  const cards = [
    { name: 'Upamon - BT1-003', number: 'BT1-003 R', marketPrice: 0.14, imageLarge: 'base.jpg' },
    { name: 'Upamon (1-Year Anniversary Box Topper)', number: 'BT1-003 R', marketPrice: 0.82 },
    { name: 'Upamon - BT1-003 (Winner Pack)', number: 'BT1-003 R', marketPrice: 1.81 },
    { name: 'Booster Box', number: undefined, marketPrice: 90 },
    { name: 'Agumon', number: 'BT1-010 R', marketPrice: null },
  ];

  it('keeps the plain printing as the price and lists variants dearest first', () => {
    const [row, ...rest] = foldPrices('digimon', cards, 5);

    expect(rest).toEqual([]);
    expect(row).toMatchObject({ key: 'digimon:BT1-003', number: 'BT1-003', market: 0.14, image: 'base.jpg', updatedAt: 5 });
    expect(row.variants.map(v => v.label)).toEqual(['Winner Pack', '1-Year Anniversary Box Topper']);
  });

  it('falls back to the cheapest variant when there is no plain printing', () => {
    const rows = foldPrices('digimon', [cards[1], cards[2]], 5);

    expect(rows[0].market).toBe(0.82);
  });
});

describe('formatPrice and totalValue', () => {
  it('keeps each game in its own price key', () => {
    expect(priceKey('digimon', 'SD1-001')).not.toBe(priceKey('palworld', 'SD1-001'));
  });

  it('formats money and adds up only cards with a price', () => {
    expect(formatPrice(1.5)).toBe('$1.50');
    expect(formatPrice(undefined)).toBe('—');
    const keys = [priceKey('digimon', 'BT1-001'), priceKey('digimon', 'BT1-002')];
    expect(totalValue(keys, new Map([[priceKey('digimon', 'BT1-001'), 2.5]]))).toBe(2.5);
  });
});
