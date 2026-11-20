export type BoxShape = 'storage' | 'deck' | 'binder';

export interface BoxModel {
  id: string;
  name: string;
  shape: BoxShape;
  rows: number;
  rowCapacity: number;
  note: string;
}

/** A binder holds pages, not rows. */
export function rowWord(shape: BoxShape, plural = false): string {
  const word = shape === 'binder' ? 'page' : 'row';
  return plural ? `${word}s` : word;
}

export function rowTitle(shape: BoxShape): string {
  const word = rowWord(shape);
  return `${word[0].toUpperCase()}${word.slice(1)}`;
}

export const BOX_MODELS: BoxModel[] = [
  { id: 'deck-100', name: 'Deck box', shape: 'deck', rows: 1, rowCapacity: 100, note: '100 cards' },
  { id: 'storage-400', name: '400ct storage box', shape: 'storage', rows: 1, rowCapacity: 400, note: '1 row of 400' },
  { id: 'storage-800', name: '800ct storage box', shape: 'storage', rows: 2, rowCapacity: 400, note: '2 rows of 400' },
  { id: 'storage-1600', name: '1600ct storage box', shape: 'storage', rows: 4, rowCapacity: 400, note: '4 rows of 400' },
  { id: 'storage-3200', name: '3200ct storage box', shape: 'storage', rows: 8, rowCapacity: 400, note: '8 rows of 400' },
  { id: 'binder-360', name: '9-pocket binder', shape: 'binder', rows: 20, rowCapacity: 18, note: '20 pages, 18 per page' },
  { id: 'custom', name: 'Custom', shape: 'storage', rows: 1, rowCapacity: 100, note: 'Your own rows and capacity' },
];

export const CUSTOM_MODEL = 'custom';

export interface BoxColor {
  id: string;
  name: string;
  front: string;
  top: string;
  side: string;
}

export const BOX_COLORS: BoxColor[] = [
  { id: 'slate', name: 'Slate', front: '#4a5568', top: '#718096', side: '#2d3748' },
  { id: 'red', name: 'Red', front: '#c53030', top: '#e53e3e', side: '#9b2c2c' },
  { id: 'orange', name: 'Orange', front: '#c05621', top: '#dd6b20', side: '#9c4221' },
  { id: 'amber', name: 'Amber', front: '#b7791f', top: '#d69e2e', side: '#975a16' },
  { id: 'green', name: 'Green', front: '#2f855a', top: '#38a169', side: '#276749' },
  { id: 'teal', name: 'Teal', front: '#2c7a7b', top: '#319795', side: '#285e61' },
  { id: 'blue', name: 'Blue', front: '#2b6cb0', top: '#3182ce', side: '#2c5282' },
  { id: 'purple', name: 'Purple', front: '#6b46c1', top: '#805ad5', side: '#553c9a' },
  { id: 'pink', name: 'Pink', front: '#b83280', top: '#d53f8c', side: '#97266a' },
];

export const DEFAULT_COLOR = 'blue';

export function boxModel(id: string): BoxModel {
  return BOX_MODELS.find(model => model.id === id) ?? BOX_MODELS[BOX_MODELS.length - 1];
}

export function boxColor(id: string): BoxColor {
  return BOX_COLORS.find(color => color.id === id) ?? BOX_COLORS.find(color => color.id === DEFAULT_COLOR)!;
}

/** Rows and capacity come from the model unless it's the custom one, where the user sets them. */
export function sizeOf(modelId: string, rows: number, rowCapacity: number): { rows: number; rowCapacity: number } {
  const model = boxModel(modelId);
  return model.id === CUSTOM_MODEL ? { rows, rowCapacity } : { rows: model.rows, rowCapacity: model.rowCapacity };
}
