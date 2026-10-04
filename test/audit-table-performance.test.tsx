import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuditEventTable } from '../src/features/audit/AuditEventTable';
import type { AuditEventSummary } from '../src/types/audit';

describe('bounded audit table rendering', () => {
  it('skips unchanged 100-row renders and displays changed server data', () => {
    let timestampReads = 0;
    const items: AuditEventSummary[] = Array.from(
      { length: 100 },
      (_, index) => ({
        id: `database-${index}`,
        eventId: `producer-${index}`,
        schemaVersion: '1.0',
        eventType: 'USER_LOGIN',
        get timestamp() {
          timestampReads++;
          return '2026-10-04T10:00:00Z';
        },
        createdAt: '2026-10-04T10:01:00Z',
        tenantId: 'tenant-one',
        actor: { id: `actor-${index}` },
        resource: { type: 'user', id: `user-${index}` },
        action: 'login',
        correlationId: `flow-${index}`,
        context: { service: 'identity' },
        metadata: { severity: 'INFO' },
      }),
    );
    const tree = (rows: AuditEventSummary[], label: string) => (
      <MemoryRouter>
        <p>{label}</p>
        <AuditEventTable items={rows} />
      </MemoryRouter>
    );
    const view = render(tree(items, 'Initial parent'));
    expect(screen.getAllByRole('row')).toHaveLength(101);
    expect(screen.getAllByRole('link')).toHaveLength(100);
    expect(screen.getAllByRole('link')[99]).toHaveAttribute(
      'href',
      '/audit/events/database-99',
    );
    const initialReads = timestampReads;
    expect(initialReads).toBeGreaterThanOrEqual(100);
    view.rerender(tree(items, 'Updated parent'));
    expect(screen.getByText('Updated parent')).toBeInTheDocument();
    expect(timestampReads).toBe(initialReads);
    const changed = items.map((item, index) =>
      index === 99 ? { ...item, action: 'changed action' } : item,
    );
    view.rerender(tree(changed, 'New server data'));
    expect(screen.getByText('changed action')).toBeInTheDocument();
    expect(timestampReads).toBeGreaterThan(initialReads);
  });
});
