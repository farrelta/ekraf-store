# EKRAF BEM KM MIPA UGM Store

Next.js storefront and Express API backed by PostgreSQL 17 and Prisma 7. The app sells continuous-stock merchandise and batch products with preset sizes and optional embroidery, using manual QRIS/bank verification and campus pickup.

## Local start

1. Copy `.env.example` to `.env`; set a random `SESSION_SECRET` and private `ADMIN_PANEL_PATH`.
2. Start Docker Desktop, then run `docker compose up -d --wait`.
3. Run `npm install`, `npm run db:generate`, and `npm run db:migrate`.
4. Create the first administrator using [Setup](docs/SETUP.md), then run `npm run dev` and visit http://localhost:5173.
5. Add official payment methods, products/variants, announcements, and batches in the private admin panel.

Only ADMIN and CUSTOMER roles exist. Customers need an account before checkout and can edit their profile. Mixed orders support full payment or full merchandise plus a 50% batch deposit, with a 24-hour initial deadline and balance verification before batch pickup. Each item has its own pickup state.

Normal setup does not seed products, payment methods, or passwords. For sample data and separate customer/admin test accounts, follow [E2E testing](docs/E2E-TESTING.md).

## Documentation

| Document | Use it for |
| --- | --- |
| [Setup](docs/SETUP.md) | Local startup, admin account, configuration, catalog entry, standard checks. |
| [Design system](DESIGN.md) | Current colors, typography, components, artwork, and responsive behavior. |
| [Architecture](docs/ARCHITECTURE.md) | Source map, routes, shared state, queries, reporting definitions. |
| [Database](docs/DATABASE.md) | Tables, variants, deposits, inventory, pickup, retention, migrations. |
| [drawDB schema](docs/schema.dbml) | Importable database diagram. |
| [Operations](docs/OPERATIONS.md) | Deployment, security limits, reconciliation, backups, recovery, handover. |
| [E2E testing](docs/E2E-TESTING.md) | Isolated test environment and full customer/admin checklist. |

## Checks

```powershell
npm test
npm run build
npm run db:check
```

The integration suite requires a dedicated empty migrated local database ending in `_test`. Never point it at a populated normal or manual-test store. Receipt files are private and need persistent storage backed up alongside PostgreSQL. No payment gateway or automated refunds are connected.
