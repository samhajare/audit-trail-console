import type { TokenSession } from '../../auth/tokenSession';
import { createSseParser } from './sseParser';
import type { ConnectionStatus } from './liveSlice';

interface StreamOptions {
  url: string;
  session: TokenSession;
  status: (status: ConnectionStatus, message?: string) => void;
  refresh: () => void;
  sessionEnded: () => void;
}

export function connectAuditStream(options: StreamOptions) {
  let stopped = false;
  let controller: AbortController | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let delay = 3000;
  let failures = 0;
  const seen = new Set<string>();
  function stop() {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    clearTimeout(reconnectTimer);
    clearTimeout(refreshTimer);
    clearTimeout(heartbeatTimer);
    controller?.abort();
    void reader?.cancel().catch(() => {});
    options.status('stopped');
  }
  const unsubscribe = options.session.subscribe(() => {
    stop();
    options.sessionEnded();
  });
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (!stopped) options.refresh();
    }, 500);
  }
  async function run() {
    if (stopped) return;
    options.status(failures ? 'reconnecting' : 'connecting');
    controller = new AbortController();
    try {
      let token: string;
      try {
        token = await options.session.getToken();
      } catch {
        if (!stopped) {
          options.status(
            'error',
            'Unable to obtain an access token. Sign in again and retry.',
          );
        }
        return;
      }
      if (stopped) return;
      heartbeatTimer = setTimeout(() => controller?.abort(), 45000);
      const response = await fetch(options.url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(heartbeatTimer);
      if (stopped) {
        await response.body?.cancel();
        return;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status < 500 && response.status !== 429) {
          options.status(
            'error',
            response.status === 401
              ? 'Please sign in again to resume live activity.'
              : response.status === 403
                ? 'You do not have permission to receive live activity.'
                : 'Live activity is unavailable. Retry after checking access.',
          );
          return;
        }
        throw new Error('Stream unavailable');
      }
      if (
        !response.headers
          .get('Content-Type')
          ?.toLowerCase()
          .startsWith('text/event-stream') ||
        !response.body
      ) {
        await response.body?.cancel();
        options.status('error', 'The service did not return an event stream.');
        return;
      }
      options.status('connected');
      options.refresh(); // The service does not replay events missed while disconnected.
      failures = 0;
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser((message) => {
        if (message.retry !== undefined)
          delay = Math.min(30000, Math.max(1000, message.retry));
        if (message.event !== 'audit-event') return;
        const value: unknown = JSON.parse(message.data);
        if (
          !value ||
          typeof value !== 'object' ||
          !('eventId' in value) ||
          typeof value.eventId !== 'string' ||
          !value.eventId
        )
          throw new Error('Invalid audit notification');
        if (seen.has(value.eventId)) return;
        seen.add(value.eventId);
        if (seen.size > 1000) seen.delete(seen.values().next().value!);
        scheduleRefresh();
      });
      while (!stopped) {
        heartbeatTimer = setTimeout(() => {
          controller?.abort();
          void reader?.cancel().catch(() => {});
        }, 45000);
        const chunk = await reader.read();
        clearTimeout(heartbeatTimer);
        if (stopped) return;
        if (chunk.done) throw new Error('Stream closed');
        parse(decoder.decode(chunk.value, { stream: true }));
      }
    } catch {
      if (!stopped) {
        failures += 1;
        options.status(
          'reconnecting',
          'Live connection interrupted. Reconnecting automatically.',
        );
        reconnectTimer = setTimeout(
          () => {
            void run();
          },
          Math.min(30000, delay * 2 ** Math.min(failures - 1, 4)),
        );
      }
    } finally {
      clearTimeout(heartbeatTimer);
      void reader?.cancel().catch(() => {});
      reader = undefined;
    }
  }
  void run();
  return stop;
}
