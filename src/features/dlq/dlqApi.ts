import { baseApi } from '../../services/baseApi';
import type { PaginatedAuditResponse } from '../../types/audit';
import type { DlqRecord, DlqReplayResponse } from '../../types/dlq';

const dlqApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Dlq'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      dlqList: builder.query<
        PaginatedAuditResponse<DlqRecord>,
        { page: number; limit: number }
      >({
        query: (params) => ({ url: '/audit/dlq', params }),
        providesTags: ['Dlq'],
      }),
      dlqDetail: builder.query<DlqRecord, string>({
        query: (eventId) => `/audit/dlq/${encodeURIComponent(eventId)}`,
        providesTags: ['Dlq'],
      }),
      replayDlqEvent: builder.mutation<DlqReplayResponse, string>({
        query: (eventId) => ({
          url: `/audit/dlq/${encodeURIComponent(eventId)}/replay`,
          method: 'POST',
          body: {},
        }),
        invalidatesTags: ['Dlq'],
      }),
    }),
  });
export const { useDlqListQuery, useDlqDetailQuery, useReplayDlqEventMutation } =
  dlqApi;
