import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '../src/services/apiError';

describe('transport error normalization', () => {
  it('distinguishes a timeout from an unavailable network', () => {
    expect(
      normalizeApiError({
        status: 'TIMEOUT_ERROR',
        error: 'timeout internals',
      }),
    ).toEqual({
      status: 'TIMEOUT_ERROR',
      kind: 'timeout',
      retryable: true,
      message: 'The request timed out. Please try again.',
    });
  });
  it('preserves actionable token errors while keeping authentication failures non-retryable', () => {
    expect(
      normalizeApiError({
        status: 'CUSTOM_ERROR',
        error: 'Sign in before requesting API data.',
      }),
    ).toMatchObject({
      kind: 'authentication',
      retryable: false,
      message: 'Sign in before requesting API data.',
    });
  });
});
