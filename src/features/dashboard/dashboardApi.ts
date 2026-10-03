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

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    dashboardStatistics: builder.query<
      AuditStatistics,
      DashboardStatisticsFilters
    >({
      query: (params) => ({ url: '/audit/statistics', params }),
    }),
    latestAuditActivity: builder.query<PaginatedAuditResponse, void>({
      query: () => ({ url: '/audit/events', params: { page: 1, limit: 10 } }),
    }),
  }),
});

export const { useDashboardStatisticsQuery, useLatestAuditActivityQuery } =
  dashboardApi;
