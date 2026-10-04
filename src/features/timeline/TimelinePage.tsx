import { skipToken } from '@reduxjs/toolkit/query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QueryError } from '../../components/QueryError';
import { useAuditTimelineQuery } from './timelineApi';

function positiveInteger(
  params: URLSearchParams,
  key: string,
  fallback: number,
) {
  const values = params.getAll(key);
  if (values.length === 0) return fallback;
  const value = values[0]!;
  const number = Number(value);
  return values.length === 1 &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(number)
    ? number
    : undefined;
}

export function TimelinePage() {
  const { correlationId } = useParams();
  const [params, setParams] = useSearchParams();
  const page = positiveInteger(params, 'page', 1);
  const limit = positiveInteger(params, 'limit', 25);
  const valid =
    correlationId &&
    correlationId.trim().length > 0 &&
    correlationId.length <= 256 &&
    page !== undefined &&
    limit !== undefined &&
    limit <= 100;
  const result = useAuditTimelineQuery(
    valid ? { correlationId, page, limit } : skipToken,
  );
  const data = result.currentData;
  function goToPage(nextPage: number) {
    setParams({ page: String(nextPage), limit: String(limit) });
  }
  return (
    <div className="correlation-timeline">
      <header>
        <p className="eyebrow">Audit Trail Console</p>
        <h1>Correlation timeline</h1>
        <p className="timeline-correlation">Correlation ID: {correlationId}</p>
        <p>
          Oldest to newest by event timestamp. Times include their recorded time
          zone.
        </p>
        <Link to="/audit/events">Return to audit explorer</Link>
      </header>
      <section
        className="panel"
        aria-label="Timeline results"
        aria-busy={result.isFetching}
      >
        {!valid ? (
          <p role="alert">
            Use a nonblank correlation ID of at most 256 characters, a positive
            page, and a limit from 1 to 100.
          </p>
        ) : (
          <>
            {result.isFetching && (
              <p role="status">Loading correlation timeline…</p>
            )}
            {result.isError ? (
              <QueryError
                title="Timeline"
                error={result.error}
                retry={() => {
                  void result.refetch();
                }}
              />
            ) : data ? (
              <>
                <p>{data.total.toLocaleString()} correlated events</p>
                {data.items.length === 0 ? (
                  <p>
                    {data.total === 0
                      ? 'No events found for this correlation ID.'
                      : 'No events on this page. Return to the first page.'}
                  </p>
                ) : (
                  <ol
                    className="timeline-events"
                    aria-label="Events, oldest to newest"
                    start={(data.page - 1) * data.limit + 1}
                  >
                    {data.items.map((event) => (
                      <li key={event.id}>
                        <time dateTime={event.timestamp}>
                          {event.timestamp}
                        </time>
                        <h2>
                          <Link
                            to={`/audit/events/${encodeURIComponent(event.id)}`}
                          >
                            {event.eventType.replaceAll('_', ' ')}
                          </Link>
                        </h2>
                        <dl className="event-fields">
                          <div>
                            <dt>Actor</dt>
                            <dd>{event.actor.id}</dd>
                          </div>
                          <div>
                            <dt>Action</dt>
                            <dd>{event.action}</dd>
                          </div>
                          <div>
                            <dt>Resource</dt>
                            <dd>
                              {event.resource.type}: {event.resource.id}
                            </dd>
                          </div>
                          <div>
                            <dt>Service</dt>
                            <dd>
                              {typeof event.context.service === 'string'
                                ? event.context.service
                                : 'Not provided'}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ol>
                )}
                <nav
                  className="audit-pagination"
                  aria-label="Timeline pagination"
                >
                  <button
                    type="button"
                    disabled={page <= 1 || result.isFetching}
                    onClick={() => goToPage(page - 1)}
                  >
                    Previous page
                  </button>
                  <span>
                    {data.totalPages === 0
                      ? 'No results'
                      : `Page ${data.page} of ${data.totalPages}`}
                  </span>
                  <button
                    type="button"
                    disabled={page >= data.totalPages || result.isFetching}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next page
                  </button>
                  {data.items.length === 0 && page > 1 && (
                    <button
                      type="button"
                      disabled={result.isFetching}
                      onClick={() => goToPage(1)}
                    >
                      First page
                    </button>
                  )}
                </nav>
              </>
            ) : (
              !result.isFetching && (
                <p role="alert">
                  No timeline data was returned by the service.
                </p>
              )
            )}
          </>
        )}
      </section>
    </div>
  );
}
