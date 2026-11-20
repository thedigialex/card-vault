import { Injectable, computed, inject, signal } from '@angular/core';

import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { VaultDb } from '../data/db';
import { gameById } from '../games/games';
import { PriceRow, RipCard, foldPrices, priceKey, totalValue } from './prices';

const EV_SNAPSHOT = 'https://worththerip.com/ev-snapshot.json';
const SET_CARDS = (setKey: string) => `https://worththerip.com/cards/${setKey}.json`;

interface EvSnapshot {
  results: Record<string, { game?: string; singlesPriced?: number }>;
}

/** Anything with a game and a card number: a catalog card, or a row that carries both. */
export type Priceable = { game: string; number: string };

@Injectable({ providedIn: 'root' })
export class PriceService {
  private readonly db = inject(VaultDb);
  private readonly catalog = inject(CatalogService);
  private readonly collection = inject(CollectionService);

  /** Keyed "game:number", so two games that share a number shape never cross-price. */
  readonly rows = signal(new Map<string, PriceRow>());
  readonly updating = signal<string | null>(null);
  readonly progress = signal(0);

  private readonly markets = computed(
    () => new Map([...this.rows()].map(([key, row]) => [key, row.market])),
  );

  readonly collectionValue = computed(() => this.valueOf(this.collection.entries().map(entry => entry.card)));

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    const rows = await this.db.prices.toArray();
    this.rows.set(new Map(rows.map(row => [row.key, row])));
  }

  priceOf(card: Priceable): number | undefined {
    return this.markets().get(priceKey(card.game, card.number));
  }

  rowFor(card: Priceable): PriceRow | undefined {
    return this.rows().get(priceKey(card.game, card.number));
  }

  valueOf(cards: Priceable[]): number {
    return totalValue(
      cards.map(card => priceKey(card.game, card.number)),
      this.markets(),
    );
  }

  /**
   * Prices come from worththerip.com, which publishes TCGplayer market snapshots per set with no
   * key and open CORS, so the app can read them without a server of its own.
   */
  async update(gameId: string): Promise<number> {
    const priceGame = gameById(gameId)?.priceGame;
    if (!priceGame) throw new Error(`No price source for ${gameId}`);
    this.updating.set(gameId);
    this.progress.set(0);
    try {
      const snapshot = (await (await fetch(EV_SNAPSHOT)).json()) as EvSnapshot;
      const setKeys = Object.entries(snapshot.results ?? {})
        .filter(([, set]) => set.game === priceGame && (set.singlesPriced ?? 0) > 0)
        .map(([key]) => key);

      const updatedAt = Date.now();
      const rows = new Map<string, PriceRow>();
      let done = 0;
      for (const setKey of setKeys) {
        try {
          const response = await fetch(SET_CARDS(setKey));
          if (response.ok) {
            const body = (await response.json()) as { cards?: RipCard[] };
            // A number can appear in several sets (reprints); the first set that lists it wins.
            for (const row of foldPrices(gameId, body.cards ?? [], updatedAt)) {
              if (!rows.has(row.key)) rows.set(row.key, row);
            }
          }
        } catch {
          // One unreachable set shouldn't lose the rest.
        }
        done++;
        this.progress.set(done / setKeys.length);
      }

      const priced = [...rows.values()];
      await this.db.transaction('rw', this.db.prices, this.db.games, async () => {
        await this.db.prices.where('game').equals(gameId).delete();
        await this.db.prices.bulkPut(priced);
        await this.db.games.update(gameId, { pricesUpdatedAt: updatedAt, pricedCards: priced.length });
      });
      await this.reload();
      await this.catalog.refreshInstalled();
      return priced.length;
    } finally {
      this.updating.set(null);
      this.progress.set(0);
    }
  }
}
