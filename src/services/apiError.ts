import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { ApiError } from '../types/api';

function httpError(
  status: number,
): Pick<ApiError, 'kind' | 'message' | 'retryable'> {
  switch (status) {
    case 401:
      return {
        kind: 'unauthorized',
        message: 'Your session is not authorized. Please sign in again.',
        retryable: false,
      };
    case 403:
      return {
        kind: 'forbidden',
        message: 'You do not have permission to perform this action.',
        retryable: false,
      };
    case 404:
      return {
        kind: 'not-found',
        message: 'The requested resource was not found.',
        retryable: false,
      };
    case 409:
      return {
        kind: 'conflict',
        message: 'The request conflicts with the current resource state.',
        retryable: false,
      };
    default:
      if (status >= 500 && status <= 599)
        return {
          kind: 'server',
          message: 'The service is unavailable. Please try again later.',
          retryable: true,
        };
      return {
        kind: 'http',
        message: `The request failed (HTTP ${status}).`,
        retryable: false,
      };
  }
}

export function normalizeApiError(error: FetchBaseQueryError): ApiError {
  if (typeof error.status === 'number') {
    return {
      status: error.status,
      httpStatus: error.status,
      ...httpError(error.status),
      data: error.data,
    };
  }
  switch (error.status) {
    case 'FETCH_ERROR':
      return {
        status: error.status,
        kind: 'network',
        message:
          'Unable to reach the service. Check your connection and try again.',
        retryable: true,
      };
    case 'TIMEOUT_ERROR':
      return {
        status: error.status,
        kind: 'timeout',
        message: 'The request timed out. Please try again.',
        retryable: true,
      };
    case 'PARSING_ERROR':
      // A proxy may return HTML for 401/403/5xx. Preserve that HTTP meaning.
      return {
        status: error.status,
        httpStatus: error.originalStatus,
        ...(error.originalStatus >= 200 && error.originalStatus < 300
          ? {
              kind: 'parsing' as const,
              message: 'The service returned an invalid response.',
              retryable: false,
            }
          : httpError(error.originalStatus)),
        data: error.data,
      };
    case 'CUSTOM_ERROR':
      return {
        status: error.status,
        kind: 'authentication',
        message:
          error.error ||
          'Unable to retrieve an access token. Please sign in again.',
        retryable: false,
      };
  }
}
