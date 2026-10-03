// Frontend-owned REST types. Dates are ISO strings, not Date instances.
export type AuditEventType =
  | 'USER_LOGIN'
  | 'USER_ROLE_CHANGED'
  | 'DATA_EXPORTED'
  | 'CONFIG_CHANGED'
  | 'PAYMENT_REFUNDED';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface AuditEventSummary {
  /** Database UUID used by GET /audit/events/:id. */
  id: string;
  /** Producer event identifier, distinct from the database id. */
  eventId: string;
  schemaVersion: '1.0';
  eventType: AuditEventType;
  timestamp: string;
  createdAt: string;
  tenantId: string;
  correlationId: string;
  actor: { id: string; email?: string; role?: string };
  resource: { type: string; id: string };
  action: string;
  context: JsonObject;
  metadata: JsonObject;
}

export interface AuditEventDetail extends AuditEventSummary {
  changes: { before: JsonObject | null; after: JsonObject | null };
}

// The backend returns full records for list, detail, and timeline responses.
export type AuditTimelineEvent = AuditEventDetail;

export interface AuditStatistics {
  total: number;
  byEventType: Record<AuditEventType, number>;
}

export interface PaginatedAuditResponse<T = AuditEventDetail> {
  items: T[];
  total: number;
  /** One-based page number. */
  page: number;
  limit: number;
  totalPages: number;
}
