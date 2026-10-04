import { skipToken } from '@reduxjs/toolkit/query';
import { Link, useParams } from 'react-router-dom';
import { QueryError } from '../../components/QueryError';
import { dlqEventType } from './dlqEventType';
import { JsonPanel } from '../audit/JsonPanel';
import { useDlqDetailQuery } from './dlqApi';
import { DlqReplay } from './DlqReplay';

export function DlqDetailPage() {
  const { eventId } = useParams();
  const valid = eventId && eventId.trim().length > 0;
  const result = useDlqDetailQuery(valid ? eventId : skipToken);
  const record = result.currentData;
  const notFound =
    result.error && 'kind' in result.error && result.error.kind === 'not-found';
  return (
    <div className="event-detail">
      <header>
        <p className="eyebrow">Audit Trail Console</p>
        <h1>Failed event details</h1>
        <Link to="/audit/dlq">Return to dead-letter queue</Link>
      </header>
      {!valid ? (
        <p role="alert">
          Use a nonblank producer event ID to view failure details.
        </p>
      ) : result.isError ? (
        <section className="panel">
          <h2>
            {notFound
              ? 'Failed event not found'
              : 'Unable to load failed event'}
          </h2>
          <QueryError
            title="Failed event"
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
        </section>
      ) : !record ? (
        <section className="panel">
          {result.isFetching ? (
            <p role="status">Loading failed event…</p>
          ) : (
            <p role="alert">
              No failed event data was returned by the service.
            </p>
          )}
        </section>
      ) : (
        <>
          {result.isFetching && <p role="status">Updating failed event…</p>}
          <section className="panel" aria-label="Failure summary">
            <h2>Failure summary</h2>
            <dl className="event-fields">
              {[
                ['Event ID', record.eventId ?? 'Not provided'],
                ['Event type', dlqEventType(record)],
                ['Failure reason', record.envelope.failureReason],
                ['Retry count', record.envelope.retryCount],
                [
                  'Correlation ID',
                  record.envelope.correlationId ?? 'Not provided',
                ],
                ['Source topic', record.envelope.sourceTopic],
                ['Database ID', record.id],
                ['Tenant ID', record.tenantId ?? 'Not provided'],
                ['Replay status', record.replayStatus],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <div>
                <dt>Failed at</dt>
                <dd>
                  <time dateTime={record.envelope.failedAt}>
                    {record.envelope.failedAt}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Recorded at</dt>
                <dd>
                  <time dateTime={record.createdAt}>{record.createdAt}</time>
                </dd>
              </div>
            </dl>
          </section>
          <JsonPanel
            title="Original event"
            value={record.envelope.originalEvent}
            description={
              record.envelope.originalPayloadOmitted
                ? 'The service omitted the original payload for credential protection.'
                : 'Failure payload as returned by the service, including server masking.'
            }
          />
        </>
      )}
      {record && (
        <DlqReplay
          key={record.id}
          record={record}
          statusUnavailable={result.isError || result.isFetching}
        />
      )}
    </div>
  );
}
