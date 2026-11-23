import { Box, Placement } from '../boxes/layout';
import { CatalogCard, InstalledGame, OwnedCard } from '../data/models';
import { CardList, ListEntry } from '../lists/list-models';

export const BACKUP_FORMAT = 'card-vault-backup';
export const BACKUP_VERSION = 1;

/**
 * One owned copy. The card's number, name and set ride along so the file can be read (or shown as someone
 * else's library) without the catalog; `cardId` is what a restore matches on.
 */
export interface BackupCard {
  id: number;
  game: string;
  cardId: string;
  printingId: string;
  addedAt: number;
  number: string;
  name: string;
  setCode: string;
}

export interface BackupGame {
  id: string;
  /** 'all' = the whole game was downloaded. */
  sets: string[] | 'all';
}

export interface VaultBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  games: BackupGame[];
  cards: BackupCard[];
  boxes: Box[];
  placements: Placement[];
  lists: CardList[];
  listEntries: ListEntry[];
}

export interface VaultSnapshot {
  games: InstalledGame[];
  owned: OwnedCard[];
  /** Catalog cards for the owned copies, by card id. */
  cards: Map<string, CatalogCard>;
  boxes: Box[];
  placements: Placement[];
  lists: CardList[];
  listEntries: ListEntry[];
}

export class BackupError extends Error {}

export function buildBackup(vault: VaultSnapshot, now = new Date()): VaultBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    games: vault.games.map(game => ({ id: game.id, sets: game.sets ?? 'all' })),
    cards: vault.owned.map(owned => {
      const card = vault.cards.get(owned.cardId);
      return {
        id: owned.id!,
        game: owned.game,
        cardId: owned.cardId,
        printingId: owned.printingId,
        addedAt: owned.addedAt,
        number: card?.number ?? '',
        name: card?.name ?? '',
        setCode: card?.setCode ?? '',
      };
    }),
    boxes: vault.boxes,
    placements: vault.placements,
    lists: vault.lists,
    listEntries: vault.listEntries,
  };
}

/** "card-vault-2026-11-23-0805.json": the time keeps a second export that day from colliding with the first. */
export function backupFileName(now = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `card-vault-${day}-${two(now.getHours())}${two(now.getMinutes())}.json`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const isText = (value: unknown): value is string => typeof value === 'string';

function arrayOf<T>(data: Record<string, unknown>, key: string, valid: (row: Record<string, unknown>) => boolean): T[] {
  const rows = data[key] ?? [];
  if (!Array.isArray(rows)) throw new BackupError(`The backup's ${key} aren't a list.`);
  return rows.filter(row => isObject(row) && valid(row)) as T[];
}

/**
 * Reads a backup file, dropping rows that are malformed or point at something the file doesn't have, so a
 * hand-edited or truncated file restores what it can instead of failing outright.
 */
export function parseBackup(text: string): VaultBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't a Card Vault backup.");
  }
  if (!isObject(data) || data['format'] !== BACKUP_FORMAT) throw new BackupError("That file isn't a Card Vault backup.");
  const version = data['version'];
  if (typeof version !== 'number' || version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of Card Vault. Update the app first.');
  }

  const games = arrayOf<BackupGame>(
    data,
    'games',
    row => isText(row['id']) && (row['sets'] === 'all' || (Array.isArray(row['sets']) && row['sets'].every(isText))),
  );
  const cards = arrayOf<BackupCard>(
    data,
    'cards',
    row => isId(row['id']) && isText(row['game']) && isText(row['cardId']) && isText(row['printingId']),
  ).map(card => ({
    ...card,
    addedAt: typeof card.addedAt === 'number' ? card.addedAt : Date.now(),
    number: isText(card.number) ? card.number : '',
    name: isText(card.name) ? card.name : '',
    setCode: isText(card.setCode) ? card.setCode : '',
  }));
  const boxes = arrayOf<Box>(
    data,
    'boxes',
    row => isId(row['id']) && isText(row['name']) && isId(row['rows']) && isId(row['rowCapacity']),
  );
  const lists = arrayOf<CardList>(data, 'lists', row => isId(row['id']) && isText(row['name']));

  const ownedIds = new Set(cards.map(card => card.id));
  const boxIds = new Set(boxes.map(box => box.id));
  const listIds = new Set(lists.map(list => list.id));
  const placements = arrayOf<Placement>(
    data,
    'placements',
    row => ownedIds.has(row['ownedId'] as number) && boxIds.has(row['boxId'] as number) && Number.isInteger(row['row']),
  );
  const listEntries = arrayOf<ListEntry>(
    data,
    'listEntries',
    row => isId(row['id']) && ownedIds.has(row['ownedId'] as number) && listIds.has(row['listId'] as number),
  );

  return {
    format: BACKUP_FORMAT,
    version,
    exportedAt: isText(data['exportedAt']) ? data['exportedAt'] : '',
    games,
    cards,
    boxes,
    placements,
    lists,
    listEntries,
  };
}

/**
 * The sets each game needs downloaded for the backup's cards to show: what the backup had downloaded
 * plus every owned card's set, on top of what this phone already has. Games already covered are left out.
 */
export function setsToInstall(backup: VaultBackup, installed: InstalledGame[]): Map<string, string[] | 'all'> {
  const wanted = new Map<string, Set<string> | 'all'>();
  for (const game of backup.games) wanted.set(game.id, game.sets === 'all' ? 'all' : new Set(game.sets));
  for (const card of backup.cards) {
    const sets = wanted.get(card.game) ?? new Set<string>();
    if (sets !== 'all' && card.setCode) sets.add(card.setCode);
    wanted.set(card.game, sets);
  }

  const result = new Map<string, string[] | 'all'>();
  for (const [gameId, sets] of wanted) {
    const here = installed.find(game => game.id === gameId);
    if (here && !here.sets) continue;
    if (sets === 'all') {
      result.set(gameId, 'all');
      continue;
    }
    const have = new Set(here?.sets ?? []);
    if (here && [...sets].every(set => have.has(set))) continue;
    if (!here && !sets.size) continue;
    result.set(gameId, [...new Set([...have, ...sets])]);
  }
  return result;
}
