import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEventSummary } from '../../types/audit';

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

export const AuditEventTable = memo(function AuditEventTable({
  items,
}: {
  items: readonly AuditEventSummary[];
}) {
  return (
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
          {items.map((event) => (
            <tr key={event.id}>
              <td>
                <time dateTime={event.timestamp}>
                  {timestamp(event.timestamp)}
                </time>
              </td>
              <td>
                <Link to={`/audit/events/${encodeURIComponent(event.id)}`}>
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
  );
});
