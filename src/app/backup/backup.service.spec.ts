import 'fake-indexeddb/auto';

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoxService } from '../boxes/box.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { VaultDb } from '../data/db';
import { CatalogCard } from '../data/models';
import { ListService } from '../lists/list.service';
import { PriceService } from '../prices/price.service';
import { BackupService } from './backup.service';

const card = (id: string): CatalogCard =>
  ({ id, game: 'digimon', number: id, setCode: id.split('-')[0], name: id, sortKey: `k${id}`, printings: [] }) as unknown as CatalogCard;

describe('BackupService', () => {
  let db: VaultDb;
  let service: BackupService;
  const install = vi.fn();

  beforeEach(async () => {
    install.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: { installed: signal([{ id: 'digimon', cardCount: 2, installedAt: 1 }]), install } },
        { provide: CollectionService, useValue: { reload: vi.fn() } },
        { provide: BoxService, useValue: { reload: vi.fn() } },
        { provide: ListService, useValue: { reload: vi.fn() } },
        { provide: PriceService, useValue: { reload: vi.fn(), update: vi.fn() } },
      ],
    });
    db = TestBed.inject(VaultDb);
    await db.delete();
    await db.open();
    service = TestBed.inject(BackupService);

    await db.games.put({ id: 'digimon', cardCount: 2, installedAt: 1 });
    await db.cards.bulkPut([card('BT1-001'), card('BT2-005')]);
    await db.owned.bulkAdd([
      { id: 4, game: 'digimon', cardId: 'BT1-001', printingId: 'base', sortKey: 'old', addedAt: 1 },
      { id: 8, game: 'digimon', cardId: 'BT2-005', printingId: 'base', sortKey: 'old', addedAt: 2 },
    ]);
    await db.boxes.add({ id: 2, name: 'Main', rows: 1, rowCapacity: 10, game: '', order: 0, model: 'custom', color: 'blue', autoSort: false });
    await db.placements.add({ ownedId: 8, boxId: 2, row: 0, position: 0 });
    await db.lists.add({ id: 5, name: 'Deck', color: 'blue', icon: 'layers', order: 0, createdAt: 1 });
    await db.listEntries.add({ id: 6, listId: 5, ownedId: 4, addedAt: 1 });
  });

  it('restores a wiped vault with every link intact', async () => {
    const backup = JSON.parse(JSON.stringify(await service.create()));

    await Promise.all([db.owned.clear(), db.boxes.clear(), db.placements.clear(), db.lists.clear(), db.listEntries.clear()]);
    await db.owned.add({ game: 'digimon', cardId: 'BT1-001', printingId: 'base', sortKey: 'x', addedAt: 9 });

    const result = await service.restore(backup);

    expect(result).toEqual({ cards: 2, unmatched: 0, failedGames: [] });
    expect(install).not.toHaveBeenCalled();
    expect((await db.owned.toArray()).map(row => [row.id, row.sortKey])).toEqual([
      [4, 'kBT1-001|base'],
      [8, 'kBT2-005|base'],
    ]);
    expect(await db.placements.toArray()).toEqual([{ ownedId: 8, boxId: 2, row: 0, position: 0 }]);
    expect((await db.listEntries.toArray())[0]).toMatchObject({ listId: 5, ownedId: 4 });
    expect((await db.boxes.toArray())[0].name).toBe('Main');
  });
});
