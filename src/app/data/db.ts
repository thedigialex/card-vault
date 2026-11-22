import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

import { Box, Placement } from '../boxes/layout';
import { CardList, ListEntry } from '../lists/list-models';
import { PriceRow } from '../prices/prices';
import { CatalogCard, InstalledGame, OwnedCard } from './models';

export interface StoredImage {
  url: string;
  blob: Blob;
  savedAt: number;
}

@Injectable({ providedIn: 'root' })
export class VaultDb extends Dexie {
  games!: Table<InstalledGame, string>;
  cards!: Table<CatalogCard, string>;
  owned!: Table<OwnedCard, number>;
  boxes!: Table<Box, number>;
  placements!: Table<Placement, number>;
  prices!: Table<PriceRow, string>;
  lists!: Table<CardList, number>;
  listEntries!: Table<ListEntry, number>;
  images!: Table<StoredImage, string>;

  constructor() {
    super('card-vault');
    this.version(1).stores({
      games: 'id',
      cards: 'id, game, [game+sortKey]',
      owned: '++id, game, cardId, [game+sortKey]',
    });
    this.version(2).stores({
      boxes: '++id, order',
      placements: 'ownedId, boxId',
    });
    this.version(3).upgrade(tx =>
      tx
        .table<Box>('boxes')
        .toCollection()
        .modify(box => {
          box.model ??= 'custom';
          box.color ??= 'blue';
        }),
    );
    this.version(4).stores({
      prices: 'key, game, number',
    });
    this.version(5)
      .stores({
        lists: '++id, order',
        listEntries: '++id, listId, ownedId, [listId+ownedId]',
      })
      .upgrade(async tx => {
        await tx
          .table<Box>('boxes')
          .toCollection()
          .modify(box => {
            box.autoSort ??= true;
          });
        await tx
          .table<Placement>('placements')
          .toCollection()
          .modify(placement => {
            placement.position ??= 0;
          });
      });
    this.version(6).stores({
      images: 'url',
    });
  }
}
