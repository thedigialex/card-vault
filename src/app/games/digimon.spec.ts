import { buildDigimonCatalog, cleanSetName, digimonScanCandidates, digimonSortKey } from './digimon';

describe('digimonSortKey', () => {
  const sorted = (numbers: string[]) =>
    [...numbers].sort((a, b) => digimonSortKey(a).localeCompare(digimonSortKey(b)));

  it('orders set numbers and card numbers naturally', () => {
    expect(sorted(['BT10-001', 'BT2-010', 'BT2-002', 'BT1-115'])).toEqual([
      'BT1-115',
      'BT2-002',
      'BT2-010',
      'BT10-001',
    ]);
  });

  it('puts boosters before extra boosters, starters, unknown lines and promos', () => {
    expect(sorted(['P-001', 'ST1-01', 'ZZ1-001', 'EX1-001', 'BT1-001'])).toEqual([
      'BT1-001',
      'EX1-001',
      'ST1-01',
      'ZZ1-001',
      'P-001',
    ]);
  });
});

describe('digimonScanCandidates', () => {
  it('finds card numbers in noisy OCR text and fixes look-alike characters', () => {
    const text = 'Lv.7 Omnimon\n15000 DP\nSR BTl-O84\n[When Digivolving] ...\n5T1 - 03';

    expect(digimonScanCandidates(text)).toEqual(['BT1-084', 'ST1-03']);
  });

  it('offers both zero-padded and plain set numbers', () => {
    expect(digimonScanCandidates('BD01-005 BT01-084')).toEqual(['BD01-005', 'BD1-005', 'BT01-084', 'BT1-084']);
  });

  it('reads promos', () => {
    expect(digimonScanCandidates('P-104')).toEqual(['P-104']);
  });
});

describe('cleanSetName', () => {
  it('drops markers, code prefixes and code suffixes, and title-cases', () => {
    expect(cleanSetName('▹BOOSTER VERSUS ROYAL KNIGHT [BT-13]')).toBe('Booster Versus Royal Knight');
    expect(cleanSetName('EX-14: EXTRA BOOSTER MALEVOLENT VII')).toBe('Extra Booster Malevolent VII');
  });
});

describe('buildDigimonCatalog', () => {
  it('merges alternate printings and titles each set from a name with its own code', () => {
    const [card] = buildDigimonCatalog(
      [
        {
          id: 'BT1-084',
          name: 'Omnimon',
          type: 'Digimon',
          color: 'White',
          rarity: 'sr',
          set_name: ['BT-01: Booster New Evolution', 'BT01-03: Release Special Booster Ver.1.0'],
        },
      ],
      [
        {
          cardNumber: 'BT1-084',
          notes: '▹RELEASE SPECIAL BOOSTER 1.0 [BT01-03]',
          AAs: [{ id: 'BT1-084_P1', type: 'Alternative Art ', note: 'Box promo' }],
        },
      ],
    );

    expect(card).toMatchObject({
      id: 'digimon:BT1-084',
      setCode: 'BT1',
      setName: 'BT1 · Booster New Evolution',
      rarity: 'SR',
      printings: [{ id: 'P1', label: 'Alternative Art', note: 'Box promo' }],
    });
  });
});
