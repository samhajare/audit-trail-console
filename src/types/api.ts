export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'server'
  | 'network'
  | 'timeout'
  | 'parsing'
  | 'authentication'
  | 'http';

/** Serializable errors returned through RTK Query, never a second Redux slice. */
export interface ApiError {
  status:
    number | 'FETCH_ERROR' | 'TIMEOUT_ERROR' | 'PARSING_ERROR' | 'CUSTOM_ERROR';
  kind: ApiErrorKind;
  message: string;
  /** Present when a server response was received, including invalid JSON. */
  httpStatus?: number;
  /** Advisory only. The base query never retries automatically. */
  retryable: boolean;
  /** Untrusted response data; do not render it directly as an error message. */
  data?: unknown;
}
