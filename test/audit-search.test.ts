import { describe, expect, it } from 'vitest';
import {
  parseAuditSearch,
  serializeAuditSearch,
} from '../src/features/audit/searchParams';

describe('bookmarked audit searches', () => {
  it.each([
    'page=-1',
    'page=1.5',
    'page=9007199254740992',
    'limit=101',
    'limit=0',
    'page=1&page=2',
    'actor=a&actor=b',
    'eventType=UNKNOWN',
    'from=2026-02-30T12:00:00Z',
    'from=2026-10-04T12:00:00',
    'from=2026-10-04T24:00:00Z',
    `actor=${'a'.repeat(257)}`,
  ])('rejects invalid URL parameters: %s', (search) => {
    expect(parseAuditSearch(new URLSearchParams(search)).error).toEqual(
      expect.any(String),
    );
  });
  it('round-trips exact text and offsets while whitelisting API parameters', () => {
    const parsed = parseAuditSearch(
      new URLSearchParams(
        'actor=+a%2Bb+&from=2024-02-29T12%3A00%3A00%2B05%3A30&tracking=ignored',
      ),
    );
    expect(parsed.query).toEqual({
      actor: ' a+b ',
      from: '2024-02-29T12:00:00+05:30',
      page: 1,
      limit: 25,
    });
    if (!parsed.query) throw new Error('Expected a valid search');
    expect(parseAuditSearch(serializeAuditSearch(parsed.query))).toEqual(
      parsed,
    );
  });
});
