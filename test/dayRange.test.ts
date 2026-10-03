import { describe, expect, it } from 'vitest';
import { getDayRange } from '../src/features/dashboard/dayRange';

describe('dashboard calendar day', () => {
  it('uses local midnight boundaries and advances correctly at a year boundary', () => {
    const range = getDayRange(new Date(2026, 11, 31, 23, 59));
    expect(new Date(range.from)).toEqual(new Date(2026, 11, 31, 0, 0, 0, 0));
    expect(new Date(range.to)).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    expect(new Date(range.nextMidnight)).toEqual(
      new Date(2027, 0, 1, 0, 0, 0, 0),
    );
    expect(getDayRange(new Date(range.nextMidnight)).from).toBe(
      new Date(2027, 0, 1).toISOString(),
    );
  });
});
