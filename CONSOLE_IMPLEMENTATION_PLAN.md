# IMPLEMENTATION_PLAN.md

# Audit Trail Console — Frontend Implementation Plan

Build one phase per Codex session.

The frontend assumes `audit-trail-service` exposes the required REST APIs. Start this repo after backend Phase B5 at minimum.

## F0 — Frontend Foundation

Create the React frontend with:
- React
- TypeScript strict mode
- Vite
- Redux Toolkit
- RTK Query
- React Router
- ESLint
- Prettier
- React Testing Library
- Vitest or Jest

Create:
```text
src/
  app/
    router/
    store/
  auth/
  components/
  config/
  features/
    audit/
    dashboard/
    dlq/
    timeline/
  hooks/
  layouts/
  pages/
  services/
  types/
  utils/
test/
```

Add:
- app shell
- router
- Redux store
- RTK Query base API
- environment configuration
- .env.example
- not-found page

Acceptance:
- app starts
- routing works
- Redux works
- RTK Query base API exists
- lint/typecheck/test/build pass
- README has startup instructions

Codex prompt:
```text
Read AGENTS.md and IMPLEMENTATION_PLAN.md.
Inspect the repository.

Implement Phase F0 only.

Create the foundation for audit-trail-console using React, TypeScript strict mode, Vite, Redux Toolkit, RTK Query, React Router, ESLint, Prettier, React Testing Library, and Vitest or Jest.

Create the folder structure defined in AGENTS.md.

Add:
- application shell
- router
- Redux store
- RTK Query base API
- environment configuration
- .env.example
- basic not-found page

Do not implement Auth0, LaunchDarkly, audit screens, or SSE yet.

Run format, lint, typecheck, tests, and build.

At the end report:
1. files changed
2. architecture decisions
3. commands run
4. known limitations
5. acceptance criteria status
6. confirm only F0 was implemented
```

## F1 — Auth0 Integration

Implement:
- Auth0 provider
- login
- logout
- protected routes
- authenticated user summary
- access token retrieval
- loading/error states
- bearer token integration with RTK Query

Acceptance:
- unauthenticated user sees login
- authenticated user can enter protected area
- logout works
- API requests include bearer token
- tests cover route protection

Codex prompt:
```text
Implement Phase F1 only.

Integrate Auth0 React SDK.

Requirements:
- Auth0 provider
- login/logout
- protected routes
- authenticated user context
- access token retrieval
- bearer token integration with RTK Query
- loading/error states
- protected-route tests

Do not implement dashboard or LaunchDarkly yet.

Run lint, typecheck, tests, and build.
```

## F2 — API Types and Base Query

Define local response types:
- AuditEventSummary
- AuditEventDetail
- AuditStatistics
- AuditTimelineEvent
- PaginatedAuditResponse
- ApiError

Configure RTK Query handling for:
- API base URL
- bearer token
- 401
- 403
- 404
- 409
- 5xx
- network failures

Acceptance:
- typed API layer
- no backend source imports
- common error handling works

Codex prompt:
```text
Implement Phase F2 only.

Create local frontend API response types and configure RTK Query base handling for base URL, bearer token, 401, 403, 404, 409, 5xx, and network errors.

Do not import backend source files.

Run lint, typecheck, tests, and build.
```

## F3 — Dashboard

Use:
- GET /audit/statistics
- GET /audit/events

Show:
- events today
- high-severity events
- events by type
- latest activity

Acceptance:
- loads from backend
- loading/error/empty states
- latest activity links to details
- responsive layout

Codex prompt:
```text
Implement Phase F3 only.

Create the Audit Dashboard using GET /audit/statistics and GET /audit/events.

Show events today, high-severity events, events by type, and latest activity.

Use RTK Query.
Add loading, error, empty, and responsive states.
Do not implement SSE yet.
```

## F4 — Audit Explorer

Use:
- GET /audit/events

Filters:
- eventType
- actor
- resourceType
- resourceId
- service
- severity
- correlationId
- from
- to

Pagination:
- page
- limit

Columns:
- timestamp
- event type
- actor
- action
- resource
- service
- correlation ID
- severity

Use URL query params where practical.

Acceptance:
- filters work
- pagination works
- filters combine
- loading/error/empty states
- row links to details

Codex prompt:
```text
Implement Phase F4 only.

Build the Audit Explorer using GET /audit/events.

Support all filters and pagination defined in IMPLEMENTATION_PLAN.md.
Use RTK Query for server data.
Use Redux Toolkit only for client-side state where useful.
Preserve filter state in URL query params where practical.

Add loading, error, and empty states.
```

## F5 — Event Detail

Use:
- GET /audit/events/:id

Show:
- event metadata
- actor
- action
- resource
- service
- timestamp
- correlation ID
- severity
- before/after values
- context
- metadata
- raw JSON

Acceptance:
- event loads
- before/after is clear
- raw JSON view exists
- loading/error/not-found states

Codex prompt:
```text
Implement Phase F5 only.

Create the Event Detail page using GET /audit/events/:id.

Show metadata, actor, action, resource, service, timestamp, correlation ID, severity, before/after values, context, metadata, and raw JSON.

Create a clear before/after comparison.
Handle loading, error, and not-found states.
```

## F6 — Correlation Timeline

Use:
- GET /audit/timeline/:correlationId

Show chronologically:
- timestamp
- event type
- actor
- action
- service
- resource

Acceptance:
- timeline loads
- ordering is clear
- each item links to details
- loading/error/empty states

Codex prompt:
```text
Implement Phase F6 only.

Create the Correlation Timeline using GET /audit/timeline/:correlationId.

Render events chronologically with timestamp, event type, actor, action, service, and resource.
Allow navigation to Event Detail.
Add loading, error, and empty states.
```

## F7 — Permission-Aware UX

Use permissions:
- audit:read
- audit:export
- audit:view-sensitive
- audit:replay
- audit:manage

Examples:
- hide replay without audit:replay
- hide export without audit:export
- hide sensitive capability without audit:view-sensitive

Acceptance:
- reusable permission helper
- UI hides/disables appropriately
- backend 403 still handled
- tests cover permission rendering

Codex prompt:
```text
Implement Phase F7 only.

Add permission-aware UX using Auth0 claims.

Create reusable permission helpers for:
audit:read
audit:export
audit:view-sensitive
audit:replay
audit:manage

Use permissions only for UX. Backend remains authoritative.

Add tests.
```

## F8 — Real-Time SSE

Use:
- GET /audit/stream

Requirements:
- authenticated connection
- reconnect behavior
- connection status
- cleanup on logout/unmount
- deduplicate by eventId
- update latest activity
- avoid excessive rerenders

Acceptance:
- event appears without refresh
- duplicates avoided
- connection visible
- reconnect works
- logout closes stream

Codex prompt:
```text
Implement Phase F8 only.

Add authenticated SSE integration with GET /audit/stream.

Implement reconnect behavior, connection status, cleanup, eventId deduplication, and live latest-activity updates.

Avoid unnecessary rerenders.
Do not use WebSocket unless SSE is insufficient.
Add tests where practical.
```

## F9 — DLQ Viewer

Use:
- GET /audit/dlq
- GET /audit/dlq/:eventId

Show:
- event ID
- event type
- failure reason
- retry count
- failed at
- correlation ID

Acceptance:
- list/detail work
- loading/error/empty states
- unauthorized user does not see admin navigation

Codex prompt:
```text
Implement Phase F9 only.

Create DLQ list and detail screens using GET /audit/dlq and GET /audit/dlq/:eventId.

Show event ID, event type, failure reason, retry count, failed-at timestamp, and correlation ID.

Respect permission-aware UX.
Add loading, error, and empty states.
```

## F10 — DLQ Replay UX

Use:
- POST /audit/dlq/:eventId/replay

Requirements:
- visible only with audit:replay
- confirmation
- loading state
- success/failure feedback
- handle 403

Acceptance:
- authorized replay works
- unauthorized UX hidden
- feedback visible
- tests cover interaction

Codex prompt:
```text
Implement Phase F10 only.

Add DLQ replay using POST /audit/dlq/:eventId/replay.

Require audit:replay for the UI action.
Add confirmation, loading, success, and failure feedback.
Handle backend 403 correctly.
Add tests.

Do not implement LaunchDarkly yet.
```

## F11 — LaunchDarkly

Use flags:
- audit-live-stream
- audit-data-export
- audit-new-search
- audit-sensitive-data-view
- audit-dlq-replay

Acceptance:
- provider configured
- user/tenant context supported
- live stream/replay/new search can be toggled
- Auth0 permissions still apply

Codex prompt:
```text
Implement Phase F11 only.

Integrate LaunchDarkly React SDK.

Flags:
audit-live-stream
audit-data-export
audit-new-search
audit-sensitive-data-view
audit-dlq-replay

Use flags for rollout, not authorization.
Support user/tenant targeting where available.
Document environment variables.
```

## F12 — Search UX Enhancement

Behind:
- audit-new-search

Possible improvements:
- filter drawer
- active filter chips
- clear-all
- correlation ID quick search
- improved date controls

Acceptance:
- old/new search can coexist
- flag toggles new UX
- same backend API behavior
- no duplicate data-fetch architecture

Codex prompt:
```text
Implement Phase F12 only.

Create an improved Audit Explorer search/filter experience behind audit-new-search.

Add a small set of useful improvements such as filter drawer, active filter chips, clear-all, quick correlation-ID search, and improved date controls.

Keep the same backend API behavior and RTK Query architecture.
```

## F13 — React Performance Showcase

Use where justified:
- virtualization
- useTransition
- React.memo
- useMemo
- useCallback
- lazy
- Suspense

Acceptance:
- large lists stay responsive
- visible-row rendering is efficient
- filter/search stays usable
- README explains React scheduling/Fiber relationship accurately

Codex prompt:
```text
Implement Phase F13 only.

Optimize the Audit Explorer for large event sets.

Use virtualization, useTransition, memoization, lazy loading, and Suspense only where justified.

Do not claim to implement React Fiber.

Document how the implementation demonstrates React scheduling/rendering concepts.
Measure and avoid unnecessary optimization.
```

## F14 — Client-Ready UI Polish

Review:
- responsive layout
- navigation
- hierarchy
- typography
- spacing
- loading/error/empty/forbidden states
- accessibility

Acceptance:
- consistent UI
- primary flows understandable
- no placeholder text
- no broken navigation

Codex prompt:
```text
Implement Phase F14 only.

Polish the Audit Trail Console for client presentation.

Improve layout, navigation, typography, spacing, responsiveness, loading/error/empty/forbidden states, and accessibility.

Do not add unnecessary new product features.

Run lint, typecheck, tests, and build.
```

## F15 — Documentation and CI

Add:
- complete README
- architecture overview
- backend dependency notes
- Auth0 setup
- LaunchDarkly setup
- .env.example
- local development instructions
- test instructions
- production build instructions
- demo script
- GitHub Actions CI

CI:
- install
- lint
- typecheck
- test
- build

Acceptance:
- fresh clone runs
- env setup documented
- backend dependency documented
- CI passes
- no secrets committed
- demo flow documented

Codex prompt:
```text
Implement Phase F15 only.

Prepare audit-trail-console for client sharing.

Add complete README, architecture overview, backend dependency notes, Auth0 setup, LaunchDarkly setup, .env.example, local development instructions, tests, production build instructions, client demo script, and GitHub Actions CI.

CI must run install, lint, typecheck, test, and build.

Verify no secrets are committed.
Run the full validation suite.
```

# Build Order

```text
F0 Foundation
F1 Auth0
F2 API Types/Base Query
F3 Dashboard
F4 Audit Explorer
F5 Event Detail
F6 Timeline
F7 Permission UX
F8 SSE
F9 DLQ Viewer
F10 Replay
F11 LaunchDarkly
F12 New Search
F13 Performance
F14 UI Polish
F15 Docs/CI
```

# Recommended First Milestone

```text
Auth0 Login
   ↓
Dashboard
   ↓
Audit Explorer
   ↓
Event Detail
   ↓
Correlation Timeline
```

Then add:
```text
SSE
DLQ
Replay
LaunchDarkly
Performance
```

# Reusable Codex Session Prompt

```text
Read AGENTS.md and IMPLEMENTATION_PLAN.md.

Inspect the current repository before changing anything.

Implement Phase FX only.

Do not implement future phases.
Preserve existing working behavior.
Follow AGENTS.md.

Run:
- format
- lint
- typecheck
- tests
- build

Fix failures before finishing.

At the end report:
1. files changed
2. architecture decisions
3. tests/commands executed
4. known limitations
5. acceptance criteria status
6. next phase, without implementing it
```
