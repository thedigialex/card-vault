import { groupBySet } from './sets';

const card = (setCode: string, number: string) => ({ setCode, setName: `${setCode} · Set`, number });

describe('groupBySet', () => {
  it('starts a new group when the set code changes', () => {
    const groups = groupBySet([card('BT1', 'BT1-001'), card('BT1', 'BT1-002'), card('BT2', 'BT2-001')], item => item);

    expect(groups.map(group => [group.setCode, group.items.length])).toEqual([
      ['BT1', 2],
      ['BT2', 1],
    ]);
    expect(groups[0].setName).toBe('BT1 · Set');
  });

  it('handles an empty catalog', () => {
    expect(groupBySet([], (item: { setCode: string; setName: string }) => item)).toEqual([]);
  });
});
