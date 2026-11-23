import { describe, expect, it } from 'vitest';

import { CatalogCard, InstalledGame, OwnedCard } from '../data/models';
import { BackupError, buildBackup, parseBackup, setsToInstall } from './backup';

const card = (id: string, setCode: string): CatalogCard =>
  ({ id, game: 'digimon', number: id, setCode, name: `Card ${id}`, sortKey: id, printings: [] }) as unknown as CatalogCard;

const owned = (id: number, cardId: string): OwnedCard => ({
  id,
  game: 'digimon',
  cardId,
  printingId: 'base',
  sortKey: cardId,
  addedAt: 1,
});

function sample() {
  return buildBackup(
    {
      games: [{ id: 'digimon', cardCount: 2, installedAt: 1, sets: ['BT1'] }],
      owned: [owned(1, 'BT1-001'), owned(2, 'BT2-005')],
      cards: new Map([
        ['BT1-001', card('BT1-001', 'BT1')],
        ['BT2-005', card('BT2-005', 'BT2')],
      ]),
      boxes: [{ id: 7, name: 'Main', rows: 2, rowCapacity: 50, game: '', order: 0, model: 'custom', color: 'blue', autoSort: false }],
      placements: [{ ownedId: 1, boxId: 7, row: 0, position: 0 }],
      lists: [{ id: 3, name: 'Deck', color: 'blue', icon: 'layers', order: 0, createdAt: 1 }],
      listEntries: [{ id: 9, listId: 3, ownedId: 2, addedAt: 1 }],
    },
    new Date('2026-11-23T12:00:00Z'),
  );
}

describe('backup', () => {
  it('round-trips through JSON and keeps readable card info', () => {
    const backup = parseBackup(JSON.stringify(sample()));
    expect(backup.cards).toHaveLength(2);
    expect(backup.cards[1]).toMatchObject({ cardId: 'BT2-005', name: 'Card BT2-005', setCode: 'BT2' });
    expect(backup.placements).toHaveLength(1);
    expect(backup.listEntries).toHaveLength(1);
    expect(backup.exportedAt).toBe('2026-11-23T12:00:00.000Z');
  });

  it('rejects files that are not backups, or are from a newer version', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"cards":[]}')).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ ...sample(), version: 99 }))).toThrow(/newer version/);
  });

  it('drops rows that point at missing copies, boxes or lists', () => {
    const broken = {
      ...sample(),
      cards: [sample().cards[0], { id: 'x' }],
      placements: [...sample().placements, { ownedId: 2, boxId: 7, row: 0, position: 1 }, { ownedId: 1, boxId: 99, row: 0 }],
      listEntries: [{ id: 9, listId: 3, ownedId: 2, addedAt: 1 }],
    };
    const backup = parseBackup(JSON.stringify(broken));
    expect(backup.cards.map(c => c.id)).toEqual([1]);
    expect(backup.placements).toEqual([{ ownedId: 1, boxId: 7, row: 0, position: 0 }]);
    expect(backup.listEntries).toEqual([]);
  });

  it('asks for the backup sets plus every owned card set, minus what is already here', () => {
    const backup = sample();
    expect(setsToInstall(backup, [])).toEqual(new Map([['digimon', ['BT1', 'BT2']]]));

    const partial: InstalledGame[] = [{ id: 'digimon', cardCount: 1, installedAt: 1, sets: ['BT1', 'EX1'] }];
    expect(setsToInstall(backup, partial)).toEqual(new Map([['digimon', ['BT1', 'EX1', 'BT2']]]));

    const whole: InstalledGame[] = [{ id: 'digimon', cardCount: 1, installedAt: 1 }];
    expect(setsToInstall(backup, whole).size).toBe(0);

    const allBackup = { ...backup, games: [{ id: 'digimon', sets: 'all' as const }] };
    expect(setsToInstall(allBackup, partial)).toEqual(new Map([['digimon', 'all']]));
  });
});
