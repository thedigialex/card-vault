import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { BoxService } from '../boxes/box.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { VaultDb } from '../data/db';
import { ownedSortKey } from '../data/models';
import { gameById } from '../games/games';
import { ListService } from '../lists/list.service';
import { PriceService } from '../prices/price.service';
import { VaultBackup, backupFileName, buildBackup, parseBackup, setsToInstall } from './backup';

export interface RestoreResult {
  cards: number;
  /** Copies whose card isn't in the downloaded catalog; they come back if that card list is downloaded later. */
  unmatched: number;
  /** Game downloads that failed or that this version doesn't know. */
  failedGames: string[];
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly db = inject(VaultDb);
  private readonly catalog = inject(CatalogService);
  private readonly collection = inject(CollectionService);
  private readonly boxes = inject(BoxService);
  private readonly lists = inject(ListService);
  private readonly prices = inject(PriceService);

  async create(): Promise<VaultBackup> {
    const db = this.db;
    return db.transaction('r', [db.games, db.owned, db.cards, db.boxes, db.placements, db.lists, db.listEntries], async () => {
      const owned = await db.owned.orderBy('[game+sortKey]').toArray();
      const cards = await db.cards.bulkGet([...new Set(owned.map(row => row.cardId))]);
      return buildBackup({
        games: await db.games.toArray(),
        owned,
        cards: new Map(cards.filter(card => !!card).map(card => [card.id, card])),
        boxes: await db.boxes.toArray(),
        placements: await db.placements.toArray(),
        lists: await db.lists.toArray(),
        listEntries: await db.listEntries.toArray(),
      });
    });
  }

  /** Saves the backup into the phone's Download folder (a browser download in ng serve); returns where it went. */
  async save(): Promise<string> {
    const name = backupFileName();
    const json = JSON.stringify(await this.create());
    if (!Capacitor.isNativePlatform()) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      return name;
    }
    const path = `Download/${name}`;
    await Filesystem.writeFile({ path, data: json, directory: Directory.ExternalStorage, encoding: Encoding.UTF8 });
    return path;
  }

  /** Opens the share sheet (Drive, email, another app); a browser just downloads it. */
  async share(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      await this.save();
      return;
    }
    const name = backupFileName();
    const json = JSON.stringify(await this.create());
    const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: 'Card Vault backup', files: [uri], dialogTitle: 'Save your Card Vault backup' });
    } catch (error) {
      // Closing the share sheet rejects too; that's not a failure.
      if (!/cancel/i.test(String((error as Error)?.message ?? error))) throw error;
    }
  }

  async read(file: File): Promise<VaultBackup> {
    return parseBackup(await file.text());
  }

  /**
   * Replaces this phone's cards, boxes and lists with the backup's. Card lists are downloaded FIRST, so a
   * failed download (no signal) never leaves the vault wiped.
   */
  async restore(backup: VaultBackup, onStep: (text: string) => void = () => undefined): Promise<RestoreResult> {
    const failedGames: string[] = [];
    const downloaded: string[] = [];
    for (const [gameId, sets] of setsToInstall(backup, this.catalog.installed())) {
      const game = gameById(gameId);
      if (!game) {
        failedGames.push(gameId);
        continue;
      }
      onStep(`Downloading ${game.name}…`);
      try {
        await this.catalog.install(gameId, { sets, withPrices: true });
        downloaded.push(gameId);
      } catch (error) {
        console.error(`Restore: installing ${gameId} failed`, error);
        failedGames.push(game.name);
      }
    }

    if (downloaded.length) await this.prices.reload();
    onStep('Restoring your vault…');
    const db = this.db;
    const catalogCards = await db.cards.bulkGet([...new Set(backup.cards.map(card => card.cardId))]);
    const byId = new Map(catalogCards.filter(card => !!card).map(card => [card.id, card]));
    let unmatched = 0;
    const owned = backup.cards.map(card => {
      const match = byId.get(card.cardId);
      if (!match) unmatched++;
      return {
        id: card.id,
        game: card.game,
        cardId: card.cardId,
        printingId: card.printingId,
        addedAt: card.addedAt,
        // Unmatched copies still sort sensibly by number until their catalog arrives.
        sortKey: match ? ownedSortKey(match, card.printingId) : `${card.number}|${card.printingId}`,
      };
    });

    await db.transaction('rw', [db.owned, db.placements, db.boxes, db.lists, db.listEntries], async () => {
      await Promise.all([db.owned.clear(), db.placements.clear(), db.boxes.clear(), db.lists.clear(), db.listEntries.clear()]);
      // Ids are kept as they were, so placements and list entries still point at the right rows.
      await db.owned.bulkAdd(owned);
      await db.boxes.bulkAdd(backup.boxes);
      await db.placements.bulkAdd(backup.placements);
      await db.lists.bulkAdd(backup.lists);
      await db.listEntries.bulkAdd(backup.listEntries);
    });

    await Promise.all([this.collection.reload(), this.boxes.reload(), this.lists.reload()]);
    void this.fetchPrices(downloaded);
    return { cards: owned.length, unmatched, failedGames };
  }

  /** Games whose prices come separately; one at a time, since the price service tracks one update. */
  private async fetchPrices(gameIds: string[]): Promise<void> {
    for (const gameId of gameIds) {
      if (!gameById(gameId)?.priceGame) continue;
      try {
        await this.prices.update(gameId);
      } catch {
        // The Games tab can fetch them later.
      }
    }
  }
}
