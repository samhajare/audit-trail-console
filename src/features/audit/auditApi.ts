import { baseApi } from '../../services/baseApi';
import type {
  AuditEventDetail,
  PaginatedAuditResponse,
} from '../../types/audit';
import type { AuditSearch } from './searchParams';

export const auditApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    auditEvents: builder.query<PaginatedAuditResponse, AuditSearch>({
      query: (params) => ({ url: '/audit/events', params }),
    }),
    auditEventDetail: builder.query<AuditEventDetail, string>({
      query: (id) => `/audit/events/${encodeURIComponent(id)}`,
    }),
  }),
});
export const { useAuditEventsQuery, useAuditEventDetailQuery } = auditApi;
