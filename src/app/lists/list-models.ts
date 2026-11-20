import { addIcons } from 'ionicons';
import { bookmark, diamond, flame, flash, heart, layers, star, trophy } from 'ionicons/icons';

export interface CardList {
  id?: number;
  name: string;
  /** A BOX_COLORS id, so lists and boxes share one palette. */
  color: string;
  icon: string;
  order: number;
  createdAt: number;
}

export interface ListEntry {
  id?: number;
  listId: number;
  /** A specific copy, so a list can say which box that copy sits in. */
  ownedId: number;
  addedAt: number;
}

export const LIST_ICONS = { layers, star, diamond, flame, heart, trophy, bookmark, flash };

/** Every screen that draws a list badge needs these; the names are the keys above. */
export function registerListIcons(): void {
  addIcons(LIST_ICONS);
}

export const LIST_PRESETS = [
  { name: 'Deck', icon: 'layers', color: 'blue' },
  { name: 'Favourites', icon: 'star', color: 'amber' },
  { name: 'Rare cards', icon: 'diamond', color: 'purple' },
  { name: 'For trade', icon: 'flash', color: 'green' },
];
