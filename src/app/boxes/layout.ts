export interface Box {
  id?: number;
  name: string;
  rows: number;
  rowCapacity: number;
  /** '' takes cards from every game. */
  game: string;
  order: number;
  /** A BOX_MODELS id; decides the drawing and, unless custom, the size. */
  model: string;
  /** A BOX_COLORS id. */
  color: string;
  /** Sorted boxes fill themselves from the library; hand-sorted ones keep whatever was dragged in. */
  autoSort: boolean;
}

/** Where a card sits: confirmed moves for a sorted box, the arrangement itself for a hand-sorted one. */
export interface Placement {
  ownedId: number;
  boxId: number;
  row: number;
  position: number;
}

export interface LayoutCard {
  id: number;
  game: string;
}

export interface LayoutRow {
  boxId: number;
  row: number;
  ownedIds: number[];
  auto: boolean;
}

export interface Location {
  boxId: number;
  row: number;
  position: number;
}

export interface Layout {
  rows: LayoutRow[];
  unboxed: number[];
  locations: Map<number, Location>;
}

export interface Move {
  ownedId: number;
  from: Placement | null;
  /** null = the card no longer fits in any box. */
  to: Location | null;
  /** The card it goes right behind; null = front of the row. */
  after: number | null;
}

const byOrder = (a: Box, b: Box) => a.order - b.order;

function emptyRows(box: Box): LayoutRow[] {
  return Array.from({ length: box.rows }, (_, row) => ({ boxId: box.id!, row, ownedIds: [], auto: box.autoSort }));
}

/**
 * `cards` must already be in library order (game, then set, then number). Hand-sorted boxes keep the
 * arrangement in `placements`; sorted boxes then fill themselves, in box order, from whatever is left.
 */
export function computeLayout(boxes: Box[], cards: LayoutCard[], placements = new Map<number, Placement>()): Layout {
  const ordered = [...boxes].sort(byOrder);
  const known = new Set(cards.map(card => card.id));
  const claimed = new Set<number>();
  const rowsByBox = new Map<number, LayoutRow[]>(ordered.map(box => [box.id!, emptyRows(box)]));

  for (const box of ordered.filter(box => !box.autoSort)) {
    const rows = rowsByBox.get(box.id!)!;
    const mine = [...placements.values()]
      .filter(placement => placement.boxId === box.id && known.has(placement.ownedId))
      .sort((a, b) => a.row - b.row || a.position - b.position);
    for (const placement of mine) {
      const row = rows[Math.min(placement.row, box.rows - 1)];
      if (!row || row.ownedIds.length >= box.rowCapacity) continue;
      row.ownedIds.push(placement.ownedId);
      claimed.add(placement.ownedId);
    }
  }

  for (const box of ordered.filter(box => box.autoSort)) {
    const rows = rowsByBox.get(box.id!)!;
    const fits = cards.filter(card => !claimed.has(card.id) && (!box.game || box.game === card.game));
    let next = 0;
    for (const row of rows) {
      const ownedIds = fits.slice(next, next + box.rowCapacity).map(card => card.id);
      next += ownedIds.length;
      row.ownedIds = ownedIds;
      ownedIds.forEach(id => claimed.add(id));
    }
  }

  const rows = ordered.flatMap(box => rowsByBox.get(box.id!)!);
  const locations = new Map<number, Location>();
  for (const row of rows) {
    row.ownedIds.forEach((ownedId, position) => locations.set(ownedId, { boxId: row.boxId, row: row.row, position }));
  }

  return { rows, unboxed: cards.filter(card => !claimed.has(card.id)).map(card => card.id), locations };
}

/**
 * Rows hold cards in sequence, so a card only needs moving when its row changes; neighbours shift on
 * their own. Hand-sorted boxes are already where the user put them, so they never produce moves.
 */
export function movesFor(layout: Layout, placements: Map<number, Placement>): Move[] {
  const moves: Move[] = [];
  const handSorted = new Set(layout.rows.filter(row => !row.auto).map(row => row.boxId));

  for (const row of layout.rows) {
    if (!row.auto) continue;
    row.ownedIds.forEach((ownedId, position) => {
      const from = placements.get(ownedId) ?? null;
      if (from && from.boxId === row.boxId && from.row === row.row) return;
      moves.push({
        ownedId,
        from,
        to: { boxId: row.boxId, row: row.row, position },
        after: position > 0 ? row.ownedIds[position - 1] : null,
      });
    });
  }

  for (const ownedId of layout.unboxed) {
    const from = placements.get(ownedId);
    if (from && !handSorted.has(from.boxId)) moves.push({ ownedId, from, to: null, after: null });
  }
  return moves;
}

export function placementsFrom(layout: Layout): Placement[] {
  return [...layout.locations].map(([ownedId, { boxId, row, position }]) => ({ ownedId, boxId, row, position }));
}
