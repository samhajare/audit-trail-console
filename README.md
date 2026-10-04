# Audit Trail Console

React and TypeScript frontend for the Real-Time Audit Trail Explorer. This repository implements F0 through **F14: Client-Ready UI Polish**.

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

Set the Auth0 variables described below before signing in. Set the public LaunchDarkly client-side ID to enable optional feature rollouts as described under F11. All `VITE_*` values are public browser configuration; never put secrets in them. Local `.env` files are ignored.

## Auth0 setup (F1)

Create an Auth0 **Single Page Application**. Set Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins to `http://localhost:5173` for local development. If Vite uses a different port, update all three. Configure equivalent HTTPS origins when deploying.

Set `VITE_AUTH0_DOMAIN` to your Auth0 domain without `https://` and `VITE_AUTH0_CLIENT_ID` to the SPA client ID. These two values enable sign-in with `window.location.origin` as the redirect URI. Your local `.env` should contain:

```dotenv
VITE_AUTH0_DOMAIN=dev-m68vosgh1w1zam6i.us.auth0.com
VITE_AUTH0_CLIENT_ID=bUPHpyZAhmCRLDQfnuYFQUgS17jE0mtG
```

For authenticated backend requests, also set `VITE_AUTH0_AUDIENCE` to the Auth0 API identifier used by `audit-trail-service`. It can be blank for sign-in setup; the provider only requests an audience when configured. The frontend and backend must use the same audience and issuer for API access. Restart Vite after changing environment values. Never use an Auth0 client secret in a SPA.

The root route is protected. Signed-out users see `/login`; Auth0 Universal Login returns them to their original local path. Signed-in users see their name/email and a logout button. Missing configuration, session loading, SDK errors, and login/logout failures have explicit UI states.

Auth0 owns user context and token caching in memory through `useAuth0`. A session bridge exposes `getAccessTokenSilently` to RTK Query through thunk dependencies; tokens are never stored in Redux or manually persisted. Each API request obtains a token and sets its bearer header. Token retrieval failures return query errors without sending anonymous requests. The API cache is reset when the session changes or logout begins.

Setup reference: [Auth0 React quickstart](https://auth0.com/docs/quickstart/spa/react).

### Resolving "Audit access restricted" during local setup

Successful sign-in does not grant audit permissions. For a minimal viewer setup:

1. In Auth0, create/select the audit API and copy its **Identifier** to frontend `VITE_AUTH0_AUDIENCE` and backend `AUTH0_AUDIENCE`. Set backend `AUTH0_DOMAIN` to `dev-m68vosgh1w1zam6i.us.auth0.com`.
2. Add the API permission `audit:read`. Enable **RBAC** and **Add Permissions in the Access Token** in that API's settings.
3. Create the role `AUDIT_VIEWER`, give it that API's `audit:read` permission, and assign it to your user.
4. Set frontend `VITE_AUTH0_PERMISSIONS_CLAIM=https://example.com/permissions`. Create a Post Login Action using the code below, deploy it, and add it to the Login flow. This minimal example exposes read access for the viewer role; keep the role's API grants aligned with it.

```javascript
exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== 'bUPHpyZAhmCRLDQfnuYFQUgS17jE0mtG') return;
  const roles = event.authorization?.roles || [];
  api.idToken.setCustomClaim(
    'https://example.com/permissions',
    roles.includes('AUDIT_VIEWER') ? ['audit:read'] : [],
  );
};
```

5. Restart frontend and backend, log out, and sign in again to get fresh tokens. The frontend reads the custom ID-token claim; the backend checks the API access token's permissions independently. Backend tenant isolation also requires the trusted tenant claim described in the service README.

Reference: [Auth0 roles and ID-token claims](https://support.auth0.com/center/s/article/add-roles-and-permissions-to-the-id-token-using-actions).

## Foundation architecture

- `src/app/router`: browser routing, shared shell, home and catch-all page.
- `src/app/store`: Redux store and a client-side compact-layout preference; typed hooks live in `src/hooks`.
- `src/services/baseApi.ts`: empty RTK Query API with reducer and middleware registered in the store. Future feature endpoints will extend this API; server responses should remain in its cache.
- `src/config/env.ts`: public environment configuration.
- `src/auth`: Auth0 provider, protected route, user controls, token bridge, and safe return-path handling.
- `src/types`: local audit response contracts and the normalized API error type.
- `src/features/dashboard`: typed statistics/activity queries and the dashboard view.
- `src/features/audit`: explorer/detail queries, URL search validation, filter form, paginated table, event details, and JSON panels.
- `src/features/timeline`: authenticated correlation queries and the paginated chronological timeline.
- `src/components`: shared query-error presentation.
- Other feature directories and `src/utils`: reserved for subsequent phases.
- `test`: React Testing Library and Vitest integration tests.

No backend code is imported. Search enhancements use the existing explorer query architecture. The compact-layout preference is in memory and resets on reload. Tests mock the Auth0 boundary and verify provider configuration, protected routes, user identity, login/logout failures, and real RTK Query bearer requests. Live tenant redirects require your Auth0 configuration and are not exercised by automated tests.

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

Latest activity links use database IDs and navigate to the `/audit/events/:id` detail view implemented in F5. Other severity spellings are not included in the high-severity metric. Statistics calls are independent snapshots and may shift while ingestion continues. Automated dashboard tests use mocked HTTP responses through the real store/API; live backend/Auth0 verification requires your configured environment.

## Audit Explorer (F4)

The protected `/audit/events` route exposes all nine filters: event type, actor, resource type, resource ID, service, severity, correlation ID, from, and to. Text filters match exactly and combine with AND. From/to accept ISO date-times with an explicit time zone, with inclusive backend boundaries. Supported event types match the schema 1.0 contract; severity remains free text because the backend stores arbitrary severity strings.

The URL is the source of truth for applied filters and pagination. Draft inputs are applied on form submission; changing filters or page size resets to page 1. Bookmarks, reloads, and browser back/forward restore the applied state. This avoids duplicating URL state in Redux. Server responses remain in RTK Query; no response copies are stored in slices. Only the documented query keys are forwarded to the backend. Duplicate values, unsupported types, invalid dates/ranges, oversized text, and invalid pagination block API requests and display a validation error.

Pagination defaults to page 1 and limit 25, supports any page size from 1 to 100, and retains filters between pages. Out-of-range pages have a recovery action. The table includes all required columns and a keyboard-focusable scroll region for smaller screens. Loading, network/HTTP errors (including 401/403), retry, and empty states are explicit. Previous-search rows are hidden while a different search loads. Pagination follows backend persistence order and can shift between requests during ingestion.

Row links use database `id` and reach the detail view implemented in F5. No timeline, permission helpers, SSE, flags, filter drawers, or virtualization were added to the explorer. Automated tests use mocked HTTP responses with real routing and RTK Query; live backend/Auth0 verification still requires a configured environment.

## Event Detail (F5)

The protected `/audit/events/:id` route now fetches `GET /audit/events/:id` through the shared RTK Query API and Auth0 bearer-token layer. The route ID is the database UUID, not producer `eventId`. Malformed UUIDs show an invalid-ID message without a request; the backend remains authoritative about existence and access. The placeholder page has been removed.

The summary shows both identifiers, event type/schema version, exact ISO event/recording timestamps, actor ID/email/role, action, resource type/ID, service, tenant, correlation ID, and severity. Missing optional fields have explicit fallback text. Labeled before/after JSON snapshots use a responsive side-by-side layout and stack on smaller screens. A `null` snapshot is distinct from a provided empty object. Nested objects and arrays remain intact. Context and metadata have their own JSON panels; the expandable Raw JSON section shows the complete response without modification. JSON is rendered as escaped text rather than injected HTML, and scrollable code panels are keyboard-focusable.

Loading, network/HTTP failures, retry, empty responses, and not-found responses are explicit. A new route ID uses current query data so the previous event is hidden during loading. Explorer/dashboard return links support direct bookmarks; browser back restores the explorer's URL filters. Detail responses remain in RTK Query and are not copied into slices. Server masking remains intact in every view, including raw JSON; no client-side permission or disclosure policy is introduced.

Automated tests cover authenticated detail requests, field rendering, snapshots, optional fields, raw JSON, escaped markup, route changes, errors/retry, 404, invalid IDs, protected bookmarks, and dashboard/explorer navigation. Live Auth0/backend verification requires a configured environment. Snapshot presentation does not compute a field-by-field diff, and runtime response-shape validation remains outside the existing typed contract. No timeline, SSE, DLQ, replay, or feature flags were added.

## Correlation Timeline (F6)

The protected `/audit/timeline/:correlationId` route fetches `GET /audit/timeline/:correlationId` using the shared authenticated RTK Query API. Event details link their correlation ID to this view; each timeline item links to its database event detail. Correlation IDs are URL-encoded and preserve exact values. Blank or oversized IDs and invalid pagination block requests.

The ordered list preserves the documented backend order: ascending event timestamp with UUID ties. It displays exact timestamps with time zones, event type, actor, action, resource, and service. URL page/limit state supports bookmarks and history, defaults to 1/25, and accepts limits up to 100. Loading, normalized errors (including 401/403), retries, empty responses, empty timelines, and out-of-range recovery are explicit. Previous correlation results are hidden during a new request. The responsive layout wraps long identifiers and uses semantic lists and keyboard-accessible links/buttons.

Server responses remain in RTK Query; no slices duplicate timeline data. No dependencies or backend imports were added. Automated integration tests use mocked HTTP through real routing, store, and query middleware. Live Auth0/backend verification requires configured credentials and a running service. Offset pages can shift as ingestion continues, and response types do not perform runtime shape validation. Historical phase sections above describe the scope of their respective implementation steps.

## Permission-Aware UX (F7)

`src/auth/permissions.ts` defines all five supported permissions and exact-match helpers. `usePermissions` reads the Auth0 SDK's authenticated user claims; `PermissionGate` hides children or renders an explicit fallback. Missing, malformed, or unavailable claims deny capabilities. Roles, wildcard strings, scope strings, and other claim names do not implicitly grant permissions. No token is decoded or stored in Redux, and permissions are derived on each render rather than copied into state.

Set `VITE_AUTH0_PERMISSIONS_CLAIM` to the claim exposed on the Auth0 user profile/ID token (default `https://audit-trail.example.com/permissions`). Configure your trusted Auth0 post-login Action to set that ID-token custom claim to an array of the user's granted API permission strings, such as `["audit:read"]`. Keep this UX claim aligned with the API access token's effective permissions and your tenant policy. Auth0 API RBAC/access-token permissions alone do not automatically populate this user claim. Restart Vite after changing the claim name and sign in again after changing grants. The claim is public configuration, not a secret.

The dashboard, explorer, event details, and timeline require `audit:read` at the route boundary before their query components mount. Users without it see an access-restricted message; read navigation is hidden while logout and account controls remain available. Permission changes remove mounted read content on the next SDK render. The reusable gate also supports `audit:export`, `audit:view-sensitive`, `audit:replay`, and `audit:manage`; no export, sensitive-data toggle, DLQ, replay, or management feature is introduced in this phase. Existing server-masked JSON remains visible to readers without adding a client-side disclosure policy.

These checks control UX only. API bearer tokens still reach the backend, which remains authoritative about permissions, tenant isolation, and sensitive-data masking. An allowed frontend claim never overrides a backend 401/403; existing normalized errors and retry controls remain intact. The session bridge clears cached responses when recognized permission grants change, including for the same user, so subsequent views fetch fresh server-masked data. Automated tests cover all five gates, missing/malformed claims, configured names, stale authentication state, denied bookmarks without requests, navigation hiding, revocation/cache clearing, and backend 403 despite a frontend grant. Live Auth0 claim provisioning requires a configured tenant and has not been exercised by these mocked tests.

## Real-Time SSE (F8)

On the dashboard, choose **Start live activity** to connect to `GET /audit/stream`. Streaming is off by default and requires an authenticated user with the `audit:read` UX claim. Connection state is visible: stopped, connecting, connected, reconnecting, or error. Stop the stream with **Stop live activity**. For terminal errors, stop/reset and start again after correcting access. LaunchDarkly is not introduced in this phase.

The fetch-based SSE client sends a fresh bearer token in the Authorization header for every connection; tokens never appear in URLs. It parses chunked UTF-8 SSE framing, multiline data, CR/LF/CRLF boundaries, heartbeats, and server retry hints. Network failures, closed streams, malformed audit notifications, 429, and server failures reconnect with bounded exponential delay (normally 3 seconds initially, up to 30 seconds). A 45-second timeout covers stalled connection headers and stream reads. Authentication failures, nonretryable HTTP errors including 401/403, and invalid response content types show explicit errors and require user intervention. The backend closes streams at token expiry, so reconnect obtains another token through the SDK.

Notifications deduplicate by the data's producer `eventId`, retaining the most recent 1,000 IDs per running client across reconnects. Heartbeats and duplicates do not update Redux or trigger refreshes. Unique notifications batch dashboard cache invalidation over 500ms, refreshing active statistics and latest activity through RTK Query. REST responses remain the server-data source: stream messages omit database IDs/context/metadata, so inventing detail links or overwriting full records would be incorrect. Each successful connection also invalidates dashboard data because the backend does not replay missed events. Redux holds only enabled/connection UI state, not streamed event payloads.

Unmount, stop, session change, permission-driven session reset, and logout suspension abort fetches, cancel readers, unsubscribe session listeners, and clear pending timers. Logout closes the stream immediately before the SDK redirect. A failed logout leaves streaming stopped until the user starts it again. Leaving the dashboard closes its connection; returning reconnects if the user previously left live activity enabled in this session.

Tests exercise framing, bearer headers, notification batching/deduplication, EOF reconnection and refreshed tokens, failure/backoff behavior, terminal errors, cancellation, session/logout cleanup, and dashboard updates without manual refresh. Live backend/Auth0 networking and proxy behavior require a configured environment. The backend has no durable replay and targets one service replica; reconnect REST refresh restores the dashboard view but does not reconstruct a notification history. Very old IDs evicted from the bounded deduplication set may trigger another REST refresh, while REST rows still remain authoritative. Historical phase sections describe their original implementation scope.

## DLQ Viewer (F9)

The protected `/audit/dlq` and `/audit/dlq/:eventId` routes use `GET /audit/dlq` and `GET /audit/dlq/:eventId` through the shared authenticated RTK Query API. DLQ navigation and routes require the `audit:read` UX claim, matching the documented backend read policy. Neither admin roles nor replay/manage permissions alone grant read access. Users without read permission see the existing restricted-access view before query components mount; signed-out bookmarks return to login. Backend 401/403 responses remain authoritative and use shared error presentation.

The list shows producer event ID, event type, failure reason, retry count, failed-at timestamp, and correlation ID, preserving backend newest-recorded-first order. URL pagination defaults to page 1/limit 25, accepts limits up to 100, validates safe offsets, supports browser history, and offers recovery for invalid or empty out-of-range pages. Only page and limit are sent to the list API; detail requests have no query parameters. Detail links encode producer `eventId`, not database UUID. A keyboard-focusable table scroll region and wrapping fields support smaller screens.

Details show the six required fields plus source topic, database ID, tenant ID, recorded-at timestamp, existing replay status, and original event JSON. The original payload is arbitrary JSON because failed records may violate the audit schema. Missing event types/correlation IDs have explicit fallbacks, and credential-protected omitted payloads have an explanation. JSON renders as escaped text and preserves server masking. No client tenant selector or backend imports are introduced. No replay button, mutation, confirmation, or feature flags are implemented in F9.

Loading, normalized HTTP/network errors, retries, empty lists, empty responses, invalid IDs, and detail 404 states are explicit. Current query data prevents prior rows/details from appearing under a new page or event ID. Server responses remain in RTK Query without slice copies. Tests cover bearer requests, required fields, detail navigation, pagination/history/recovery, stale-result hiding, invalid and omitted payloads, masking/escaping, failure states/retries, signed-out bookmarks, and permission-aware navigation. Live Auth0/backend integration requires a configured environment. DLQ indexing is eventually consistent, and pagination can shift during ingestion; types do not validate complete response shapes at runtime.

## DLQ Replay UX (F10)

Users with `audit:read` and `audit:replay` can replay from the failed event detail screen. The replay section is hidden without the replay claim, and submission rechecks both permissions. The backend remains authoritative, including any backend rollout policy; a frontend grant never overrides a 403. This phase does not integrate LaunchDarkly.

**Replay event** opens an inline confirmation naming the producer event ID and explaining that the stored original payload is published unchanged. Confirmation receives keyboard focus, and cancellation restores focus to the replay button without a request. Confirming sends one authenticated `POST /audit/dlq/:eventId/replay` with an empty JSON body. The producer ID is URL-encoded; no tenant, topic, or replacement payload is submitted. Pending controls prevent repeated submissions, and each manual retry requires a new confirmation. There are no automatic mutation retries.

A successful 202 response shows the replay ID and states that Kafka publication does not confirm eventual persistence. Normalized failures include 401/403, 404, conflict, and service/network failures; untrusted backend bodies are not displayed. Conflict feedback explains that the payload may be unsupported or already attempted. Network and service failures advise checking replay status because reservation/publication may already have occurred. DLQ list/detail cache tags are invalidated after success or failure to refresh the authoritative replay state.

Records with an omitted original payload, missing event ID, or reserved/published/failed replay status have a disabled action and an explanation. The backend allows one attempt per tenant/event; failed or ambiguous attempts are not reset by this UI. Changing detail records resets confirmation and mutation presentation. RTK Query owns mutation results and server cache; component state holds only confirmation and submission/focus guards.

Tests cover authenticated empty-body publication, confirmation/cancel and focus, pending/double submission, success/cache refresh, permission hiding, existing attempts, omitted payloads, route changes, backend failures including 403/409, and explicit retries after network failure. Live Kafka/Auth0/backend replay has not been exercised by automated tests. Backend publication and reservation are not atomic, so operators must reconcile ambiguous attempts rather than expecting this UI to repair or resend them. Historical phase sections describe their original scope.

## LaunchDarkly (F11)

Set `VITE_LAUNCHDARKLY_CLIENT_ID` to your environment's **client-side ID**, never its server SDK key. Create boolean flags with false defaults and enable their availability to client-side SDKs:

| Flag                        | Frontend use                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `audit-live-stream`         | Allows the existing live activity control in addition to `audit:read`; turning it off closes a running stream. |
| `audit-dlq-replay`          | Shows the existing replay UX in addition to read/replay permissions; turning it off removes confirmation.      |
| `audit-new-search`          | Enables active filter chips, clear-all, and correlation ID quick search (F12).                                 |
| `audit-data-export`         | Evaluated by the typed flag hook; no export feature is added.                                                  |
| `audit-sensitive-data-view` | Evaluated by the typed flag hook; server masking remains authoritative and no new disclosure UI is added.      |

The authenticated layout hosts the LaunchDarkly React SDK provider. The explicitly owned JavaScript client enables bounded asynchronous initialization (5 seconds) and cleanup even when unmounted before initialization finishes. Ordinary read screens do not wait for flag initialization. Missing client IDs, unavailable authentication, missing subjects, initialization failures/timeouts, missing flags, and non-boolean values leave optional features off. Initialization errors show generic feedback without raw SDK logs. After successful initialization, the SDK can retain last-known values during an upstream outage.

Targeting sends only a `user` context whose key is the Auth0 subject, plus a `tenant` context when `VITE_AUTH0_TENANT_CLAIM` supplies a nonblank string in the Auth0 user/ID-token claims. The default claim is `https://audit-trail.example.com/tenantId`. Configure a trusted post-login Action to mirror the authorized API tenant into that user claim; do not choose it from client input. Missing tenant claims use user-only targeting. No names, emails, tokens, permission arrays, or event payloads are included. Identity/tenant changes create a fresh client with flags initially off and close the previous client; signed-out sessions and unmount close it too. Targeting is rollout metadata and does not select an API tenant or grant authorization.

Flag keys retain their documented hyphenated form (`useCamelCaseFlagKeys: false`). `useAuditFlag` exposes all five boolean evaluations to existing and future features without storing SDK flags in Redux. Permission checks and backend errors remain in force. The authentication bridge also clears API cache and resets active sessions when the configured tenant claim changes, preventing reuse of previous tenant responses. Configure frontend and backend environments consistently: backend rollout rules still govern SSE, replay, and sensitive disclosure, so an enabled browser flag cannot override backend 403 or masking. F12 adds optional search controls through `audit-new-search` while retaining the standard explorer form and query.

Automated tests mock SDK boundaries and cover provider configuration, minimal targeting, all five evaluations/live changes, defaults and invalid values, loading/failure states, identity/logout/unmount cleanup, permissions combined with flags, and active stream/confirmation removal when flags switch off. Existing stream and replay tests explicitly enable rollout at their boundary. Live LaunchDarkly/Auth0 targeting and network behavior require configured environments and have not been exercised. SDK setup references: [React provider API](https://launchdarkly.github.io/react-client-sdk/classes/LDProvider.html) and [React options](https://launchdarkly.github.io/react-client-sdk/interfaces/LDReactOptions.html).

## Search UX Enhancement (F12)

When `audit-new-search` is true, the explorer adds removable chips for all nine applied filters, **Clear all filters**, and a keyboard-submittable correlation ID quick search. When false, the original explorer remains available. Both variants share the existing filter form, results table, URL validation, and authenticated RTK Query endpoint. Switching the flag does not alter applied filters or issue an additional query.

Removing a chip or submitting quick search resets pagination to page 1 and preserves the other applied filters and page size. Correlation IDs retain exact matching, including meaningful whitespace; blank values are rejected. Quick search combines with the applied URL filters, rather than unsent form drafts. Clear-all retains a valid page size (otherwise defaults to 25) and can recover an invalid bookmarked search. URL changes and browser history restore the chips and draft inputs without a duplicate Redux search slice.

Existing loading, empty, validation, unauthorized/forbidden, and retry behavior remains shared. Controls use semantic forms, labels, buttons, and wrapping layouts. Tests cover both flag states and live toggling, all filter chips, clear-all recovery, exact authenticated requests, keyboard submission, browser history, form synchronization, validation, and backend error recovery. Live LaunchDarkly/Auth0/backend integration still requires a configured environment. Date inputs retain the existing explicit-time-zone ISO format; no drawer or date picker is added.

## React Performance Showcase (F13)

The explorer renders one server page, at most 100 events, regardless of the total matching count. It does not accumulate pages or copy RTK Query data into Redux slices. `AuditEventTable` is an isolated `React.memo` component receiving the cached items array. An unchanged array skips table rendering during unrelated parent or feature-flag updates; a changed array renders current server values. The native semantic table, all eight columns, keyboard scrolling, detail links, and existing loading/error/stale-result behavior are preserved.

The reproducible render-work check is `npm test -- --run test/audit-table-performance.test.tsx`. Its maximum-page fixture measures timestamp reads: the initial render processes 100 rows, an unrelated parent update adds zero reads, and changed data renders again. An explorer integration test uses a million-event total with 100 returned rows and verifies draft typing sends no request, submitting searches once, and pagination retains filters. These are deterministic work/count checks in jsdom, not browser frame-rate or production latency benchmarks.

Draft fields are uncontrolled, so typing does not rerender the results or make requests. URL state still owns applied filters. No expensive client sorting/filtering occurs, so transitions, memoized calculations/callbacks, and virtualization are not justified by this workload. Keeping all 100 rows mounted preserves native table navigation and browser find. Lazy loading/Suspense are also deferred: this small table introduces no separate heavy dependency. Revisit those choices with browser profiling if page limits or rendering costs grow.

React's Fiber reconciler manages component work; this application does not implement Fiber. Memoization lets React skip unchanged component work. Concurrent scheduling can prioritize or interrupt eligible render work, while commits update the DOM; `React.memo` does not itself introduce a transition, background thread, or faster network request. No scheduling or frame-rate claim is inferred from the count tests. Live Auth0/backend performance and device-specific browser timing remain unmeasured.

## Client-Ready UI Polish (F14)

The shared shell groups branding, permission-aware navigation, user controls, and layout preferences. Current navigation has a visible marker, including event and DLQ detail routes. Path navigation focuses the main content for keyboard users; query-only filter/pagination changes preserve control focus. The existing skip link remains available and appears above the header when focused.

Shell header styles are scoped so page headings, including the DLQ heading, retain normal document flow. Navigation wraps on narrow screens; identifiers and user details wrap rather than widening the page. Panels share heading spacing, buttons have a 44px minimum height and clear hover/focus/disabled states, and API error blocks use consistent visual emphasis alongside existing alerts and retries. Tables keep their labeled keyboard-accessible horizontal scroll regions. Existing loading, empty, forbidden, authentication, replay, and flag behavior is preserved without new product features or backend changes.

Automated tests cover active detail navigation, focus after page changes, permission-aware navigation, recovery links, and all existing screen states. CSS responsiveness is designed for narrow widths, but automated jsdom tests do not validate pixel layout or screen-reader behavior. Live Auth0/backend presentation still requires configured services.

Next phase: **F15: Documentation and CI**. It is not implemented here.
