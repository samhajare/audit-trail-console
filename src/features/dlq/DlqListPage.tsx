import { skipToken } from '@reduxjs/toolkit/query';
import { Link, useSearchParams } from 'react-router-dom';
import { QueryError } from '../../components/QueryError';
import { dlqEventType } from './dlqEventType';
import { useDlqListQuery } from './dlqApi';

function integer(params: URLSearchParams, key: string, fallback: number) {
  const values = params.getAll(key);
  if (values.length === 0) return fallback;
  const value = values[0]!;
  return values.length === 1 &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
    ? Number(value)
    : undefined;
}

export function DlqListPage() {
  const [params, setParams] = useSearchParams();
  const page = integer(params, 'page', 1);
  const limit = integer(params, 'limit', 25);
  const valid =
    page !== undefined &&
    limit !== undefined &&
    limit <= 100 &&
    Number.isSafeInteger((page - 1) * limit);
  const result = useDlqListQuery(valid ? { page, limit } : skipToken);
  const data = result.currentData;
  function go(next: number) {
    setParams({ page: String(next), limit: String(limit) });
  }
  return (
    <div className="audit-explorer">
      <header>
        <p className="eyebrow">Audit Trail Console</p>
        <h1>Dead-letter queue</h1>
        <p>Failed events for your tenant, newest recorded first.</p>
      </header>
      <section
        className="panel audit-results"
        aria-label="DLQ results"
        aria-busy={result.isFetching}
      >
        {!valid ? (
          <>
            <p role="alert">Use a positive page and a limit from 1 to 100.</p>
            <button
              type="button"
              onClick={() => setParams({ page: '1', limit: '25' })}
            >
              Reset pagination
            </button>
          </>
        ) : (
          <>
            {result.isFetching && (
              <p role="status">Loading dead-letter queue…</p>
            )}
            {result.isError ? (
              <QueryError
                title="Dead-letter queue"
                error={result.error}
                retry={() => {
                  void result.refetch();
                }}
              />
            ) : data ? (
              <>
                <p>{data.total.toLocaleString()} failed events</p>
                {data.items.length === 0 ? (
                  <p>
                    {data.total === 0
                      ? 'No failed events in the dead-letter queue.'
                      : 'No failed events on this page. Return to the first page.'}
                  </p>
                ) : (
                  <div
                    className="audit-table-scroll"
                    role="region"
                    aria-label="Dead-letter queue table"
                    tabIndex={0}
                  >
                    <table className="audit-table">
                      <caption>Failed events, newest recorded first</caption>
                      <thead>
                        <tr>
                          {[
                            'Event ID',
                            'Event type',
                            'Failure reason',
                            'Retry count',
                            'Failed at',
                            'Correlation ID',
                          ].map((label) => (
                            <th key={label} scope="col">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((record) => (
                          <tr key={record.id}>
                            <td>
                              {record.eventId?.trim() ? (
                                <Link
                                  to={`/audit/dlq/${encodeURIComponent(record.eventId)}`}
                                >
                                  {record.eventId}
                                </Link>
                              ) : (
                                'Not provided'
                              )}
                            </td>
                            <td>{dlqEventType(record)}</td>
                            <td>{record.envelope.failureReason}</td>
                            <td>{record.envelope.retryCount}</td>
                            <td>
                              <time dateTime={record.envelope.failedAt}>
                                {record.envelope.failedAt}
                              </time>
                            </td>
                            <td>
                              {record.envelope.correlationId ?? 'Not provided'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <nav className="audit-pagination" aria-label="DLQ pagination">
                  <button
                    type="button"
                    disabled={page <= 1 || result.isFetching}
                    onClick={() => go(page - 1)}
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
                    onClick={() => go(page + 1)}
                  >
                    Next page
                  </button>
                  {data.items.length === 0 && page > 1 && (
                    <button
                      type="button"
                      disabled={result.isFetching}
                      onClick={() => go(1)}
                    >
                      First page
                    </button>
                  )}
                </nav>
              </>
            ) : (
              !result.isFetching && (
                <p role="alert">No DLQ data was returned by the service.</p>
              )
            )}
          </>
        )}
      </section>
    </div>
  );
}
