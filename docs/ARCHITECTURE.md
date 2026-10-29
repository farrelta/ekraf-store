# Architecture

Next.js App Router renders the storefront, account orders, and an on-demand admin workspace. Express handles cookie authentication, CSRF checks, authorization, catalog management, checkout, receipt review and pickup. PostgreSQL 17 with Prisma 7 is the source of truth.

- `api/src/index.ts`: application configuration, sessions, authentication, role checks, error handling and worker lifecycle.
- `api/src/store-routes.ts`: validated store/admin HTTP interfaces and private receipt access.
- `api/src/store-service.ts`: serializable transaction retries, order totals, inventory movements, batch allocation and expiry.
- `web/src/features/store`: storefront, typed display data, order/payment forms and separately loaded admin tools.

There are nine application tables, plus session and migration infrastructure tables. Prisma uses camelCase in TypeScript and snake_case physical table/column mappings. The importable diagram is `docs/schema.dbml`.

Only CUSTOMER and ADMIN exist. Every privileged request reloads the role from the database. Registration always creates a customer. Admins manage products/batches/payment methods and verify payments. Owners can access their orders and private receipt images. Admins sign in through a dedicated, server-configured private panel URL; the public store has no admin navigation.

The browser never chooses prices, totals, stock changes, reviewers or payment decisions. Checkout uses UUID idempotency keys; concurrent stock changes run in serializable transactions with bounded retries. Stock history is append-only. Approved/rejected payment evidence is immutable. One-minute expiry skips receipts awaiting review. Batch receipts are allocated separately by production window.

Payment receipts use persistent private local disk storage in this initial version. Multi-host deployment needs shared private storage or an object-store implementation. Product and QRIS images use approved HTTPS URLs. The app has no payment gateway, shipping integration, general audit log, product review system or automated refunds.
