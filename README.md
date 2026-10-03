# Audit Trail Console

React and TypeScript frontend for the Real-Time Audit Trail Explorer. This repository implements F0 through **F4: Audit Explorer**.

The project rules and implementation plan are supplied as `CONSOLE_AGENTS.md` and `CONSOLE_IMPLEMENTATION_PLAN.md`.

## Local development

Requires Node.js 22.12 or newer and npm.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). For the first dependency installation before a lockfile exists, use `npm install`.

`VITE_API_BASE_URL` defaults to `http://localhost:3000`. Set it to the separate `audit-trail-service` REST API origin. The dashboard requires an available backend (B5 or later), valid Auth0 authentication, and `audit:read`. Cross-origin API access requires backend CORS configuration allowing the frontend origin and Authorization header. Without API access, the dashboard displays errors and retry controls.

Set the Auth0 variables described below before signing in. LaunchDarkly remains reserved for a future phase. All `VITE_*` values are public browser configuration; never put secrets in them. Local `.env` files are ignored.

## Auth0 setup (F1)

Create an Auth0 **Single Page Application**. Set Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins to `http://localhost:5173` for local development. If Vite uses a different port, update all three. Configure equivalent HTTPS origins when deploying.

Set `VITE_AUTH0_DOMAIN` to your Auth0 domain without `https://`, `VITE_AUTH0_CLIENT_ID` to the SPA client ID, and `VITE_AUTH0_AUDIENCE` to the Auth0 API identifier used by `audit-trail-service`. The frontend and backend must use the same audience and issuer. Restart Vite after changing environment values. Never use an Auth0 client secret in a SPA.

The root route is protected. Signed-out users see `/login`; Auth0 Universal Login returns them to their original local path. Signed-in users see their name/email and a logout button. Missing configuration, session loading, SDK errors, and login/logout failures have explicit UI states.

Auth0 owns user context and token caching in memory through `useAuth0`. A session bridge exposes `getAccessTokenSilently` to RTK Query through thunk dependencies; tokens are never stored in Redux or manually persisted. Each API request obtains a token and sets its bearer header. Token retrieval failures return query errors without sending anonymous requests. The API cache is reset when the session changes or logout begins.

Setup reference: [Auth0 React quickstart](https://auth0.com/docs/quickstart/spa/react).

## Foundation architecture

- `src/app/router`: browser routing, shared shell, home and catch-all page.
- `src/app/store`: Redux store and a client-side compact-layout preference; typed hooks live in `src/hooks`.
- `src/services/baseApi.ts`: empty RTK Query API with reducer and middleware registered in the store. Future feature endpoints will extend this API; server responses should remain in its cache.
- `src/config/env.ts`: public environment configuration.
- `src/auth`: Auth0 provider, protected route, user controls, token bridge, and safe return-path handling.
- `src/types`: local audit response contracts and the normalized API error type.
- `src/features/dashboard`: typed statistics/activity queries and the dashboard view.
- `src/features/audit`: explorer queries, URL search validation, filter form, and paginated table.
- `src/components`: shared query-error presentation.
- Other feature directories and `src/utils`: reserved for subsequent phases.
- `test`: React Testing Library and Vitest integration tests.

No backend code is imported. Detail/timeline screens, SSE, DLQ, permission-aware UX, and feature flags are deferred to their planned phases. The compact-layout preference is in memory and resets on reload. Tests mock the Auth0 boundary and verify provider configuration, protected routes, user identity, login/logout failures, and real RTK Query bearer requests. Live tenant redirects require your Auth0 configuration and are not exercised by automated tests.

## API contracts and errors (F2)

`src/types/audit.ts` defines frontend-owned `AuditEventSummary`, `AuditEventDetail`, `AuditTimelineEvent`, `AuditStatistics`, and `PaginatedAuditResponse` types based on the adjacent service's documented REST contract. Full list and timeline records include changes. Detail navigation uses database `id`, not producer `eventId`. Pages are one-based and use `{ items, total, page, limit, totalPages }`. Statistics exposes `total` and `byEventType`; it does not invent events-today or high-severity fields. Service is read from `context.service`, and severity from `metadata.severity`. JSON fields remain recursive JSON values, and masked actor emails remain strings. These types describe the wire contract; they do not validate responses at runtime.

The existing base API uses `VITE_API_BASE_URL` and Auth0 bearer tokens. All failures now return a serializable `ApiError` with `status`, `kind`, `message`, `retryable`, and optional `httpStatus`/untrusted `data`. Consumers can display `message` and branch on `kind` for unauthorized (401), forbidden (403), not-found (404), conflict (409), server (5xx), network, timeout, invalid JSON, and token retrieval failures. Non-JSON HTTP failures retain their original HTTP classification. Server/network messages are generic; raw response data is not a user-facing message.

Errors remain in RTK Query rather than a separate slice. There are no automatic redirects, logout, or retries: a resource-level 401/403 does not rewrite the Auth0 session, and retrying mutations requires an explicit user decision. `retryable` is advisory for future screens. No domain endpoints or screens were added in F2. Integration tests exercise the shared API through test-only endpoints and mocked HTTP responses; no live backend is required.

## Validation and production build

Vitest uses one worker to bound jsdom memory consumption while retaining isolated test files.

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

The build is written to `dist`. Preview serves it locally. Production hosting must serve `index.html` for unknown frontend paths so direct links work with browser routing.

## Dashboard (F3)

The protected root route shows events today, all-time high-severity events, all-time events by type, and the ten most recently recorded events. Data stays in the shared RTK Query cache; no response copies are stored in Redux slices.

The backend provides `total` and `byEventType`, not dedicated dashboard metrics. Today's total uses `/audit/statistics?from=...&to=...` with inclusive ISO boundaries for the browser's local calendar day. Boundaries update at local midnight and on manual refresh. Event timestamps use the same local time zone. High severity means exact values `HIGH`, `ERROR`, or `CRITICAL`; their totals come from three disjoint severity-filtered statistics calls. A failed constituent query shows an error instead of a partial count. By-type totals use unfiltered statistics. Latest activity uses `/audit/events?page=1&limit=10` and preserves backend persistence ordering rather than sorting by event timestamp.

Each panel supports loading, errors (including unauthorized/forbidden), empty results where applicable, and manual retries. The layout uses responsive grids and wraps long activity identifiers. There is no polling or SSE.

Latest activity links use database IDs and navigate to the reserved `/audit/events/:id` route with an unavailable message and a return link. This route makes no detail request: the full detail screen remains F5. Other severity spellings are not included in the high-severity metric. Statistics calls are independent snapshots and may shift while ingestion continues. Automated dashboard tests use mocked HTTP responses through the real store/API; live backend/Auth0 verification requires your configured environment.

## Audit Explorer (F4)

The protected `/audit/events` route exposes all nine filters: event type, actor, resource type, resource ID, service, severity, correlation ID, from, and to. Text filters match exactly and combine with AND. From/to accept ISO date-times with an explicit time zone, with inclusive backend boundaries. Supported event types match the schema 1.0 contract; severity remains free text because the backend stores arbitrary severity strings.

The URL is the source of truth for applied filters and pagination. Draft inputs are applied on form submission; changing filters or page size resets to page 1. Bookmarks, reloads, and browser back/forward restore the applied state. This avoids duplicating URL state in Redux. Server responses remain in RTK Query; no response copies are stored in slices. Only the documented query keys are forwarded to the backend. Duplicate values, unsupported types, invalid dates/ranges, oversized text, and invalid pagination block API requests and display a validation error.

Pagination defaults to page 1 and limit 25, supports any page size from 1 to 100, and retains filters between pages. Out-of-range pages have a recovery action. The table includes all required columns and a keyboard-focusable scroll region for smaller screens. Loading, network/HTTP errors (including 401/403), retry, and empty states are explicit. Previous-search rows are hidden while a different search loads. Pagination follows backend persistence order and can shift between requests during ingestion.

Row links use database `id` and reach the existing reserved detail route. The full detail screen remains F5; no detail endpoint, timeline, permission helpers, SSE, flags, filter drawers, or virtualization were added. Automated tests use mocked HTTP responses with real routing and RTK Query; live backend/Auth0 verification still requires a configured environment.

Next phase: **F5 — Event Detail**. It is not implemented here.
