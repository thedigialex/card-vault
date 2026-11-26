import { Injectable, computed, inject, signal } from '@angular/core';

import { DEFAULT_SORT, SortId, sortEntries } from '../data/card-sort';
import { CollectionService, LibraryEntry } from '../data/collection.service';
import { VaultDb } from '../data/db';
import { copyKey } from '../data/stacks';
import { PriceService } from '../prices/price.service';
import { BoxShape, boxModel, rowTitle, rowWord } from './box-models';
import {
  Box,
  Layout,
  LayoutRow,
  Location,
  Move,
  Placement,
  computeLayout,
  movesFor,
  placementsFrom,
} from './layout';

export type BoxDraft = Omit<Box, 'id' | 'order'>;

export interface BoxStats {
  shape: BoxShape;
  model: string;
  capacity: number;
  used: number;
  fills: number[];
  value: number;
  rowTitle: string;
}

const EMPTY_STATS: BoxStats = {
  shape: 'storage',
  model: '',
  capacity: 1,
  used: 0,
  fills: [],
  value: 0,
  rowTitle: 'Row',
};

@Injectable({ providedIn: 'root' })
export class BoxService {
  private readonly db = inject(VaultDb);
  private readonly collection = inject(CollectionService);
  private readonly prices = inject(PriceService);

  readonly boxes = signal<Box[]>([]);
  private readonly placements = signal(new Map<number, Placement>());

  readonly entriesById = computed(() => new Map(this.collection.entries().map(e => [e.owned.id!, e])));

  readonly layout = computed<Layout>(() => {
    const byId = this.entriesById();
    return computeLayout(
      this.boxes(),
      this.collection.entries().map(e => ({ id: e.owned.id!, game: e.owned.game })),
      this.placements(),
      // Cards already arrive in set order, so only other sorts need the work.
      (box, cards) =>
        !box.sortBy || box.sortBy === DEFAULT_SORT ? cards : sortEntries(cards, box.sortBy, this.prices.priceOf, card => byId.get(card.id)!),
    );
  });

  readonly moves = computed<Move[]>(() => movesFor(this.layout(), this.placements()));

  /** One pass over the layout, so pages don't each filter every row per box. */
  readonly rowsByBox = computed(() => {
    const byBox = new Map<number, LayoutRow[]>();
    for (const row of this.layout().rows) byBox.set(row.boxId, [...(byBox.get(row.boxId) ?? []), row]);
    return byBox;
  });

  readonly statsByBox = computed(() => {
    const byBox = new Map<number, BoxStats>();
    const entries = this.entriesById();
    const rowsByBox = this.rowsByBox();
    for (const box of this.boxes()) {
      const model = boxModel(box.model);
      const rows = rowsByBox.get(box.id!) ?? [];
      const cards = rows.flatMap(row =>
        row.ownedIds.map(id => entries.get(id)?.card).filter(card => !!card),
      );
      byBox.set(box.id!, {
        shape: model.shape,
        model: model.name,
        capacity: box.rows * box.rowCapacity,
        used: rows.reduce((sum, row) => sum + row.ownedIds.length, 0),
        fills: rows.map(row => row.ownedIds.length / box.rowCapacity),
        value: this.prices.valueOf(cards),
        rowTitle: rowTitle(model.shape),
      });
    }
    return byBox;
  });

  readonly unboxed = computed<LibraryEntry[]>(() => {
    const byId = this.entriesById();
    return this.layout()
      .unboxed.map(ownedId => byId.get(ownedId))
      .filter((entry): entry is LibraryEntry => !!entry);
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    const [boxes, placements] = await Promise.all([this.db.boxes.orderBy('order').toArray(), this.db.placements.toArray()]);
    this.boxes.set(boxes);
    this.placements.set(new Map(placements.map(p => [p.ownedId, p])));
  }

  boxById(id: number): Box | undefined {
    return this.boxes().find(box => box.id === id);
  }

  entry(ownedId: number): LibraryEntry | undefined {
    return this.entriesById().get(ownedId);
  }

  locationOf(ownedId: number): Location | undefined {
    return this.layout().locations.get(ownedId);
  }

  rowsOf(boxId: number): LayoutRow[] {
    return this.rowsByBox().get(boxId) ?? [];
  }

  statsOf(boxId: number): BoxStats {
    return this.statsByBox().get(boxId) ?? EMPTY_STATS;
  }

  describe(location: Pick<Location, 'boxId' | 'row'> & { position?: number }): string {
    const box = this.boxById(location.boxId);
    const name = box?.name ?? 'Deleted box';
    const slot = location.position === undefined ? '' : ` · #${location.position + 1}`;
    return `${name} · ${rowTitle(boxModel(box?.model ?? '').shape)} ${location.row + 1}${slot}`;
  }

  async add(draft: BoxDraft): Promise<number> {
    const order = Math.max(-1, ...this.boxes().map(b => b.order)) + 1;
    const id = await this.db.boxes.add({ ...draft, order });
    await this.reload();
    return id;
  }

  async update(id: number, draft: BoxDraft): Promise<void> {
    const wasAuto = this.boxById(id)?.autoSort ?? true;
    // Captured before saving: once the box is hand-sorted with no placements, the layout reads it as empty.
    const rows = this.rowsOf(id);
    await this.db.boxes.update(id, draft);
    // Hand sorting starts from whatever the box held a moment ago, so nothing jumps out of it.
    if (wasAuto && !draft.autoSort) await this.freeze(id, rows);
    await this.reload();
  }

  /** Cards in a deleted box keep their old placement, so the move list tells the user where they went. */
  async remove(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.boxes, this.db.placements, async () => {
      await this.db.boxes.delete(id);
      await this.db.placements.where('boxId').equals(id).delete();
    });
    await this.reload();
  }

  async confirmMoves(): Promise<void> {
    await this.db.transaction('rw', this.db.placements, async () => {
      await this.db.placements.clear();
      await this.db.placements.bulkPut(placementsFrom(this.layout()));
    });
    await this.reload();
  }

  /** Writes the box's current contents down as placements, so a sorted box can become a hand-sorted one. */
  private async freeze(boxId: number, rows: LayoutRow[]): Promise<void> {
    const placements: Placement[] = rows.flatMap(row =>
      row.ownedIds.map((ownedId, position) => ({ ownedId, boxId, row: row.row, position })),
    );
    await this.db.placements.bulkPut(placements);
  }

  /** Drops cards (a stack of copies moves together) into a hand-sorted row at `position`. */
  async place(ownedIds: number[], boxId: number, row: number, position: number): Promise<void> {
    const target = this.rowsOf(boxId).find(r => r.row === row);
    const box = this.boxById(boxId);
    if (!target || !box) return;

    const moving = new Set(ownedIds);
    const ids = target.ownedIds.filter(id => !moving.has(id));
    ids.splice(Math.max(0, Math.min(position, ids.length)), 0, ...ownedIds);
    const kept = ids.slice(0, box.rowCapacity);

    await this.db.transaction('rw', this.db.placements, async () => {
      await this.db.placements.bulkDelete(ownedIds);
      await this.db.placements.bulkPut(
        kept.map((id, index) => ({ ownedId: id, boxId, row, position: index })),
      );
      // Anything squeezed past the row's capacity goes back to the unboxed pile.
      await this.db.placements.bulkDelete(ids.slice(box.rowCapacity));
    });
    await this.reload();
  }

  async unbox(ownedIds: number[]): Promise<void> {
    await this.db.placements.bulkDelete(ownedIds);
    await this.reload();
  }

  /**
   * Files cards into a hand-sorted box: right behind a copy already in it when that row has room, so copies
   * stack, else at the end of the first row with room. Returns how many fit.
   */
  async fileInto(ownedIds: number[], boxId: number): Promise<number> {
    const box = this.boxById(boxId);
    let filed = 0;
    for (const ownedId of ownedIds) {
      if (!box) break;
      const key = this.copyKeyOf(ownedId);
      const rows = this.rowsOf(boxId).filter(r => r.ownedIds.length < box.rowCapacity);
      const twinRow = rows.find(r => r.ownedIds.some(id => id !== ownedId && this.copyKeyOf(id) === key));
      const row = twinRow ?? rows[0];
      if (!row) break;
      const lastTwin = twinRow ? row.ownedIds.map(id => this.copyKeyOf(id)).lastIndexOf(key) : -1;
      await this.place([ownedId], boxId, row.row, lastTwin >= 0 ? lastTwin + 1 : row.ownedIds.length);
      filed++;
    }
    return filed;
  }

  private copyKeyOf(ownedId: number): string | undefined {
    const entry = this.entry(ownedId);
    return entry && copyKey(entry);
  }

  /**
   * Sorted boxes re-file themselves from `sortBy`; a hand-sorted box is rearranged once, row by row,
   * and stays hand-sorted so the user can fine-tune it.
   */
  async sortBox(boxId: number, sortBy: SortId): Promise<void> {
    const box = this.boxById(boxId);
    if (!box) return;
    if (box.autoSort) {
      await this.db.boxes.update(boxId, { sortBy });
      await this.reload();
      return;
    }
    const byId = this.entriesById();
    const ids = this.rowsOf(boxId).flatMap(row => row.ownedIds);
    const sorted = sortEntries(ids, sortBy, this.prices.priceOf, ownedId => byId.get(ownedId)!);
    const placements: Placement[] = sorted.map((ownedId, index) => ({
      ownedId,
      boxId,
      row: Math.floor(index / box.rowCapacity),
      position: index % box.rowCapacity,
    }));
    await this.db.transaction('rw', this.db.boxes, this.db.placements, async () => {
      await this.db.boxes.update(boxId, { sortBy });
      await this.db.placements.bulkPut(placements);
    });
    await this.reload();
  }
}
