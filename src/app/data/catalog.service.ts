import { Injectable, computed, inject, signal } from '@angular/core';
import Dexie from 'dexie';

import { gameById } from '../games/games';
import { VaultDb } from './db';
import { CatalogCard, CatalogDownload, GameDefinition, GameSet, InstalledGame, ownedSortKey } from './models';
import { groupBySet } from './sets';

const SEARCH_LIMIT = 60;
/** Picking sets downloads the whole list once; installing right after reuses it. */
const PREFETCH_TTL_MS = 10 * 60 * 1000;

export interface InstallOptions {
  /** Replaces the remembered set choice; 'all' clears it so new sets arrive by themselves. */
  sets?: string[] | 'all';
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
  private readonly prefetched = new Map<string, { at: number; download: CatalogDownload }>();
  /** Set lists the scanner has looked numbers up in, kept for the session. */
  private readonly scanSetLists = new Map<string, Promise<GameSet[]>>();

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
    const sets = options.sets === 'all' ? undefined : (options.sets ?? previous?.sets);
    this.installing.set(gameId);
    this.progress.set(undefined);
    try {
      const download = game.listSets ? await this.download(game, sets) : (this.takePrefetched(gameId) ?? (await this.download(game)));
      const { prices } = download;
      // Games that come as one download are trimmed to the picked sets here.
      const wanted = new Set(sets);
      const cards = sets && !game.listSets ? download.cards.filter(card => wanted.has(card.setCode)) : download.cards;
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

  /** The sets a game offers: its own list, or the sets found in its full download. */
  async setsFor(gameId: string): Promise<GameSet[]> {
    const game = gameById(gameId);
    if (!game) throw new Error(`Unknown game ${gameId}`);
    if (game.listSets) return game.listSets();
    const download = await this.download(game);
    this.prefetched.set(gameId, { at: Date.now(), download });
    const sorted = [...download.cards].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return groupBySet(sorted, card => card).map(group => ({
      code: group.setCode,
      name: group.setName.replace(`${group.setCode} · `, ''),
      releasedAt: '',
      cardCount: group.items.length,
      kind: '',
      main: true,
      icon: group.items[0].setIcon,
    }));
  }

  /** Which set a scanned number belongs to, so the scanner can offer to download it. */
  async setForScan(gameId: string, number: string): Promise<GameSet | undefined> {
    const game = gameById(gameId);
    if (!game) return undefined;
    if (game.scanSet) return game.scanSet(number);
    // A game installed whole already has every set, so an unknown number there is a misread.
    if (!game.listSets && this.installed().some(row => row.id === gameId && !row.sets)) return undefined;
    let sets = this.scanSetLists.get(gameId);
    if (!sets) {
      sets = this.setsFor(gameId);
      this.scanSetLists.set(gameId, sets);
      sets.catch(() => this.scanSetLists.delete(gameId));
    }
    const prefix = number.slice(0, number.indexOf('-')).toUpperCase();
    return (await sets).find(set => set.code === prefix);
  }

  /** Adds one set to what's downloaded; a game that comes whole and isn't installed yet comes in full. */
  async addSet(gameId: string, setCode: string, withPrices = true): Promise<InstallResult> {
    const game = gameById(gameId);
    const installed = this.installed().find(row => row.id === gameId);
    const sets: string[] | 'all' =
      !game?.listSets && (!installed || !installed.sets) ? 'all' : [...new Set([...(installed?.sets ?? []), setCode])];
    return this.install(gameId, { sets, withPrices });
  }

  private async download(game: GameDefinition, sets?: string[]): Promise<CatalogDownload> {
    const download = await game.fetchCatalog({ sets, onProgress: fraction => this.progress.set(fraction) });
    return Array.isArray(download) ? { cards: download } : download;
  }

  private takePrefetched(gameId: string): CatalogDownload | undefined {
    const hit = this.prefetched.get(gameId);
    this.prefetched.delete(gameId);
    return hit && Date.now() - hit.at < PREFETCH_TTL_MS ? hit.download : undefined;
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
