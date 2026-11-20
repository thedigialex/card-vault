import { Injectable, computed, inject, signal } from '@angular/core';

import { VaultDb } from './db';
import { CatalogCard, OwnedCard, ownedSortKey, printingLabel } from './models';

export interface LibraryEntry {
  owned: OwnedCard;
  card: CatalogCard;
  printing: string;
}

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly db = inject(VaultDb);

  readonly entries = signal<LibraryEntry[]>([]);

  readonly entriesByOwned = computed(() => new Map(this.entries().map(entry => [entry.owned.id!, entry])));

  readonly countsByCard = computed(() => {
    const counts = new Map<string, number>();
    for (const { owned } of this.entries()) counts.set(owned.cardId, (counts.get(owned.cardId) ?? 0) + 1);
    return counts;
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    const owned = await this.db.owned.orderBy('[game+sortKey]').toArray();
    const cards = await this.db.cards.bulkGet(owned.map(o => o.cardId));
    const entries: LibraryEntry[] = [];
    owned.forEach((o, i) => {
      const card = cards[i];
      if (card) entries.push({ owned: o, card, printing: printingLabel(card, o.printingId) });
    });
    this.entries.set(entries);
  }

  async add(card: CatalogCard, printingId: string): Promise<number> {
    const ownedId = await this.db.owned.add({
      game: card.game,
      cardId: card.id,
      printingId,
      sortKey: ownedSortKey(card, printingId),
      addedAt: Date.now(),
    });
    await this.reload();
    return ownedId;
  }

  async remove(ownedId: number): Promise<void> {
    await this.db.transaction('rw', this.db.owned, this.db.placements, this.db.listEntries, async () => {
      await this.db.owned.delete(ownedId);
      await this.db.placements.delete(ownedId);
      await this.db.listEntries.where('ownedId').equals(ownedId).delete();
    });
    await this.reload();
  }
}
