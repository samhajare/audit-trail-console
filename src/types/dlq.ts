import type { JsonValue } from './audit';

export interface DlqReplayResponse {
  eventId: string;
  replayId: string;
  status: 'published';
}

export interface DlqFailureEnvelope {
  originalEvent: JsonValue;
  failureReason:
    | 'malformed_json'
    | 'invalid_schema'
    | 'unsupported_schema_version'
    | 'prohibited_credentials'
    | 'transient_persistence'
    | 'permanent_persistence'
    | 'invalid_retry_envelope';
  retryCount: number;
  failedAt: string;
  sourceTopic: string;
  correlationId: string | null;
  retryAt?: string;
  originalPayloadOmitted?: boolean;
  originalPayloadSha256?: string;
}

export interface DlqRecord {
  id: string;
  eventId: string | null;
  tenantId: string | null;
  envelope: DlqFailureEnvelope;
  replayStatus: 'pending' | 'reserved' | 'published' | 'failed';
  createdAt: string;
}
