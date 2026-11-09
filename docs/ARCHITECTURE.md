# Architecture

Next.js App Router provides the customer store and private admin panel. Express handles authentication, authorization, validation, checkout, payments, inventory, and pickup. PostgreSQL 17 through Prisma 7 is the source of truth.

## Code map

| Location | Responsibility |
| --- | --- |
| `api/src/index.ts` | Configuration, PostgreSQL sessions, authentication, roles, CSRF, errors, expiry worker. |
| `api/src/store-routes.ts` | Catalog mutations, orders, private proof uploads/review, stock, pickup, announcements. |
| `api/src/store-queries.ts` | Detail/list queries, pagination, reporting, dashboard, CSV exports. |
| `api/src/store-service.ts` | Serializable transactions/retries, totals, ledger changes, allocation, expiry. |
| `api/prisma/schema.prisma` | Authoritative data model; committed migrations preserve the deployment chain. |
| `web/src/features/store/store-provider.tsx` | Authentication, CSRF, notifications, persistent cart, checkout idempotency. |
| `web/src/features/store/store-pages.tsx`, `order-card.tsx` | Customer catalog, customization, checkout, order/payment views. |
| `web/src/features/store/admin-*.tsx` | Admin layout, lists, reports, and editors. |
| `web/src/features/store/announcements.tsx`, `account-page.tsx` | Announcements and account management. |
| `web/src/flowstep.css`, `admin.css`, `responsive.css` | Shared storefront, admin, and responsive presentation. |

## Routes and state

Customer routes: `/`, `/products/[id]`, `/batch-orders/[id]`, `/cart`, `/orders`, `/orders/[id]`, `/orders/[id]/payment`, `/account`, `/announcements`, `/about`, `/sign-in`, `/register`. `/batch-orders` redirects to the store's batch collection.

The `ADMIN_PANEL_PATH` layout validates the private segment for every nested route. Sections are dashboard, orders, payments, products, batches, customers, announcements, and settings. Every admin API independently requires ADMIN. Receipts require their owner or ADMIN.

Cart and checkout keys persist under `ekraf:cart:v3` and `ekraf:checkout:v3`. Checkout stores a UUID before submission so retries reuse it. Changing cart contents/payment plan invalidates it; successful checkout clears it. List filters and pagination stay in URLs.

The visual reference originated from Flowstep's customer/admin screens. Existing local merchandise artwork and campus doodle are the current visual assets; catalog imagery comes from uploaded product galleries, with existing HTTPS images retained. The app uses real data and explicit empty/loading/error states.

Local hero photographs use Next.js responsive image delivery with intrinsic dimensions. Both load eagerly; the jacket gets high fetch priority. Catalog galleries load images lazily, while the first product-detail photo loads eagerly. Shop cards link to product details using only the cover photo. Product details provide native horizontal scrolling, keyboard navigation, unboxed < / > controls, and selectable thumbnails for the ordered gallery. `/api/admin/images` accepts raw authenticated image uploads; `/api/media/:filename` serves only validated public asset names. Receipts remain in their separate private storage/owner-authorized endpoint. Collection and announcement placeholders reserve space during initial loading. Admin announcement editing lives in its own module so customer pages do not import the product/variant forms. The API callback stays stable across session refreshes and reads the latest CSRF token when sending a mutation.

## Query and reporting conventions

Lists retain their array fields and add pagination, summaries, and effective date ranges. Default page size is 20; requests above 100 are rejected. CSV exports include all matching rows and escape spreadsheet formulas.

Public lists default to all dates. Admin Products also defaults to all dates; other admin reporting defaults to the current Jakarta month through today. Explicit end dates include the full Asia/Jakarta day, with ranges limited to 366 days. Catalog/batch/order/customer filters use record creation; submission queues use submission dates; dashboard revenue uses verification dates.

Summary cards use the date range before search/status filtering. Operational pending proofs, closing batches, and low stock describe current work. Dashboard revenue sums VERIFIED deposits and balances once each. Comparisons use the preceding equally sized period; a zero baseline is neutral. Customer spending uses verified money; repeat buyers have at least two PAID/PARTIALLY_PAID orders; average order value uses full historical totals.

The browser never sets trusted prices, totals, stock changes, reviewers, or payment decisions. See [Database](DATABASE.md) for business invariants and [Operations](OPERATIONS.md) for deployment/security limits.
