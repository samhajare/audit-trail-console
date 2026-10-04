import { useState, type FormEvent } from 'react';
import {
  filterFields,
  filterKeys,
  parseAuditSearch,
  serializeAuditSearch,
} from './searchParams';

export function AuditSearchTools({
  params,
  apply,
}: {
  params: URLSearchParams;
  apply: (params: URLSearchParams) => void;
}) {
  const [error, setError] = useState('');
  const active = filterKeys.filter((key) => params.getAll(key).some(Boolean));
  function remove(key: string) {
    const next = new URLSearchParams(params);
    next.delete(key);
    next.set('page', '1');
    apply(next);
  }
  function clear() {
    const value = params.get('limit');
    const limit =
      value &&
      /^\d+$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= 1 &&
      Number(value) <= 100 &&
      params.getAll('limit').length === 1
        ? Number(value)
        : 25;
    apply(serializeAuditSearch({ page: 1, limit }));
  }
  function quickSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('correlationId');
    if (typeof value !== 'string' || !value.trim()) {
      setError('Enter a nonblank correlation ID.');
      return;
    }
    const next = new URLSearchParams(params);
    next.set('correlationId', value);
    next.set('page', '1');
    const parsed = parseAuditSearch(next);
    if (!parsed.query) {
      setError(parsed.error);
      return;
    }
    setError('');
    apply(serializeAuditSearch(parsed.query));
  }
  return (
    <section className="panel search-tools" aria-label="Enhanced audit search">
      <h2>Active filters</h2>
      {active.length === 0 ? (
        <p>No filters applied.</p>
      ) : (
        <ul className="filter-chips" aria-label="Applied filters">
          {active.map((key) => {
            const label =
              key === 'eventType'
                ? 'Event type'
                : filterFields.find((field) => field.key === key)!.label;
            return (
              <li key={key}>
                <span>
                  {label}: {params.getAll(key).filter(Boolean).join(', ')}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${label} filter`}
                  onClick={() => remove(key)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={clear}>
        Clear all filters
      </button>
      <form
        className="correlation-quick-search"
        aria-label="Correlation ID quick search"
        onSubmit={quickSearch}
      >
        <label htmlFor="quick-correlation-id">
          Quick correlation ID search
        </label>
        <p id="quick-correlation-help">
          Match an exact correlation ID while keeping the other applied filters.
        </p>
        <div>
          <input
            id="quick-correlation-id"
            name="correlationId"
            type="text"
            maxLength={256}
            defaultValue={params.get('correlationId') ?? ''}
            aria-describedby="quick-correlation-help"
          />
          <button type="submit">Search correlation ID</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
