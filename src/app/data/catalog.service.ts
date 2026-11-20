import { Injectable, computed, inject, signal } from '@angular/core';
import Dexie from 'dexie';

import { gameById } from '../games/games';
import { VaultDb } from './db';
import { CatalogCard, InstalledGame, ownedSortKey } from './models';

const SEARCH_LIMIT = 60;

export interface InstallOptions {
  /** Replaces the remembered set choice for games downloaded set by set. */
  sets?: string[];
  withPrices?: boolean;
}

export interface InstallResult {
  cards: number;
  /** Set when prices came with the card list. */
  priced?: number;
}

function compact(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly db = inject(VaultDb);
  private readonly cache = new Map<string, CatalogCard[]>();
  private readonly index = new Map<string, { card: CatalogCard; code: string; name: string }[]>();

  readonly installed = signal<InstalledGame[]>([]);
  /** False until the first read of the database, so screens don't flash "no games" on startup. */
  readonly loaded = signal(false);
  readonly installing = signal<string | null>(null);
  /** 0-1 while a game that downloads in steps is installing; undefined when it can't tell. */
  readonly progress = signal<number | undefined>(undefined);

  /** Installed games with the names the UI shows, so pages don't each re-join the two. */
  readonly installedGames = computed(() =>
    this.installed().map(installed => {
      const game = gameById(installed.id);
      return { id: installed.id, name: game?.name ?? installed.id, short: game?.shortName ?? game?.name ?? installed.id };
    }),
  );

  constructor() {
    void this.refreshInstalled();
  }

  async refreshInstalled(): Promise<void> {
    this.installed.set(await this.db.games.toArray());
    this.loaded.set(true);
  }

  /** Re-downloading keeps the collection: owned rows point at card ids, which don't change between downloads. */
  async install(gameId: string, options: InstallOptions = {}): Promise<InstallResult> {
    const game = gameById(gameId);
    if (!game) throw new Error(`Unknown game ${gameId}`);
    const previous = await this.db.games.get(gameId);
    const sets = options.sets ?? previous?.sets;
    this.installing.set(gameId);
    this.progress.set(undefined);
    try {
      const download = await game.fetchCatalog({ sets, onProgress: fraction => this.progress.set(fraction) });
      const { cards, prices } = Array.isArray(download) ? { cards: download, prices: undefined } : download;
      const keepPrices = options.withPrices !== false && prices;
      const byId = new Map(cards.map(card => [card.id, card]));
      const now = Date.now();
      await this.db.transaction('rw', [this.db.cards, this.db.games, this.db.owned, this.db.prices], async () => {
        await this.db.cards.where('game').equals(gameId).delete();
        await this.db.cards.bulkPut(cards);
        await this.db.owned
          .where('game')
          .equals(gameId)
          .modify(owned => {
            const card = byId.get(owned.cardId);
            if (card) owned.sortKey = ownedSortKey(card, owned.printingId);
          });
        if (keepPrices) {
          await this.db.prices.where('game').equals(gameId).delete();
          await this.db.prices.bulkPut(prices);
        }
        await this.db.games.put({
          ...previous,
          id: gameId,
          cardCount: cards.length,
          installedAt: now,
          sets,
          ...(keepPrices ? { pricesUpdatedAt: now, pricedCards: prices.length } : {}),
        });
      });
      this.cache.delete(gameId);
      this.index.delete(gameId);
      await this.refreshInstalled();
      return { cards: cards.length, priced: keepPrices ? prices.length : undefined };
    } finally {
      this.installing.set(null);
      this.progress.set(undefined);
    }
  }

  async cardsFor(gameId: string): Promise<CatalogCard[]> {
    let cards = this.cache.get(gameId);
    if (!cards) {
      cards = await this.db.cards.where('[game+sortKey]').between([gameId, Dexie.minKey], [gameId, Dexie.maxKey]).toArray();
      this.cache.set(gameId, cards);
    }
    return cards;
  }

  private async indexFor(gameId: string) {
    let index = this.index.get(gameId);
    if (!index) {
      index = (await this.cardsFor(gameId)).map(card => ({
        card,
        code: compact(card.number),
        name: card.name.toLowerCase(),
      }));
      this.index.set(gameId, index);
    }
    return index;
  }

  async search(gameId: string, query: string): Promise<CatalogCard[]> {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    const code = compact(text);
    const byNumber: CatalogCard[] = [];
    const byName: CatalogCard[] = [];
    for (const row of await this.indexFor(gameId)) {
      if (code && row.code.startsWith(code)) byNumber.push(row.card);
      else if (row.name.includes(text)) byName.push(row.card);
      if (byNumber.length >= SEARCH_LIMIT) break;
    }
    return [...byNumber, ...byName].slice(0, SEARCH_LIMIT);
  }
}
