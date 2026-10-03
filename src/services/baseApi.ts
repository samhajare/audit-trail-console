import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { env } from '../config/env';
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query';
import type { TokenSession } from '../auth/tokenSession';
import type { ApiError } from '../types/api';
import { normalizeApiError } from './apiError';

const request = fetchBaseQuery({
  baseUrl: env.apiBaseUrl,
  prepareHeaders: async (headers, { extra }) => {
    const token = await (
      extra as { tokenSession: TokenSession }
    ).tokenSession.getToken();
    headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});
export const authenticatedBaseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  ApiError,
  Record<never, never>,
  FetchBaseQueryMeta
> = async (args, api, options) => {
  try {
    const result = await request(args, api, options);
    if (result.error)
      return { error: normalizeApiError(result.error), meta: result.meta };
    return { data: result.data, meta: result.meta };
  } catch (cause) {
    return {
      error: normalizeApiError({
        status: 'CUSTOM_ERROR',
        error:
          cause instanceof Error
            ? cause.message
            : 'Unable to retrieve an access token.',
      }),
    };
  }
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: authenticatedBaseQuery,
  endpoints: () => ({}),
});
