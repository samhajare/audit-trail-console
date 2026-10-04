import { AuditEventTable } from './AuditEventTable';
import { skipToken } from '@reduxjs/toolkit/query';
import { useSearchParams } from 'react-router-dom';
import { useAuditEventsQuery } from './auditApi';
import { AuditFilterForm } from './AuditFilterForm';
import { parseAuditSearch, serializeAuditSearch } from './searchParams';
import { QueryError } from '../../components/QueryError';
import { useAuditFlag } from '../flags/useAuditFlag';
import { AuditSearchTools } from './AuditSearchTools';

export function AuditExplorerPage() {
  const [params, setParams] = useSearchParams();
  const enhancedSearch = useAuditFlag('audit-new-search');
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
      {enhancedSearch && (
        <AuditSearchTools
          key={`search-tools:${params.toString()}`}
          params={params}
          apply={setParams}
        />
      )}
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
                <AuditEventTable items={data.items} />
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
