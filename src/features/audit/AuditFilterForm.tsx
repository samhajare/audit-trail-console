import { useState, type FormEvent } from 'react';
import {
  eventTypes,
  filterFields,
  filterKeys,
  parseAuditSearch,
  serializeAuditSearch,
} from './searchParams';

export function AuditFilterForm({
  params,
  apply,
}: {
  params: URLSearchParams;
  apply: (params: URLSearchParams) => void;
}) {
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of [...filterKeys, 'limit']) {
      const value = data.get(key);
      if (typeof value === 'string' && value) next.set(key, value);
    }
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
    <form
      className="panel audit-filters"
      aria-labelledby="filters-heading"
      onSubmit={submit}
    >
      <h2 id="filters-heading">Filter events</h2>
      <p id="filter-help">
        Filters combine with AND. Text values match exactly. Dates use ISO
        format with a time zone, for example 2026-10-04T00:00:00Z.
      </p>
      <div className="filter-grid">
        <label>
          Event type
          <select name="eventType" defaultValue={params.get('eventType') ?? ''}>
            <option value="">All event types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        {filterFields.map(({ key, label }) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type="text"
              maxLength={256}
              defaultValue={params.get(key) ?? ''}
              aria-describedby="filter-help"
            />
          </label>
        ))}
        <label>
          Results per page
          <input
            type="number"
            name="limit"
            min={1}
            max={100}
            step={1}
            required
            defaultValue={params.get('limit') ?? '25'}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Apply filters</button>
    </form>
  );
}
