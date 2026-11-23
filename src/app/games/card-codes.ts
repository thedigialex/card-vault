/** Card numbers in the games we support all look like "BT1-084", "P-104" or "BP01-001". */
export const CARD_NUMBER = /^([A-Z]+)(\d*)-(\d+)$/;

export function setCodeOf(number: string): string {
  return number.slice(0, number.lastIndexOf('-'));
}

export const trimmed = (value: string | null | undefined): string | undefined => value?.trim() || undefined;

export const asText = (value: number | null | undefined): string | undefined =>
  value === null || value === undefined ? undefined : String(value);

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json() as Promise<T>;
}

/** Spaces out requests to APIs that ban bursts. */
export const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A price string as a number; "0" and blanks mean the source has no price. */
export const dollars = (value: string | null | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** OCR reads these as each other, depending on where they sit in a card number. */
const AS_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
const AS_DIGIT: Record<string, string> = {
  O: '0',
  D: '0',
  Q: '0',
  I: '1',
  L: '1',
  '|': '1',
  S: '5',
  B: '8',
  Z: '2',
  G: '6',
  T: '7',
};
const SCAN_PATTERN = /([A-Z0-9|]{1,6})\s?[-–—~]\s?([A-Z0-9|]{2,4})(?![A-Z0-9])/g;

const swap = (value: string, map: Record<string, string>) => [...value].map(character => map[character] ?? character).join('');

/** Letters OCR puts where a digit belongs ("O25" -> "025"). */
export const ocrDigits = (raw: string) => swap(raw, AS_DIGIT);

export interface CodeShape {
  /** Families the game actually prints, e.g. ['BT', 'EX', 'P']; empty accepts any letters. */
  families?: string[];
  /** How many letters the family has; two letters covers both games today. */
  familyLength?: number[];
  /** Also offer the unpadded form, so "BD01-005" matches a catalogued "BD1-005". */
  unpadded?: boolean;
}

/** Card numbers a line of OCR text might be hiding, most likely first; the caller keeps the ones it knows. */
export function candidatesFrom(text: string, shape: CodeShape = {}): string[] {
  const { families, familyLength = [2, 1], unpadded = false } = shape;
  const found = new Set<string>();

  for (const [, left, right] of text.toUpperCase().matchAll(SCAN_PATTERN)) {
    const cardNumber = swap(right, AS_DIGIT);
    if (!/^\d+$/.test(cardNumber)) continue;

    for (const length of familyLength) {
      const family = swap(left.slice(0, length), AS_LETTER);
      const setNumber = swap(left.slice(length), AS_DIGIT);
      if (!/^[A-Z]+$/.test(family) || !/^\d{0,2}$/.test(setNumber)) continue;
      if (families && !families.includes(family)) continue;

      found.add(`${family}${setNumber}-${cardNumber}`);
      if (unpadded && setNumber.startsWith('0')) found.add(`${family}${setNumber.replace(/^0+/, '')}-${cardNumber}`);
    }
  }
  return [...found];
}
