import { acceptable, afterAdd, afterFrame, emptyGuard } from './auto-scan';

describe('auto scan repeat guard', () => {
  it('accepts the first card', () => {
    expect(acceptable(emptyGuard(), 'digimon:BT1-010')).toBe(true);
  });

  it('refuses the same card while it is still in frame', () => {
    const guard = afterAdd('digimon:BT1-010');

    expect(acceptable(guard, 'digimon:BT1-010')).toBe(false);
    expect(acceptable(guard, 'digimon:BT1-011')).toBe(true);
  });

  it('accepts the same card again once it has left the frame', () => {
    const guard = afterFrame(afterAdd('digimon:BT1-010'), null);

    expect(acceptable(guard, 'digimon:BT1-010')).toBe(true);
  });

  it('keeps refusing while the card stays visible', () => {
    const guard = afterFrame(afterAdd('digimon:BT1-010'), 'digimon:BT1-010');

    expect(acceptable(guard, 'digimon:BT1-010')).toBe(false);
  });
});
