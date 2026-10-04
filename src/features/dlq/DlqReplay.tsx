import { useEffect, useRef, useState } from 'react';
import { PermissionGate } from '../../auth/PermissionGate';
import { usePermissions } from '../../auth/usePermissions';
import type { DlqRecord } from '../../types/dlq';
import { useReplayDlqEventMutation } from './dlqApi';
import { useAuditFlag } from '../flags/useAuditFlag';

export function DlqReplay({
  record,
  statusUnavailable = false,
}: {
  record: DlqRecord;
  statusUnavailable?: boolean;
}) {
  const enabled = useAuditFlag('audit-dlq-replay');
  if (!enabled) return null;
  return (
    <PermissionGate permission="audit:read">
      <PermissionGate permission="audit:replay">
        <ReplayAction record={record} statusUnavailable={statusUnavailable} />
      </PermissionGate>
    </PermissionGate>
  );
}

function ReplayAction({
  record,
  statusUnavailable,
}: {
  record: DlqRecord;
  statusUnavailable: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [replay, result] = useReplayDlqEventMutation();
  const { has } = usePermissions();
  const inFlight = useRef(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) startButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const unavailable = statusUnavailable
    ? 'Refresh failed event details before attempting replay.'
    : !record.eventId?.trim()
      ? 'This record has no producer event ID.'
      : record.envelope.originalPayloadOmitted
        ? 'The original payload was omitted and cannot be replayed.'
        : record.replayStatus !== 'pending'
          ? 'A replay attempt already exists for this event. Further attempts are blocked.'
          : undefined;
  async function submit() {
    if (
      inFlight.current ||
      unavailable ||
      !has('audit:read') ||
      !has('audit:replay') ||
      !record.eventId
    )
      return;
    inFlight.current = true;
    setConfirming(false);
    try {
      await replay(record.eventId);
    } finally {
      inFlight.current = false;
    }
  }
  const error = result.error;
  const message =
    error && 'kind' in error
      ? error.kind === 'conflict'
        ? 'Replay conflicts with the current event state. It may be unsupported or already attempted.'
        : error.message
      : 'Unable to replay this event.';
  return (
    <section className="panel" aria-label="Replay failed event">
      <h2>Replay failed event</h2>
      <p>
        Publish the original event back to Kafka for normal processing. Only one
        manual replay attempt is allowed.
      </p>
      {unavailable && <p>{unavailable}</p>}
      {result.isLoading && <p role="status">Publishing replay…</p>}
      {result.isSuccess && (
        <p role="status">
          Replay published to Kafka. This does not confirm eventual persistence.
          Replay ID: {result.data.replayId}
        </p>
      )}
      {result.isError && (
        <>
          <p role="alert">{message}</p>
          <p>
            Check the refreshed replay status before considering another
            attempt. A network or service failure may have occurred after the
            attempt was reserved or published.
          </p>
        </>
      )}
      {!confirming && (
        <button
          ref={startButton}
          type="button"
          disabled={!!unavailable || result.isLoading || result.isSuccess}
          onClick={() => setConfirming(true)}
        >
          Replay event
        </button>
      )}
      {confirming && (
        <section aria-label="Confirm replay">
          <h3>Confirm replay</h3>
          <p>
            Replay event {record.eventId}? The service will publish its stored
            original payload without changes.
          </p>
          <button
            ref={confirmButton}
            type="button"
            disabled={!!unavailable || result.isLoading}
            onClick={() => {
              void submit();
            }}
          >
            Confirm replay
          </button>
          <button
            type="button"
            disabled={result.isLoading}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel replay
          </button>
        </section>
      )}
    </section>
  );
}
