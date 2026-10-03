import type { SerializedError } from '@reduxjs/toolkit';
import type { ApiError } from '../types/api';

export function QueryError({
  error,
  title,
  retry,
}: {
  error?: ApiError | SerializedError;
  title: string;
  retry: () => void;
}) {
  const message =
    error && 'kind' in error
      ? error.message
      : 'Unable to load this information. Please try again.';
  return (
    <div>
      <p role="alert">{message}</p>
      <button type="button" onClick={retry}>
        Retry {title.toLowerCase()}
      </button>
    </div>
  );
}
