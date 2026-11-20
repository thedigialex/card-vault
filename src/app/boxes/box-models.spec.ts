import { boxColor, boxModel, sizeOf } from './box-models';

describe('box models', () => {
  it('falls back to the custom model and the default colour', () => {
    expect(boxModel('gone').id).toBe('custom');
    expect(boxColor('gone').id).toBe('blue');
  });

  it('takes its size from a preset but keeps typed values for a custom box', () => {
    expect(sizeOf('storage-800', 3, 7)).toEqual({ rows: 2, rowCapacity: 400 });
    expect(sizeOf('custom', 3, 7)).toEqual({ rows: 3, rowCapacity: 7 });
  });
});
