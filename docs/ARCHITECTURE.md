# Architecture

## Shape

One repository with a Next.js web process and one Express API process. `web/` is a React + TypeScript App Router application; the route and layout are server components, with the interactive storefront isolated in a client feature. `api/` is an Express 5 TypeScript API. PostgreSQL is the system of record; Prisma 7 provides typed access and checked-in migrations. The browser calls same-origin `/api` paths; Next.js rewrites proxy these to the API in development and production. Set `API_INTERNAL_ORIGIN` when starting development and in the Next.js build environment, because the rewrite destination is recorded during the build. Set `FRONTEND_ORIGIN` to the public browser origin.

```text
Customer / staff browser
        │ HTTPS, session cookie + CSRF token
        ▼
Next.js storefront ── same-origin /api rewrite ── Express modular API
                                  │
                                  ▼
                         Managed PostgreSQL
```

## Responsibilities

- Authentication: Argon2id password hashes, PostgreSQL-backed sessions, fixed roles, login rate limit.
- Catalog: active products and categories; admin edits prices, descriptions, HTTPS image URLs, and stock.
- Checkout: server loads current prices, decrements stock conditionally in one serializable transaction, snapshots names/prices, and records stock movements.
- Orders: public UUID reference, customer ownership checks, separate payment and fulfillment states, 48-hour stock reservation expiry.
- Payments: manual reference submission and staff decision. Customer-supplied evidence never changes payment status.
- Audit: payment decisions, product changes, fulfillment updates, cancellation, and expiry append events.

## Important boundaries and current limits

This is a single-instance MVP. Sessions and domain data are in PostgreSQL, but login throttling is in process memory. Deploy one API instance until a shared rate-limit store is added. Payment and audit records are append-only through the application API; restrict database credentials and audit access. Product image URLs must use HTTPS, but there is no upload/storage integration. No outbound email, password recovery, gateway, shipping provider, or automated delivery notification exists.

The app currently uses one role per account (`CUSTOMER`, `ADMIN`, or `TREASURER`). Product and fulfillment changes require `ADMIN`; order review and manual payment decisions allow `ADMIN` and `TREASURER`.
