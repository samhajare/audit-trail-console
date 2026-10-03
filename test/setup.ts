import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { runInThisContext } from 'node:vm';

// React Router uses Node's Request in jsdom; keep its abort signals in
// the same realm as Node's fetch implementation.
globalThis.AbortController = runInThisContext(
  'AbortController',
) as typeof AbortController;
globalThis.AbortSignal = runInThisContext('AbortSignal') as typeof AbortSignal;

afterEach(cleanup);
