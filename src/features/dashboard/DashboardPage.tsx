import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useDashboardStatisticsQuery,
  useLatestAuditActivityQuery,
} from './dashboardApi';
import { getDayRange } from './dayRange';
import { QueryError } from './QueryError';
import type { AuditEventType } from '../../types/audit';
import { LiveActivity } from '../live/LiveActivity';

const eventTypes: { type: AuditEventType; label: string }[] = [
  { type: 'USER_LOGIN', label: 'User login' },
  { type: 'USER_ROLE_CHANGED', label: 'User role changed' },
  { type: 'DATA_EXPORTED', label: 'Data exported' },
  { type: 'CONFIG_CHANGED', label: 'Configuration changed' },
  { type: 'PAYMENT_REFUNDED', label: 'Payment refunded' },
];
const number = new Intl.NumberFormat();
const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown timestamp'
    : dateTime.format(date);
}

export function DashboardPage() {
  const [day, setDay] = useState(() => getDayRange());
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDay(getDayRange()),
      Math.max(0, day.nextMidnight - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [day.nextMidnight]);
  const today = useDashboardStatisticsQuery({ from: day.from, to: day.to });
  const totals = useDashboardStatisticsQuery({});
  const high = useDashboardStatisticsQuery({ severity: 'HIGH' });
  const errors = useDashboardStatisticsQuery({ severity: 'ERROR' });
  const critical = useDashboardStatisticsQuery({ severity: 'CRITICAL' });
  const latest = useLatestAuditActivityQuery();
  const allTimeStatistics = totals.currentData;
  const busy = [today, totals, high, errors, critical, latest].some(
    (query) => query.isFetching,
  );
  const severityFailure = [high, errors, critical].find(
    (query) => query.isError,
  );
  const severityTotal =
    high.currentData && errors.currentData && critical.currentData
      ? high.currentData.total +
        errors.currentData.total +
        critical.currentData.total
      : undefined;
  function refreshSeverity() {
    void high.refetch();
    void errors.refetch();
    void critical.refetch();
  }
  function refresh() {
    setDay(getDayRange());
    void today.refetch();
    void totals.refetch();
    refreshSeverity();
    void latest.refetch();
  }

  return (
    <div className="dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Audit Trail Console</p>
          <h1>Audit dashboard</h1>
          <p>Overview of your tenant’s audit activity.</p>
        </div>
        <button type="button" onClick={refresh} disabled={busy}>
          Refresh dashboard
        </button>
      </div>
      <LiveActivity />
      {busy && <p role="status">Updating dashboard…</p>}
      <div className="dashboard-metrics">
        <section className="panel" aria-labelledby="today-heading">
          <h2 id="today-heading">Events today</h2>
          <p className="metric-caption">
            Calendar day in {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          {today.isError ? (
            <QueryError
              error={today.error}
              title="Events today"
              retry={() => {
                void today.refetch();
              }}
            />
          ) : today.currentData ? (
            <p className="metric-value">
              {number.format(today.currentData.total)}
            </p>
          ) : (
            <p>Loading today’s events…</p>
          )}
        </section>
        <section className="panel" aria-labelledby="severity-heading">
          <h2 id="severity-heading">High-severity events</h2>
          <p className="metric-caption">All time · HIGH, ERROR, CRITICAL</p>
          {severityFailure ? (
            <QueryError
              error={severityFailure.error}
              title="High-severity events"
              retry={refreshSeverity}
            />
          ) : severityTotal !== undefined ? (
            <p className="metric-value">{number.format(severityTotal)}</p>
          ) : (
            <p>Loading high-severity events…</p>
          )}
        </section>
      </div>
      <section className="panel" aria-labelledby="types-heading">
        <h2 id="types-heading">Events by type</h2>
        <p className="metric-caption">All time</p>
        {totals.isError ? (
          <QueryError
            error={totals.error}
            title="Events by type"
            retry={() => {
              void totals.refetch();
            }}
          />
        ) : totals.currentData ? (
          <>
            <p>{number.format(totals.currentData.total)} total events</p>
            {totals.currentData.total === 0 ? (
              <p>No audit events yet.</p>
            ) : (
              <dl className="type-counts">
                {eventTypes.map(({ type, label }) => (
                  <div key={type}>
                    <dt>{label}</dt>
                    <dd>
                      {number.format(allTimeStatistics?.byEventType[type] ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <p>Loading event types…</p>
        )}
      </section>
      <section className="panel" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Latest activity</h2>
        <p className="metric-caption">
          10 most recently recorded events · times shown in your local time zone
        </p>
        {latest.isError ? (
          <QueryError
            error={latest.error}
            title="Latest activity"
            retry={() => {
              void latest.refetch();
            }}
          />
        ) : latest.currentData ? (
          latest.currentData.items.length === 0 ? (
            <p>No recent activity.</p>
          ) : (
            <ul className="activity-list">
              {latest.currentData.items.map((event) => (
                <li key={event.id}>
                  <div className="activity-title">
                    <Link to={`/audit/events/${encodeURIComponent(event.id)}`}>
                      {event.eventType.replaceAll('_', ' ')} — {event.action}
                    </Link>
                    <time dateTime={event.timestamp}>
                      {formatTimestamp(event.timestamp)}
                    </time>
                  </div>
                  <dl className="activity-fields">
                    <div>
                      <dt>Actor</dt>
                      <dd>{event.actor.id}</dd>
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
                    <div>
                      <dt>Severity</dt>
                      <dd>
                        {typeof event.metadata.severity === 'string'
                          ? event.metadata.severity
                          : 'Not provided'}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p>Loading latest activity…</p>
        )}
      </section>
    </div>
  );
}
