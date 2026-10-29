# Flowstep implementation

The 22 screens in the EKRAF Flowstep file are the visual references for the storefront and private administration pages. The Flowstep file was read without modification. Hero photos use the URLs in that design; catalog cards and details use each product's actual image URL, with a neutral placeholder for missing images. No example revenue, accounts, products, or orders are inserted into the store.

## Routes and shared state

Customer routes: `/`, `/products/[id]`, `/batch-orders`, `/batch-orders/[id]`, `/cart`, `/orders`, `/orders/[id]`, `/orders/[id]/payment`, `/about`, `/sign-in`, and `/register`.

The private admin segment remains configured by `ADMIN_PANEL_PATH`. Its layout validates that value for the entire nested route tree. Pages beneath it are `/orders`, `/payments`, `/products`, `/batches`, `/customers`, and `/settings`; records open nested detail pages, and products/batches have `/new` forms. The base address is the dashboard. The private path is not a substitute for authentication: every admin API requires ADMIN, and every receipt requires its owner or ADMIN.

`store-provider.tsx` owns authentication, CSRF, notices, and the bag. It retains the existing `ekraf:cart:v3` and `ekraf:checkout:v3` storage formats. A checkout UUID is stored before sending the request; retries and refreshes reuse it. Changing bag contents or payment plan invalidates it. Completed checkout clears the bag. URLs preserve list filters and pages for direct links and browser history.

`store-pages.tsx` implements customer views. `admin-console.tsx` supplies the authenticated layout; `admin-pages.tsx` renders reporting lists and details; `admin-forms.tsx` contains mutations. Shared display controls live in `ui.tsx`. CSS is separated into storefront tokens/layout, administration, and responsive rules. No public admin link or separate buying-guide page is provided.

## Query API

Lists retain their original array fields and add `pagination: { page, pageSize, total, pageCount }`, summaries, and the effective date range. Page size defaults to 20; values above 100 are rejected. Summaries use the date range before search, status, or segment filters. CSV exports ignore pagination and include all matching records.

| Endpoint | Filters and result |
|---|---|
| `GET /api/products`, `/api/admin/products` | `q` (or `search`), `type`, `category`, `sort=featured/price_asc/price_desc/newest/name`; admin additionally `status`, `stock=low/sold_out`. Retains `products`, includes summary/category choices. |
| `GET /api/products/:id`, `/api/admin/products/:id` | Public detail requires publication; public variants must be active. |
| `GET /api/cart/variants?ids=...` | At most 30 distinct active, published variants for restoring existing bags. |
| `GET /api/batches`, `/api/admin/batches` | `q`, admin `status`; public listing includes current open windows only. Counts and historical line-value order totals are calculated on the server. |
| `GET /api/batches/:id`, `/api/admin/batches/:id` | Product, variants and batch details; closed public detail remains viewable but cannot be purchased. |
| `GET /api/orders`, `/api/admin/orders` | `q`, `payment`, `pickup`, `awaiting=true`; admin additionally `userId`. Public list always belongs to the current customer. |
| `GET /api/orders/:id`, `/api/admin/orders/:id` | Historical line snapshots, payment installments, current amounts due, independent pickup states. |
| `GET /api/admin/payment-submissions` | `q`, `status=SUBMITTED/VERIFIED/REJECTED`, `phase=INITIAL/BALANCE`; private proof storage keys are omitted. |
| `GET /api/admin/payment-submissions/:id` | Selected evidence and its order for review. Approval/rejection uses the existing selected-submission mutation. |
| `GET /api/admin/customers`, `/api/admin/customers/:id` | Registered CUSTOMER accounts; `q`, `segment=all/repeat/batch`, verified spending, order counts/history. |
| `GET /api/admin/products/export`, `/api/admin/customers/export` | Authenticated CSV downloads with matching filters, quoted values and spreadsheet-formula escaping. |
| `GET /api/admin/dashboard` | Received money, daily series, previous-period comparison, recent orders, current operational actions, outstanding deposit balances. |

All lists support `page`, `pageSize`, `from`, and `to`. Admin date ranges default to the current Jakarta month through today; public lists default to all dates. End dates include the full Asia/Jakarta day, and explicit ranges are limited to 366 days. Catalog, batch, customer and order date filters refer to record creation; submission queues use submission dates. Dashboard revenue uses verification dates. Operational pending proofs, active/closing batches, and low stock describe current work, independent of historical revenue dates. Customer spending and repeat-buyer classification use lifetime verified payments/confirmed orders for accounts in the selected registration range.

Revenue sums VERIFIED submission amounts, including deposits and balances exactly once. Comparisons use the adjacent equally sized period; a zero baseline displays a neutral message. Repeat buyers have at least two PAID or PARTIALLY_PAID orders. Average confirmed order value uses full historical item totals, not deposit amounts. Continuous available stock is on-hand minus reserved: 1–5 is low stock, zero is sold out.

## Migration and verification

`20261101000000_flowstep_pages` adds only `products.featured` (false) and `batches.updated_at` (backfilled from `created_at`). Nine application tables remain. Never reset a populated store to apply this migration.

Before local application, the store was backed up to `api/storage/backups/ekraf-before-flowstep-pages-20261029.dump`, restored into an isolated database, populated with catalog fixtures, and migrated. Names, SKUs, prices, announcements, the existing account, and backfilled timestamps were verified. The local store then migrated successfully with zero database integrity violations. Backups are ignored by Git and should be stored privately.

Run `npm test`, `npm run build`, and `npm run db:check`. The integration suite needs an empty, migrated local `TEST_DATABASE_URL` ending in `_test`. It covers catalog/SKUs, stock races, immutable evidence, receipt privacy, rejection/resubmission, expiry, mixed deposits/balances, separate pickup, pagination, CSV escaping, customer aggregates, WIB boundaries, and date-edit safeguards.

The Python Playwright suite creates disposable fixtures only in that test database. Build the web app with `API_INTERNAL_ORIGIN` pointing at the test API port, then set `TEST_DATABASE_URL` and `TEST_API_PORT` and run `python web/test/run-smoke.py`. It checks forms, navigation, storage, checkout, selected proof review, item pickup, filters, exports, private-path 404s, and screenshots at 390/768/1440px. Screenshots are written under the system temporary directory, `ekraf-flowstep-checks`. Build again without the test origin before using the normal local environment.

Permanent deletion: Admin product details offer a confirmation before DELETE /api/admin/products/:id. Only DRAFT products with zero stock and no batches, order items, or inventory movements are eligible. The server checks and deletes variants/product in one serializable transaction. Other products must be archived. No schema migration is required.

Variant deletion only rejects variants referenced by order items (including cancelled orders), plus the last-variant safeguard. Stock levels and stock history do not block deletion. Migration `20261102000000_detach_variant_stock_history` backfills SKU snapshots and sets the stock movement reference to null when its variant is deleted. Stock records remain immutable; only automatic reference detachment is permitted. Local migration was backed up, tested, applied and integrity-checked.
