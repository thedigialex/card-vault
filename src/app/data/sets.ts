export interface SetLike {
  setCode: string;
  setName: string;
}

export interface SetGroup<T> {
  setCode: string;
  setName: string;
  items: T[];
}

/** `items` must already be in catalog order, where a set's cards sit together. */
export function groupBySet<T>(items: T[], of: (item: T) => SetLike): SetGroup<T>[] {
  const groups: SetGroup<T>[] = [];
  for (const item of items) {
    const { setCode, setName } = of(item);
    let group = groups.at(-1);
    if (!group || group.setCode !== setCode) {
      group = { setCode, setName, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
