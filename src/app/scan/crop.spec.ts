import { guideInVideo } from './crop';

describe('guideInVideo', () => {
  it('maps a centred guide through object-fit: cover', () => {
    // A 1920x1080 landscape feed shown cover-fit in a 400x800 portrait box: scale 800/1080, sides cropped.
    const box = guideInVideo(
      { width: 1920, height: 1080 },
      { x: 0, y: 100, width: 400, height: 800 },
      { x: 100, y: 300, width: 200, height: 400 },
      0,
    );
    const scale = 800 / 1080;
    const offsetX = (400 - 1920 * scale) / 2;
    expect(box.x).toBeCloseTo((100 - offsetX) / scale);
    expect(box.y).toBeCloseTo(200 / scale);
    expect(box.width).toBeCloseTo(200 / scale);
    expect(box.height).toBeCloseTo(400 / scale);
  });

  it('adds the margin but never leaves the video', () => {
    const box = guideInVideo({ width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
    expect(box).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
