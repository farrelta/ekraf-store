# EKRAF BEM MIPA UGM Store

Next.js storefront and Express API backed by PostgreSQL 17 and Prisma 7. The initial version supports stock-tracked merchandise, batch products with preset sizes and embroidery names, manual QRIS/bank verification, and campus pickup.

## Local start

1. Copy `.env.example` to `.env`; set a random `SESSION_SECRET` of at least 32 characters.
2. Start Docker Desktop, then run `docker compose up -d --wait`.
3. Run `npm install`, `npm run db:generate`, and `npm run db:migrate`.
4. Create the first admin using [SETUP](docs/SETUP.md), then run `npm run dev` and visit http://localhost:5173.
5. In Admin, add official payment details, products/variants, and production batches. No products, bank accounts, QR codes, or admin passwords are seeded.

Only `ADMIN` and `CUSTOMER` roles exist. Mixed orders support full payment or full merchandise plus a 50% batch deposit, with the balance verified before batch pickup. Admins manage the catalog, review receipts, receive batch stock, and coordinate pickup. Customers register through the store.

See [database structure](docs/DATABASE.md), [drawDB schema](docs/schema.dbml), and [payment workflow](docs/PAYMENTS.md). The migration `20261030000000_minimal_ekraf` is a fresh-start transition that refuses to run if legacy users/products/orders contain data. Historical migration files remain for a reproducible deployment chain.

## Checks

- `npm run build`: compile API and build Next.js.
- `npm test`: role and pickup/payment transition checks.
- `npm run db:check`: read-only schema, ledger, and order integrity checks.
- `npm run test:integration --workspace api`: opt-in integration checks; requires an empty migrated local database ending in `_test` supplied through `TEST_DATABASE_URL`.

Payment receipts are uploaded privately to `api/storage/receipts` by default. Use a persistent private directory and back it up alongside PostgreSQL before deployment. Product and QRIS images use HTTPS URLs. No external payment gateway is connected.
