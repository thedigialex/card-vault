import { LibraryEntry } from './collection.service';

export interface Stack<T> {
  key: string;
  items: T[];
}

/** Copies of one card in one printing; alt printings are physically different cards. */
export function copyKey(entry: LibraryEntry): string {
  return `${entry.owned.cardId}|${entry.owned.printingId}`;
}

/**
 * Collapses copies into one tile. `adjacentOnly` keeps a box row honest: copies that sit apart in a
 * hand-sorted row stay apart, because that is where they physically are.
 */
export function stacksOf<T>(items: T[], entryOf: (item: T) => LibraryEntry, adjacentOnly: boolean): Stack<T>[] {
  const stacks: Stack<T>[] = [];
  const byKey = new Map<string, Stack<T>>();
  for (const item of items) {
    const key = copyKey(entryOf(item));
    const last = stacks.at(-1);
    const target = adjacentOnly ? (last?.key === key ? last : undefined) : byKey.get(key);
    if (target) {
      target.items.push(item);
      continue;
    }
    const stack = { key, items: [item] };
    stacks.push(stack);
    byKey.set(key, stack);
  }
  return stacks;
}
