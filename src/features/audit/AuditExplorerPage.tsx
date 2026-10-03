import { skipToken } from '@reduxjs/toolkit/query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuditEventsQuery } from './auditApi';
import { AuditFilterForm } from './AuditFilterForm';
import { parseAuditSearch, serializeAuditSearch } from './searchParams';
import { QueryError } from '../../components/QueryError';

const timestampFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown timestamp'
    : timestampFormat.format(date);
}

export function AuditExplorerPage() {
  const [params, setParams] = useSearchParams();
  const parsed = parseAuditSearch(params);
  const query = parsed.query;
  const result = useAuditEventsQuery(query ?? skipToken);
  const data = result.currentData;
  return (
    <div className="audit-explorer">
      <div>
        <p className="eyebrow">Audit Trail Console</p>
        <h1>Audit explorer</h1>
        <p>
          Search your tenant’s audit events. Times are shown in your local time
          zone.
        </p>
      </div>
      <AuditFilterForm
        key={params.toString()}
        params={params}
        apply={setParams}
      />
      {!query ? (
        <section className="panel">
          <h2>Invalid search</h2>
          <p role="alert">{parsed.error}</p>
          <p>Correct the filters and apply them to start at page 1.</p>
        </section>
      ) : (
        <section
          className="panel audit-results"
          aria-labelledby="results-heading"
          aria-busy={result.isFetching}
        >
          <h2 id="results-heading">Audit events</h2>
          {result.isFetching && <p role="status">Loading audit events…</p>}
          {result.isError ? (
            <QueryError
              title="Audit events"
              error={result.error}
              retry={() => {
                void result.refetch();
              }}
            />
          ) : data ? (
            <>
              <p>{data.total.toLocaleString()} matching events</p>
              {data.items.length === 0 ? (
                <p>
                  {data.total === 0
                    ? 'No events match these filters.'
                    : 'No events on this page. Choose a previous page or apply filters to start at page 1.'}
                </p>
              ) : (
                <div
                  className="audit-table-scroll"
                  role="region"
                  aria-label="Audit event table"
                  tabIndex={0}
                >
                  <table className="audit-table">
                    <caption>Audit events, newest recorded first</caption>
                    <thead>
                      <tr>
                        {[
                          'Timestamp',
                          'Event type',
                          'Actor',
                          'Action',
                          'Resource',
                          'Service',
                          'Correlation ID',
                          'Severity',
                        ].map((label) => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((event) => (
                        <tr key={event.id}>
                          <td>
                            <time dateTime={event.timestamp}>
                              {timestamp(event.timestamp)}
                            </time>
                          </td>
                          <td>
                            <Link
                              to={`/audit/events/${encodeURIComponent(event.id)}`}
                            >
                              {event.eventType.replaceAll('_', ' ')}
                            </Link>
                          </td>
                          <td>{event.actor.id}</td>
                          <td>{event.action}</td>
                          <td>
                            {event.resource.type}: {event.resource.id}
                          </td>
                          <td>
                            {typeof event.context.service === 'string'
                              ? event.context.service
                              : 'Not provided'}
                          </td>
                          <td>{event.correlationId}</td>
                          <td>
                            {typeof event.metadata.severity === 'string'
                              ? event.metadata.severity
                              : 'Not provided'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <nav
                className="audit-pagination"
                aria-label="Audit results pagination"
              >
                <button
                  type="button"
                  disabled={query.page <= 1 || result.isFetching}
                  onClick={() =>
                    setParams(
                      serializeAuditSearch({ ...query, page: query.page - 1 }),
                    )
                  }
                >
                  Previous page
                </button>
                <span>
                  {data.totalPages === 0
                    ? 'No result pages'
                    : `Page ${query.page} of ${data.totalPages}`}
                </span>
                <button
                  type="button"
                  disabled={query.page >= data.totalPages || result.isFetching}
                  onClick={() =>
                    setParams(
                      serializeAuditSearch({ ...query, page: query.page + 1 }),
                    )
                  }
                >
                  Next page
                </button>
                {query.page > data.totalPages && query.page > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setParams(serializeAuditSearch({ ...query, page: 1 }))
                    }
                  >
                    First page
                  </button>
                )}
              </nav>
            </>
          ) : (
            !result.isFetching && <p>Audit events are not available.</p>
          )}
        </section>
      )}
    </div>
  );
}
