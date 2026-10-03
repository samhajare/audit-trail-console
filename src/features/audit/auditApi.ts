import { baseApi } from '../../services/baseApi';
import type { PaginatedAuditResponse } from '../../types/audit';
import type { AuditSearch } from './searchParams';

export const auditApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    auditEvents: builder.query<PaginatedAuditResponse, AuditSearch>({
      query: (params) => ({ url: '/audit/events', params }),
    }),
  }),
});
export const { useAuditEventsQuery } = auditApi;
