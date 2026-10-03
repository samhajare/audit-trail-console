# AGENTS.md

# Project: Audit Trail Console

This repository is the frontend console for the Real-Time Audit Trail Explorer.

It demonstrates:
- React
- TypeScript
- Redux Toolkit
- RTK Query
- React Router
- Auth0 React SDK
- LaunchDarkly React SDK
- Server-Sent Events
- React rendering/performance concepts
- Vite
- Testing

The backend lives in a separate repository named `audit-trail-service`.

The frontend must communicate with the backend only through documented REST and SSE APIs.

## Core Responsibilities
- authenticate users through Auth0
- render the audit dashboard
- search and filter audit events
- show audit event details
- visualize before/after changes
- show correlation-ID timelines
- receive live audit events through SSE
- show DLQ entries for authorized users
- replay DLQ events through backend APIs
- respect permission-aware UX
- evaluate LaunchDarkly frontend feature flags
- remain responsive with large event lists

Frontend permission checks are for UX only. The backend remains authoritative.

## Technology
Use:
- React
- TypeScript strict mode
- Vite
- Redux Toolkit
- RTK Query
- React Router
- Auth0 React SDK
- LaunchDarkly React SDK
- React Testing Library
- Vitest or Jest

Do not add Next.js, GraphQL, MobX, Zustand, or another state manager unless explicitly requested.

## Repository Structure

```text
audit-trail-console/
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
public/
test/
AGENTS.md
IMPLEMENTATION_PLAN.md
README.md
.env.example
```

## Backend Integration
Expected backend APIs:
- GET /health
- GET /audit/events
- GET /audit/events/:id
- GET /audit/timeline/:correlationId
- GET /audit/statistics
- GET /audit/dlq
- GET /audit/dlq/:eventId
- POST /audit/dlq/:eventId/replay
- GET /audit/stream

Do not import backend source code directly. Define frontend API response types locally.

## State Management
Use Redux Toolkit for:
- audit filters
- pagination preferences
- UI preferences
- live-stream connection state
- client-side feature state

Use RTK Query for:
- audit event list
- event details
- statistics
- timeline
- DLQ list/details

Do not manually copy RTK Query responses into slices without a clear need.

## Authentication
Use Auth0 React SDK.

Support:
- login
- logout
- protected routes
- access token retrieval
- authenticated user context
- permission-aware UI

## Roles and Permissions
Roles:
- AUDIT_VIEWER
- AUDIT_ANALYST
- AUDIT_ADMIN

Permissions:
- audit:read
- audit:export
- audit:view-sensitive
- audit:replay
- audit:manage

Use permissions to control UX, but still handle backend 401/403 responses.

## API Layer
Use RTK Query.

Attach Auth0 access tokens to requests.

Handle:
- 401
- 403
- 404
- 409
- 5xx
- network failures

Do not swallow failures silently.

## Audit Explorer
Support filters:
- eventType
- actor
- resourceType
- resourceId
- service
- severity
- correlationId
- from
- to

Support pagination:
- page
- limit

Expected columns:
- timestamp
- event type
- actor
- action
- resource
- service
- correlation ID
- severity

Use URL query parameters for shareable filter state where practical.

## Event Details
Show:
- event ID
- event type
- timestamp
- actor
- resource
- action
- service
- tenant context if returned
- correlation ID
- severity
- before data
- after data
- context
- metadata
- raw JSON

## Timeline
Correlation timeline should:
- fetch by correlation ID
- order chronologically
- show event type, timestamp, actor, action, resource, service
- allow navigation to event details

## Dashboard
Show meaningful summaries:
- events today
- events by type
- latest activity
- high-severity events
- active actors/users if backend provides it

Avoid meaningless charts.

## Real-Time Streaming
Use Server-Sent Events.

Requirements:
- connect only when authenticated and enabled
- reconnect appropriately
- show connection state
- deduplicate by eventId
- update latest activity
- avoid excessive rerenders
- clean up on logout/unmount

Do not introduce WebSocket unless SSE is proven insufficient.

## LaunchDarkly
Suggested flags:
- audit-live-stream
- audit-data-export
- audit-new-search
- audit-sensitive-data-view
- audit-dlq-replay

Feature flags control rollout, not authorization.

## React Performance
Do not claim to implement React Fiber.

Use where justified:
- React.memo
- useMemo
- useCallback
- useTransition
- lazy
- Suspense
- list virtualization

Optimize based on real rendering needs, not blindly.

## UX States
Every major screen must support:
- loading
- error
- empty
- forbidden/unauthorized where applicable

## Styling
Use a clean professional admin-console style.
Prioritize hierarchy, spacing, readability, responsiveness, and accessibility.
Do not overdesign.

## Accessibility
At minimum:
- semantic HTML
- keyboard-accessible controls
- labels
- focus-visible states
- accessible buttons/links
- meaningful errors and empty states

## Testing
Use React Testing Library with Vitest or Jest.

Cover:
- protected routes
- auth loading/authenticated states
- audit list
- filters
- pagination
- event details
- timeline
- permission-aware replay
- SSE connection state where practical
- error states

## Environment Variables
Use `.env.example`.

Expected:
- VITE_API_BASE_URL
- VITE_AUTH0_DOMAIN
- VITE_AUTH0_CLIENT_ID
- VITE_AUTH0_AUDIENCE
- VITE_LAUNCHDARKLY_CLIENT_ID

Never commit real credentials.

## Scope Control
Do not add unless explicitly required:
- Next.js
- SSR
- GraphQL
- another state manager
- micro-frontends
- backend logic
- duplicated authorization logic

## Codex Working Rules
For every phase:
1. Read AGENTS.md.
2. Read IMPLEMENTATION_PLAN.md.
3. Inspect the current repository.
4. Implement only the requested phase.
5. Preserve existing behavior.
6. Do not redesign earlier phases without a strong reason.
7. Add/update tests.
8. Run format, lint, typecheck, tests, and build.
9. Fix failures.
10. Report files changed, architecture decisions, tests run, known limitations, and acceptance criteria.

Do not implement future phases early.

## Definition of Done
A phase is complete only when:
- code is implemented
- typecheck passes
- lint passes
- tests pass
- build passes
- documentation is updated where needed
- no secrets are committed
- acceptance criteria are satisfied
