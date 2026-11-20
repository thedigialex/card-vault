import { Injectable, computed, inject, signal } from '@angular/core';

import { BoxService } from '../boxes/box.service';
import { Location } from '../boxes/layout';
import { CollectionService, LibraryEntry } from '../data/collection.service';
import { VaultDb } from '../data/db';
import { PriceService } from '../prices/price.service';
import { CardList, ListEntry } from './list-models';

export interface ListCard {
  entry: ListEntry;
  card: LibraryEntry;
  /** null means the copy is still in the unboxed pile. */
  location: Location | null;
  where: string;
}

@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly db = inject(VaultDb);
  private readonly collection = inject(CollectionService);
  private readonly boxes = inject(BoxService);
  private readonly prices = inject(PriceService);

  readonly lists = signal<CardList[]>([]);
  readonly entries = signal<ListEntry[]>([]);

  readonly countsByList = computed(() => {
    const counts = new Map<number, number>();
    for (const entry of this.entries()) counts.set(entry.listId, (counts.get(entry.listId) ?? 0) + 1);
    return counts;
  });

  /** Card id -> the lists any owned copy of it is on, for marking catalog tiles. */
  readonly listsByCard = computed(() => {
    const byOwned = this.listsByOwned();
    const byCard = new Map<string, Set<number>>();
    for (const entry of this.collection.entries()) {
      const ids = byOwned.get(entry.owned.id!);
      if (!ids?.length) continue;
      const seen = byCard.get(entry.card.id) ?? new Set<number>();
      ids.forEach(id => seen.add(id));
      byCard.set(entry.card.id, seen);
    }
    return byCard;
  });

  readonly listsById = computed(() => new Map(this.lists().map(list => [list.id!, list])));

  readonly listsByOwned = computed(() => {
    const byOwned = new Map<number, number[]>();
    for (const entry of this.entries()) {
      byOwned.set(entry.ownedId, [...(byOwned.get(entry.ownedId) ?? []), entry.listId]);
    }
    return byOwned;
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    const [lists, entries] = await Promise.all([this.db.lists.orderBy('order').toArray(), this.db.listEntries.toArray()]);
    this.lists.set(lists);
    this.entries.set(entries);
  }

  listsOf(ownedId: number): number[] {
    return this.listsByOwned().get(ownedId) ?? [];
  }

  listsOfCard(cardId: string): number[] {
    return [...(this.listsByCard().get(cardId) ?? [])];
  }

  listById(id: number): CardList | undefined {
    return this.listsById().get(id);
  }

  cardsIn(listId: number): ListCard[] {
    const byOwned = this.collection.entriesByOwned();
    return this.entries()
      .filter(entry => entry.listId === listId)
      .map(entry => {
        const card = byOwned.get(entry.ownedId);
        if (!card) return null;
        const location = this.boxes.locationOf(entry.ownedId) ?? null;
        return { entry, card, location, where: location ? this.boxes.describe(location) : 'Unboxed' };
      })
      .filter((row): row is ListCard => row !== null)
      .sort((a, b) => a.card.owned.sortKey.localeCompare(b.card.owned.sortKey));
  }

  valueOf(listId: number): number {
    return this.prices.valueOf(this.cardsIn(listId).map(row => row.card.card));
  }

  async create(name: string, icon: string, color: string): Promise<number> {
    const order = Math.max(-1, ...this.lists().map(list => list.order)) + 1;
    const id = await this.db.lists.add({ name, icon, color, order, createdAt: Date.now() });
    await this.reload();
    return id;
  }

  async rename(id: number, changes: Partial<CardList>): Promise<void> {
    await this.db.lists.update(id, changes);
    await this.reload();
  }

  async remove(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.lists, this.db.listEntries, async () => {
      await this.db.listEntries.where('listId').equals(id).delete();
      await this.db.lists.delete(id);
    });
    await this.reload();
  }

  async toggle(listId: number, ownedId: number): Promise<boolean> {
    const existing = await this.db.listEntries.where({ listId, ownedId }).first();
    if (existing) await this.db.listEntries.delete(existing.id!);
    else await this.db.listEntries.add({ listId, ownedId, addedAt: Date.now() });
    await this.reload();
    return !existing;
  }

  async removeEntry(entryId: number): Promise<void> {
    await this.db.listEntries.delete(entryId);
    await this.reload();
  }
}
