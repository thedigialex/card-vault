import { Box, LayoutCard, Placement, computeLayout, movesFor, placementsFrom } from './layout';

const box = (id: number, rows: number, rowCapacity: number, extra: Partial<Box> = {}): Box => ({
  id,
  name: `Box ${id}`,
  rows,
  rowCapacity,
  game: '',
  order: id,
  model: 'custom',
  color: 'blue',
  autoSort: true,
  ...extra,
});
const cards = (...ids: number[]): LayoutCard[] => ids.map(id => ({ id, game: 'digimon' }));
const placed = (layout: ReturnType<typeof computeLayout>) =>
  new Map<number, Placement>(placementsFrom(layout).map(p => [p.ownedId, p]));

describe('computeLayout', () => {
  it('fills rows then boxes in order and reports what does not fit', () => {
    const layout = computeLayout([box(2, 1, 2, { order: 1 }), box(1, 2, 2, { order: 0 })], cards(1, 2, 3, 4, 5, 6, 7));

    expect(layout.rows.map(r => r.ownedIds)).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(layout.locations.get(5)).toEqual({ boxId: 2, row: 0, position: 0 });
    expect(layout.unboxed).toEqual([7]);
  });

  it('only gives a game box cards of that game', () => {
    const layout = computeLayout(
      [box(1, 1, 5, { game: 'magic' }), box(2, 1, 5)],
      [{ id: 1, game: 'digimon' }, { id: 2, game: 'magic' }],
    );

    expect(layout.rows.map(r => r.ownedIds)).toEqual([[2], [1]]);
  });

  it('keeps a hand-sorted box exactly as placed, in position order', () => {
    const placements = new Map<number, Placement>([
      [3, { ownedId: 3, boxId: 1, row: 0, position: 1 }],
      [1, { ownedId: 1, boxId: 1, row: 0, position: 0 }],
      [2, { ownedId: 2, boxId: 1, row: 1, position: 0 }],
    ]);

    const layout = computeLayout([box(1, 2, 5, { autoSort: false })], cards(1, 2, 3), placements);

    expect(layout.rows.map(r => r.ownedIds)).toEqual([[1, 3], [2]]);
    expect(layout.unboxed).toEqual([]);
  });

  it('leaves cards nobody placed unboxed, and keeps them out of a sorted box that follows', () => {
    const placements = new Map<number, Placement>([[2, { ownedId: 2, boxId: 1, row: 0, position: 0 }]]);

    const layout = computeLayout(
      [box(1, 1, 5, { autoSort: false, order: 0 }), box(2, 1, 1, { order: 1 })],
      cards(1, 2, 3),
      placements,
    );

    expect(layout.rows.map(r => r.ownedIds)).toEqual([[2], [1]]);
    expect(layout.unboxed).toEqual([3]);
  });

  it('drops a placement whose card was removed from the library', () => {
    const placements = new Map<number, Placement>([[9, { ownedId: 9, boxId: 1, row: 0, position: 0 }]]);

    const layout = computeLayout([box(1, 1, 5, { autoSort: false })], cards(1), placements);

    expect(layout.rows.map(r => r.ownedIds)).toEqual([[]]);
    expect(layout.unboxed).toEqual([1]);
  });
});

describe('movesFor', () => {
  it('places every card the first time', () => {
    const moves = movesFor(computeLayout([box(1, 1, 5)], cards(1, 2)), new Map());

    expect(moves).toEqual([
      { ownedId: 1, from: null, to: { boxId: 1, row: 0, position: 0 }, after: null },
      { ownedId: 2, from: null, to: { boxId: 1, row: 0, position: 1 }, after: 1 },
    ]);
  });

  it('inserts a new card and carries the overflow into the next row', () => {
    const boxes = [box(1, 2, 3)];
    const before = placed(computeLayout(boxes, cards(1, 3, 4, 5)));

    const moves = movesFor(computeLayout(boxes, cards(1, 2, 3, 4, 5), before), before);

    expect(moves).toEqual([
      { ownedId: 2, from: null, to: { boxId: 1, row: 0, position: 1 }, after: 1 },
      {
        ownedId: 4,
        from: { ownedId: 4, boxId: 1, row: 0, position: 2 },
        to: { boxId: 1, row: 1, position: 0 },
        after: null,
      },
    ]);
  });

  it('asks to take out a card that no longer fits', () => {
    const before = placed(computeLayout([box(1, 1, 3)], cards(1, 2, 3)));

    const moves = movesFor(computeLayout([box(1, 1, 2)], cards(1, 2, 3), before), before);

    expect(moves).toEqual([
      { ownedId: 3, from: { ownedId: 3, boxId: 1, row: 0, position: 2 }, to: null, after: null },
    ]);
  });

  it('never asks the user to move cards they arranged by hand', () => {
    const boxes = [box(1, 2, 5, { autoSort: false })];
    const placements = new Map<number, Placement>([[1, { ownedId: 1, boxId: 1, row: 1, position: 0 }]]);

    const moves = movesFor(computeLayout(boxes, cards(1, 2), placements), placements);

    expect(moves).toEqual([]);
  });
});
