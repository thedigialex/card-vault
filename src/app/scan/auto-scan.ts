export interface RepeatGuard {
  /** The card added last in auto mode. */
  lastAddedId: string | null;
  /** True once a frame showed no card, meaning the last one was moved away. */
  sawGap: boolean;
}

export const emptyGuard = (): RepeatGuard => ({ lastAddedId: null, sawGap: true });

/**
 * A card held still in front of the camera must not be added over and over, but a feeder may well
 * present two identical cards in a row, so the same card is allowed again once it has left the frame.
 */
export function acceptable(guard: RepeatGuard, candidateId: string): boolean {
  return guard.lastAddedId !== candidateId || guard.sawGap;
}

export function afterFrame(guard: RepeatGuard, foundId: string | null): RepeatGuard {
  return foundId === null ? { ...guard, sawGap: true } : guard;
}

export function afterAdd(cardId: string): RepeatGuard {
  return { lastAddedId: cardId, sawGap: false };
}
