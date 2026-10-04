import { baseApi } from '../../services/baseApi';
import type {
  AuditTimelineEvent,
  PaginatedAuditResponse,
} from '../../types/audit';

export interface TimelineQuery {
  correlationId: string;
  page: number;
  limit: number;
}

const timelineApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    auditTimeline: builder.query<
      PaginatedAuditResponse<AuditTimelineEvent>,
      TimelineQuery
    >({
      query: ({ correlationId, page, limit }) => ({
        url: `/audit/timeline/${encodeURIComponent(correlationId)}`,
        params: { page, limit },
      }),
    }),
  }),
});

export const { useAuditTimelineQuery } = timelineApi;
