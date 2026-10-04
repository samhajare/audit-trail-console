import type { DlqRecord } from '../../types/dlq';

export function dlqEventType(record: DlqRecord): string {
  const event = record.envelope.originalEvent;
  return event &&
    typeof event === 'object' &&
    !Array.isArray(event) &&
    typeof event.eventType === 'string'
    ? event.eventType
    : 'Not provided';
}
