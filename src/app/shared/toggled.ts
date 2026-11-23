/** A copy of the set with `key` flipped in or out, for `signal.update` (signals need a new Set to notice). */
export function toggled<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}
