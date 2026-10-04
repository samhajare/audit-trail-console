import { baseApi } from '../../services/baseApi';
import type {
  AuditStatistics,
  PaginatedAuditResponse,
} from '../../types/audit';

export interface DashboardStatisticsFilters {
  from?: string;
  to?: string;
  severity?: string;
}

export const dashboardApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Dashboard'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      dashboardStatistics: builder.query<
        AuditStatistics,
        DashboardStatisticsFilters
      >({
        query: (params) => ({ url: '/audit/statistics', params }),
        providesTags: ['Dashboard'],
      }),
      latestAuditActivity: builder.query<PaginatedAuditResponse, void>({
        query: () => ({ url: '/audit/events', params: { page: 1, limit: 10 } }),
        providesTags: ['Dashboard'],
      }),
    }),
  });

export const { useDashboardStatisticsQuery, useLatestAuditActivityQuery } =
  dashboardApi;
