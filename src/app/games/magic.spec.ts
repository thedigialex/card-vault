import { ScryfallCard, ScryfallSet, buildMagicCatalog, collectorKey, magicPrices, magicScanCandidates } from './magic';

const neo: ScryfallSet = {
  code: 'neo',
  name: 'Kamigawa: Neon Dynasty',
  released_at: '2022-02-18',
  set_type: 'expansion',
  card_count: 512,
  digital: false,
  icon_svg_uri: 'https://svgs.scryfall.io/sets/neo.svg',
};

const katana: ScryfallCard = {
  name: 'Ancestral Katana',
  set: 'neo',
  set_name: 'Kamigawa: Neon Dynasty',
  collector_number: '1',
  rarity: 'common',
  mana_cost: '{1}{W}',
  type_line: 'Artifact — Equipment',
  oracle_text: 'Equipped creature gets +2/+1.',
  colors: ['W'],
  finishes: ['nonfoil', 'foil'],
  image_uris: { grid: 'grid.webp', normal: 'normal.jpg', display: 'display.webp' },
  prices: { usd: '0.19', usd_foil: '0.28' },
};

const moth: ScryfallCard = {
  name: 'Befriending the Moths // Imperial Moth',
  set: 'neo',
  set_name: 'Kamigawa: Neon Dynasty',
  collector_number: '4',
  rarity: 'mythic',
  card_faces: [
    { name: 'Befriending the Moths', mana_cost: '{3}{W}', type_line: 'Enchantment — Saga', oracle_text: 'Saga text', colors: ['W'], image_uris: { normal: 'front.jpg' } },
    { name: 'Imperial Moth', type_line: 'Enchantment Creature — Insect', oracle_text: 'Flying', power: '2', toughness: '4' },
  ],
  prices: { usd: null, usd_foil: '3.10' },
};

describe('buildMagicCatalog', () => {
  it('maps prints to SET-number cards in set order', () => {
    const [card, dfc] = buildMagicCatalog([katana, moth], new Map([['neo', neo]]));

    expect(card).toMatchObject({
      id: 'mtg:NEO-1',
      number: 'NEO-1',
      setCode: 'NEO',
      setName: 'NEO · Kamigawa: Neon Dynasty',
      setIcon: neo.icon_svg_uri,
      color: 'White',
      rarity: 'COMMON',
      image: 'grid.webp',
    });
    expect(card.printings.map(p => p.id)).toEqual(['foil']);
    expect(card.sortKey < dfc.sortKey).toBe(true);
    expect(dfc.image).toBe('front.jpg');
    expect(dfc.details?.effect).toContain('Imperial Moth\nFlying');
  });

  it('sorts collector numbers by their digits', () => {
    expect(['10', '2a', '★3', '2'].sort((a, b) => collectorKey(a).localeCompare(collectorKey(b)))).toEqual([
      '2',
      '2a',
      '★3',
      '10',
    ]);
  });
});

describe('magicPrices', () => {
  it('uses the nonfoil price with foil as a variant, or the foil price alone', () => {
    const [katanaRow, mothRow] = magicPrices([katana, moth], 1);
    expect(katanaRow).toMatchObject({ key: 'mtg:NEO-1', market: 0.19, image: 'display.webp' });
    expect(katanaRow.variants).toEqual([{ label: 'Foil', market: 0.28 }]);
    expect(mothRow).toMatchObject({ key: 'mtg:NEO-4', market: 3.1, variants: [] });
  });
});

describe('magicScanCandidates', () => {
  it('reads the modern collector line', () => {
    expect(magicScanCandidates('0123 R\nNEO • EN Daniel Ljunggren')).toEqual(['NEO-123']);
  });

  it("doesn't pair one card's set code with a neighbouring card's number", () => {
    const binder = '0316 R\nThe Lost Caverns\n249/279 R Story Spotlight 4/5\nXLN • EN YEONG-HAO HAN\nLCC • EN';
    expect(magicScanCandidates(binder)).toEqual(['XLN-249', 'XLN-4']);
  });

  it('reads the older "number/total" line and fixes OCR letters', () => {
    expect(magicScanCandidates('O45/274 U\nM20 * EN')).toEqual(['M20-45']);
  });
});
