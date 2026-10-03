import type { AuditEventType } from '../../types/audit';

export const eventTypes = [
  'USER_LOGIN',
  'USER_ROLE_CHANGED',
  'DATA_EXPORTED',
  'CONFIG_CHANGED',
  'PAYMENT_REFUNDED',
] as const satisfies readonly AuditEventType[];
export const filterFields = [
  { key: 'actor', label: 'Actor' },
  { key: 'resourceType', label: 'Resource type' },
  { key: 'resourceId', label: 'Resource ID' },
  { key: 'service', label: 'Service' },
  { key: 'severity', label: 'Severity' },
  { key: 'correlationId', label: 'Correlation ID' },
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
] as const;
export const filterKeys = [
  'eventType',
  ...filterFields.map((field) => field.key),
] as const;
type FilterKey = (typeof filterKeys)[number];
export type AuditSearch = Partial<Record<FilterKey, string>> & {
  page: number;
  limit: number;
};
export type ParsedSearch =
  { query: AuditSearch; error?: never } | { query?: never; error: string };

function validTimestamp(value: string) {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(parts[1]),
    month = Number(parts[2]),
    day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay =
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ??
    0;
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= maxDay &&
    Number(parts[4]) < 24 &&
    Number(parts[5]) < 60 &&
    Number(parts[6]) < 60
  );
}

export function parseAuditSearch(params: URLSearchParams): ParsedSearch {
  for (const key of [...filterKeys, 'page', 'limit']) {
    if (params.getAll(key).length > 1)
      return { error: `Provide only one ${key} value.` };
  }
  const pageValue = params.get('page') ?? '1';
  const limitValue = params.get('limit') ?? '25';
  const page = Number(pageValue),
    limit = Number(limitValue);
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1)
    return { error: 'Page must be a positive whole number.' };
  if (
    !/^\d+$/.test(limitValue) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    return { error: 'Results per page must be between 1 and 100.' };
  const query: AuditSearch = { page, limit };
  for (const key of filterKeys) {
    const value = params.get(key);
    if (!value) continue;
    if (value.length > 256)
      return { error: `${key} must be at most 256 characters.` };
    if (key === 'eventType' && !eventTypes.some((type) => type === value))
      return { error: 'Choose a supported event type.' };
    if ((key === 'from' || key === 'to') && !validTimestamp(value))
      return {
        error: `${key} must be a valid ISO date-time with a time zone, such as 2026-10-04T00:00:00Z.`,
      };
    query[key] = value;
  }
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to))
    return { error: 'From must be earlier than or equal to To.' };
  return { query };
}

export function serializeAuditSearch(query: AuditSearch) {
  const params = new URLSearchParams();
  for (const key of filterKeys) if (query[key]) params.set(key, query[key]);
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  return params;
}
