# Database

The app has nine Prisma models mapped to snake_case tables: `users`, `products`, `product_variants`, `batches`, `orders`, `order_items`, `payment_methods`, `payment_submissions`, and `inventory_movements`. Express also uses the infrastructure `session` table; Prisma maintains `_prisma_migrations`. The importable diagram is `docs/schema.dbml`.

## Roles and catalog

Roles are `ADMIN` and `CUSTOMER`; self-registration always creates a customer. Every privileged request reloads the account role from PostgreSQL. An admin reviews payment proofs as well as managing products, variants, batches, and pickup.

A product is either `CONTINUOUS` or `BATCH`, with `DRAFT`, `PUBLISHED`, or `ARCHIVED` publication status. Products are created with at least one variant. Size/color are normalized to uppercase; STANDARD represents an option that is not offered. Batch products require preset sizes and start with zero ready stock. Prices and inventory exist only on variants. SKU and product/size/color combinations are unique. There are no separate categories/options/reviews/gallery/audit tables.

## Orders and inventory

Orders contain continuous items or items from one production batch. The storefront splits mixed bags into separately payable orders. A batch item requires an embroidery name; different names remain separate order lines. Item descriptions and prices are immutable snapshots through the API. Total is calculated using Decimal arithmetic, in IDR. Campus pickup is the only fulfillment method.

Continuous checkout increments reserved quantity, using serializable transactions with bounded retries. Availability is on-hand minus reserved. Cancellation or expiry releases reservations exactly once. Approval consumes continuous reservations and physical stock; pickup must not consume them again.

Batch checkout and payment do not consume ready stock. Admins close the batch, receive production quantities, and the API allocates stock to its paid orders in creation order. Only fully allocated orders become ready for pickup. Ledger entries tag receipts/reservations with their batch, preventing another batch from spending those receipts. Collection consumes the batch reservation and physical stock.

Every inventory change appends a movement in the same transaction as its balance update. SQL rejects ledger updates/deletes, negative stock, invalid reservations, nonpositive prices/quantities, invalid batch dates, and zero-change movements. Referenced records cannot be deleted.

## Payments and expiry

Orders have a 48-hour deadline. Timely submitted proof holds the order and stock while awaiting review. Rejection permits a new submission before the original deadline; rejection after it expires the order and releases ready-stock reservations. The worker checks overdue unpaid orders every minute and skips submitted proofs. It coordinates through serializable transactions and runs only while the API is running.

Each submission snapshots the selected bank/QRIS details. Actual payment must be verified by an admin against the official account. Partial unique indexes allow at most one pending and one verified submission per order and prevent reuse of a verified transaction reference for the same payment method. Reviewed evidence is immutable through SQL triggers. Receipts are stored outside the public web directory and are served only to their owner or an admin.

## Migrations and fresh local reset

Migration history is retained: the original baseline, the earlier additive Flowstep migration, and the new `20261030000000_minimal_ekraf` forward migration. The last migration deliberately rebuilds empty legacy application tables and refuses populated legacy users/products/orders. It preserves session storage. This is intended for the authorized local fresh start, not migration of a populated production database.

Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:check`. The checker is read-only and reconciles variant balances against the stock ledger, verifies product/batch relationships, and checks payment consistency.

To deliberately discard this project's local database again:

```powershell
docker compose -p mipa-store down --volumes
docker compose -p mipa-store up -d --wait
npm run db:migrate
npm run db:generate
```

This removes all users, products, orders, and payments in the project volume. It does not remove Docker Desktop or other projects' resources. Receipt files are outside the database volume and require separate retention/cleanup decisions.

## Backup

Back up both PostgreSQL and the private receipt directory to restricted storage outside the app host. Restore them together to a separate environment and verify item snapshots, payment history, receipt access, and inventory reconciliation. Configure scheduled backups and record a restore exercise before production rollout. No remote backup service is configured by this repository.
