import { skipToken } from '@reduxjs/toolkit/query';
import { Link, useParams } from 'react-router-dom';
import { QueryError } from '../../components/QueryError';
import { useAuditEventDetailQuery } from './auditApi';
import { JsonPanel } from './JsonPanel';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function EventDetailPage() {
  const { id } = useParams();
  const validId = id && uuidPattern.test(id);
  const result = useAuditEventDetailQuery(validId ? id : skipToken);
  const event = result.currentData;
  const notFound =
    result.error && 'kind' in result.error && result.error.kind === 'not-found';
  return (
    <div className="event-detail">
      <div>
        <p className="eyebrow">Audit Trail Console</p>
        <h1>Event details</h1>
        <nav className="detail-navigation" aria-label="Event detail navigation">
          <Link to="/audit/events">Return to audit explorer</Link>
          <Link to="/">Return to dashboard</Link>
        </nav>
      </div>
      {!validId ? (
        <section className="panel">
          <h2>Invalid event ID</h2>
          <p role="alert">
            Use a valid database event UUID to view event details.
          </p>
        </section>
      ) : result.isError ? (
        <section className="panel">
          <h2>{notFound ? 'Event not found' : 'Unable to load event'}</h2>
          <QueryError
            error={result.error}
            title="Event details"
            retry={() => {
              void result.refetch();
            }}
          />
        </section>
      ) : !event ? (
        <section className="panel">
          {result.isFetching ? (
            <p role="status">Loading event details…</p>
          ) : (
            <p role="alert">No event data was returned by the service.</p>
          )}
        </section>
      ) : (
        <>
          {result.isFetching && <p role="status">Updating event details…</p>}
          <section className="panel" aria-labelledby="event-summary-heading">
            <h2 id="event-summary-heading">Event summary</h2>
            <dl className="event-fields">
              <div>
                <dt>Event ID</dt>
                <dd>{event.eventId}</dd>
              </div>
              <div>
                <dt>Database ID</dt>
                <dd>{event.id}</dd>
              </div>
              <div>
                <dt>Event type</dt>
                <dd>{event.eventType}</dd>
              </div>
              <div>
                <dt>Schema version</dt>
                <dd>{event.schemaVersion}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>
                  <time dateTime={event.timestamp}>{event.timestamp}</time>
                </dd>
              </div>
              <div>
                <dt>Recorded at</dt>
                <dd>
                  <time dateTime={event.createdAt}>{event.createdAt}</time>
                </dd>
              </div>
              <div>
                <dt>Actor ID</dt>
                <dd>{event.actor.id}</dd>
              </div>
              <div>
                <dt>Actor email</dt>
                <dd>{event.actor.email ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt>Actor role</dt>
                <dd>{event.actor.role ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>{event.action}</dd>
              </div>
              <div>
                <dt>Resource type</dt>
                <dd>{event.resource.type}</dd>
              </div>
              <div>
                <dt>Resource ID</dt>
                <dd>{event.resource.id}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>
                  {typeof event.context.service === 'string'
                    ? event.context.service
                    : 'Not provided'}
                </dd>
              </div>
              <div>
                <dt>Tenant ID</dt>
                <dd>{event.tenantId || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Correlation ID</dt>
                <dd>
                  <Link
                    to={`/audit/timeline/${encodeURIComponent(event.correlationId)}`}
                  >
                    {event.correlationId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>
                  {typeof event.metadata.severity === 'string'
                    ? event.metadata.severity
                    : 'Not provided'}
                </dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="changes-heading">
            <h2 id="changes-heading">Before and after</h2>
            <p>
              Snapshots as returned by the service. A null snapshot means no
              snapshot was provided; an empty object is a provided snapshot with
              no fields.
            </p>
            <div className="snapshot-grid">
              <JsonPanel
                title="Before"
                value={event.changes.before}
                description={
                  event.changes.before === null
                    ? 'No before snapshot was provided.'
                    : undefined
                }
              />
              <JsonPanel
                title="After"
                value={event.changes.after}
                description={
                  event.changes.after === null
                    ? 'No after snapshot was provided.'
                    : undefined
                }
              />
            </div>
          </section>
          <div className="snapshot-grid">
            <JsonPanel title="Context" value={event.context} />
            <JsonPanel title="Metadata" value={event.metadata} />
          </div>
          <section className="panel" aria-label="Raw event response">
            <details>
              <summary>Raw JSON</summary>
              <p>The complete event response, including any server masking.</p>
              <pre tabIndex={0} aria-label="Raw event JSON">
                <code>{JSON.stringify(event, null, 2)}</code>
              </pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
