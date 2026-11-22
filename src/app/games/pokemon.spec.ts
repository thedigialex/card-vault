import { DexCard, PokemonSetInfo, buildPokemonCatalog, pokemonPriceReader, pokemonScanCandidates, rarityCode } from './pokemon';

const sv01: PokemonSetInfo = { id: 'sv01', name: 'Scarlet & Violet', releaseDate: '2023-03-31', code: 'SVI' };
const base1: PokemonSetInfo = { id: 'base1', name: 'Base Set', releaseDate: '1999-01-09' };

const toedscool: DexCard = {
  id: 'sv01-025',
  localId: '025',
  name: 'Toedscool',
  rarity: 'Common',
  category: 'Pokemon',
  hp: 60,
  types: ['Grass'],
  stage: 'Basic',
  image: 'https://assets.tcgdex.net/en/sv/sv01/025',
  attacks: [
    { name: 'Spore', cost: ['Grass'], effect: "Your opponent's Active Pokémon is now Asleep." },
    { name: 'Ram', cost: ['Colorless', 'Colorless'], damage: '10' },
  ],
  variants: { normal: true, reverse: true, holo: false },
  set: { id: 'sv01' },
};

const alakazam: DexCard = {
  id: 'base1-1',
  localId: '1',
  name: 'Alakazam',
  rarity: 'Rare Holo',
  variants: { holo: true, firstEdition: true },
  set: { id: 'base1' },
};

describe('buildPokemonCatalog', () => {
  const sets = new Map([
    ['sv01', sv01],
    ['base1', base1],
  ]);
  const [card, old] = buildPokemonCatalog([toedscool, alakazam], sets);

  it('numbers cards with the printed set code and keeps the TCGdex id', () => {
    expect(card).toMatchObject({
      id: 'pokemon:sv01-025',
      number: 'SVI-025',
      setCode: 'SV01',
      setName: 'SV01 · Scarlet & Violet',
      rarity: 'C',
      image: 'https://assets.tcgdex.net/en/sv/sv01/025/low.webp',
      imageLarge: 'https://assets.tcgdex.net/en/sv/sv01/025/high.webp',
    });
    expect(card.printings.map(p => p.id)).toEqual(['reverse']);
    expect(card.details?.effect).toContain('[CC] Ram 10');
  });

  it('falls back to the set id and pads old numbers', () => {
    expect(old.number).toBe('BASE1-001');
    expect(old.rarity).toBe('RH');
    expect(old.printings.map(p => p.id)).toEqual(['1st']);
    expect(old.sortKey < card.sortKey).toBe(true);
  });

  it('matches Worth the Rip rows on set name and number', () => {
    const read = pokemonPriceReader([card, old]);
    expect(read('025/198', 'Scarlet & Violet')).toBe('SVI-025');
    expect(read('1/102', 'Base Set')).toBe('BASE1-001');
    expect(read('025/198', 'Paldea Evolved')).toBeNull();
  });
});

describe('rarityCode', () => {
  it('uses known tags, then initials', () => {
    expect(rarityCode('Special illustration rare')).toBe('SIR');
    expect(rarityCode('Double rare')).toBe('RR');
    expect(rarityCode('Rare Holo VMAX')).toBe('RHV');
  });
});

describe('pokemonScanCandidates', () => {
  it('reads the Scarlet & Violet collector line and fixes OCR letters', () => {
    expect(pokemonScanCandidates('G SVI EN O25/198')).toEqual(['SVI-025']);
    expect(pokemonScanCandidates('PAL EN 123/193')).toEqual(['PAL-123']);
  });
});
