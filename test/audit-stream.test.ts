import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTokenSession } from '../src/auth/tokenSession';
import { connectAuditStream } from '../src/features/live/auditStream';
import { createSseParser } from '../src/features/live/sseParser';

const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup(fetch: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  const getToken = vi.fn(async () => 'stream-token');
  session.setProvider(getToken);
  const status = vi.fn();
  const refresh = vi.fn();
  const sessionEnded = vi.fn();
  const stop = connectAuditStream({
    url: 'http://localhost:3000/audit/stream',
    session,
    status,
    refresh,
    sessionEnded,
  });
  stops.push(stop);
  return { session, status, refresh, sessionEnded, getToken, stop };
}
function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel,
  });
  return {
    response: new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    send: (value: string) =>
      controller.enqueue(new TextEncoder().encode(value)),
    close: () => controller.close(),
    cancel,
  };
}
const flush = () => vi.advanceTimersByTimeAsync(0);
describe('SSE framing', () => {
  it('handles split CRLF, comments, multiline data, default events and retry', () => {
    const receive = vi.fn();
    const parse = createSseParser(receive);
    for (const chunk of [
      ': heartbeat\r',
      '\nevent: audit-',
      'event\r\ndata: {\r\ndata: "eventId":"one"}\r\nretry: 3000\r',
      '\n\r',
      '\n',
    ])
      parse(chunk);
    expect(receive).toHaveBeenCalledExactlyOnceWith({
      event: 'audit-event',
      data: '{\n"eventId":"one"}',
      retry: 3000,
    });
    parse('data: next\n\n');
    expect(receive.mock.calls[1]![0]).toEqual({
      event: 'message',
      data: 'next',
      retry: undefined,
    });
  });
  it('bounds message size and does not dispatch unfinished frames', () => {
    const receive = vi.fn();
    const parse = createSseParser(receive);
    parse('data: unfinished');
    expect(receive).not.toHaveBeenCalled();
    expect(() => parse('x'.repeat(1_048_576))).toThrow('too large');
  });
});
describe('authenticated stream lifecycle', () => {
  it('reports token retrieval errors without sending a request', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const session = createTokenSession();
    session.setProvider(async () => {
      throw new Error('SDK unavailable');
    });
    const status = vi.fn();
    stops.push(
      connectAuditStream({
        url: 'http://localhost:3000/audit/stream',
        session,
        status,
        refresh: vi.fn(),
        sessionEnded: vi.fn(),
      }),
    );
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(
      'error',
      expect.stringContaining('access token'),
    );
  });
  it('does not connect after unmount while a token request is pending', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    let resolve!: (token: string) => void;
    const session = createTokenSession();
    session.setProvider(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const stop = connectAuditStream({
      url: 'http://localhost:3000/audit/stream',
      session,
      status: vi.fn(),
      refresh: vi.fn(),
      sessionEnded: vi.fn(),
    });
    stops.push(stop);
    stop();
    resolve('late-token');
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reconnects a stalled read after the heartbeat timeout', async () => {
    const source = stream();
    const next = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(source.response)
      .mockResolvedValueOnce(next.response);
    const { status } = setup(fetch);
    await flush();
    await vi.advanceTimersByTimeAsync(45000);
    expect(source.cancel).toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('reconnecting', expect.any(String));
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([429, 503])('retries HTTP %s with bounded delay', async (code) => {
    const next = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: code }))
      .mockResolvedValueOnce(next.response);
    setup(fetch);
    await flush();
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('sends bearer headers without URL tokens, batches notifications and deduplicates eventIds', async () => {
    const source = stream();
    const fetch = vi.fn(async () => source.response);
    const { refresh, status } = setup(fetch);
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/audit/stream',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer stream-token',
          Accept: 'text/event-stream',
        },
      }),
    );
    expect(status).toHaveBeenLastCalledWith('connected');
    expect(refresh).toHaveBeenCalledTimes(1);
    source.send(
      'event: heartbeat\ndata: {}\n\nevent: audit-event\ndata: {"eventId":"one"}\n\nevent: audit-event\ndata: {"eventId":"one"}\n\nevent: audit-event\ndata: {"eventId":"two"}\n\n',
    );
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(2);
    source.send('event: audit-event\ndata: {"eventId":"one"}\n\n');
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('reconnects after EOF with a fresh token, refreshes REST, and retains deduplication', async () => {
    const first = stream();
    const second = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response);
    const { refresh, getToken, status } = setup(fetch);
    await flush();
    first.send('event: audit-event\nretry: 1000\ndata: {"eventId":"one"}\n\n');
    await vi.advanceTimersByTimeAsync(500);
    first.close();
    await flush();
    expect(status).toHaveBeenLastCalledWith('reconnecting', expect.any(String));
    getToken.mockResolvedValue('renewed-token');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1].headers.Authorization).toBe(
      'Bearer renewed-token',
    );
    expect(refresh).toHaveBeenCalledTimes(3);
    second.send('event: audit-event\ndata: {"eventId":"one"}\n\n');
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 404])(
    'shows HTTP %s without retrying automatically',
    async (code) => {
      const fetch = vi.fn(async () => new Response('', { status: code }));
      const { status } = setup(fetch);
      await flush();
      expect(status).toHaveBeenLastCalledWith('error', expect.any(String));
      await vi.advanceTimersByTimeAsync(60000);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('backs off repeated network failures and stops scheduled reconnects', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    const { stop } = setup(fetch);
    await flush();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['suspend', 'change'])(
    'closes immediately on session %s and cancels pending refreshes',
    async (change) => {
      const source = stream();
      const { session, refresh, sessionEnded, status } = setup(
        vi.fn(async () => source.response),
      );
      await flush();
      source.send('event: audit-event\ndata: {"eventId":"one"}\n\n');
      await flush();
      if (change === 'suspend') session.suspend();
      else session.setProvider(async () => 'other');
      expect(source.cancel).toHaveBeenCalledTimes(1);
      expect(sessionEnded).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenLastCalledWith('stopped');
      await vi.advanceTimersByTimeAsync(60000);
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );
  it('does not send an anonymous request when token retrieval fails', async () => {
    const fetch = vi.fn();
    const { session, status } = setup(fetch);
    session.setProvider(undefined);
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('stopped');
  });
  it('rejects invalid content types and recovers malformed JSON by reconnecting', async () => {
    const source = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(source.response)
      .mockResolvedValueOnce(
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      );
    const { status } = setup(fetch);
    await flush();
    source.send('event: audit-event\ndata: not JSON\n\n');
    await flush();
    expect(source.cancel).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(status).toHaveBeenLastCalledWith(
      'error',
      'The service did not return an event stream.',
    );
  });
  it('cancels the body and prevents updates on unmount while a read is pending', async () => {
    const source = stream();
    const { stop, refresh } = setup(vi.fn(async () => source.response));
    await flush();
    stop();
    expect(source.cancel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
