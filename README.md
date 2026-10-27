# MIPA Store

A small campus creative economy shop built as a modular monolith. The repository contains a Next.js App Router storefront and an Express API backed by PostgreSQL and Prisma ORM 7. The first version supports pickup orders and manual payment verification; it does not connect to a payment gateway.

## Local quick start

Requirements: Node.js 24.11 or newer, npm, and Docker Desktop (or a local PostgreSQL 17 database).

1. Copy `.env.example` to `.env` and set a random `SESSION_SECRET` with at least 32 characters. Set `PAYMENT_INSTRUCTIONS` to current approved organizational instructions.
2. Run `docker compose up -d db`.
3. Run `npm install`.
4. Run `npm run db:generate` and `npm run db:migrate`.
5. Run `npm run dev` and open <http://localhost:5173>.

See [docs/SETUP.md](docs/SETUP.md) for account setup and configuration, then [docs/HANDOVER.md](docs/HANDOVER.md) before transferring ownership.

## Current status

This is an MVP foundation, not a production launch approval. No organization payment account, image storage, production hosting, backup service, domain, or GitHub organization ownership has been configured or verified. Product images currently use HTTPS URLs; secure file upload is not implemented. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), and [docs/SECURITY.md](docs/SECURITY.md) for remaining work.
