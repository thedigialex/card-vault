import { candidatesFrom, setCodeOf } from './card-codes';

describe('setCodeOf', () => {
  it('keeps everything before the last dash', () => {
    expect(setCodeOf('BT1-084')).toBe('BT1');
    expect(setCodeOf('P-104')).toBe('P');
  });
});

describe('candidatesFrom', () => {
  it('fixes look-alike characters and tries both family lengths', () => {
    expect(candidatesFrom('SR BTl-O84', { families: ['BT', 'ST', 'P'] })).toEqual(['BT1-084']);
    expect(candidatesFrom('5T1 - 03', { families: ['BT', 'ST', 'P'] })).toEqual(['ST1-03']);
  });

  it('offers the unpadded set number when asked', () => {
    expect(candidatesFrom('BD01-005', { families: ['BD'], unpadded: true })).toEqual(['BD01-005', 'BD1-005']);
    expect(candidatesFrom('BD01-005', { families: ['BD'] })).toEqual(['BD01-005']);
  });

  it('reads a one-letter family', () => {
    expect(candidatesFrom('P-104', { families: ['P'] })).toEqual(['P-104']);
  });

  it('keeps only families the game prints', () => {
    expect(candidatesFrom('ZZ1-001', { families: ['BT'] })).toEqual([]);
    expect(candidatesFrom('ZZ1-001')).toContain('ZZ1-001');
  });

  it('ignores text that has no card number in it', () => {
    expect(candidatesFrom('Booster Box — 2026')).toEqual([]);
  });
});
