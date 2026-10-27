# Database, migration, backup, and restore

PostgreSQL is the source of truth. `api/prisma/schema.prisma` defines the schema and `api/prisma/migrations/` contains committed SQL migrations. Monetary amounts use fixed precision `Decimal(12,2)`; the currency is stored as `IDR`. Order items snapshot product name, unit price, quantity, and line total. Product deactivation preserves order history; order item product references become nullable if a product is removed.

## Inventory behavior

Checkout reserves stock by decrementing it inside a serializable transaction. Conditional `stock >= quantity` updates prevent overselling; failed transactions roll back all decrements. Each order reserves stock for 48 hours. A worker in the API checks each minute and atomically marks expired pending orders and restores their stock once. Customers can cancel only pending orders, and treasurers can reject a payment; either path marks fulfillment cancelled and records matching stock movements in the same transaction. This requires the API process to be running for expiry automation. Monitor pending orders and keep a single API instance until worker coordination is externalized.

## Migrations

Run `npm run db:generate` after schema changes, create a reviewed migration in development, and commit both schema and migration SQL. Production uses `npm run db:migrate` (`prisma migrate deploy`). Take a backup before applying migrations; prefer additive migrations and a maintenance window for destructive changes. No production database is currently configured.

## Backup baseline to configure before launch

Use the managed database's scheduled encrypted backups or `pg_dump` to a separate organization-controlled storage account. Keep daily backups for at least 14 days and a monthly copy for 3 months. Restrict access and encrypt exports. Never store backups only on the app host or in this repository. The retention values are a proposed baseline, not an active configuration.

Example manual export and restore against a non-production database:

```sh
pg_dump --format=custom --no-owner "$DATABASE_URL" --file=mipa-store-YYYYMMDD.dump
createdb mipa_store_restore_check
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" mipa-store-YYYYMMDD.dump
```

After restoring, run migrations if required and verify product count, a test order with snapshots, payment history, and session availability. Delete the temporary restore database after sign-off. A restoration has not yet been run; schedule and record a restore exercise before launch and every six months.
