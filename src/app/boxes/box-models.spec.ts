import { boxColor, boxModel, normalizeHex, sizeOf } from './box-models';

describe('box models', () => {
  it('falls back to the custom model and the default colour', () => {
    expect(boxModel('gone').id).toBe('custom');
    expect(boxColor('gone').id).toBe('blue');
  });

  it('accepts any hex colour and derives its shades', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex('#12345')).toBeNull();
    expect(boxColor('#808080')).toEqual({ id: '#808080', name: '#808080', front: '#808080', top: '#979797', side: '#606060' });
    expect(boxColor('bad').id).toBe('blue');
  });

  it('takes its size from a preset but keeps typed values for a custom box', () => {
    expect(sizeOf('storage-800', 3, 7)).toEqual({ rows: 2, rowCapacity: 400 });
    expect(sizeOf('custom', 3, 7)).toEqual({ rows: 3, rowCapacity: 7 });
  });
});
