# Local setup

## Requirements

- Node.js 24.11+ and npm 11 (the checked-in lockfile is authoritative).
- Docker Desktop with Compose, or PostgreSQL 17.

## Start

1. Copy `.env.example` to `.env` in the repository root.
2. Replace `SESSION_SECRET` with a random secret of 32+ characters. For example, generate it with a password manager or local cryptographic generator; do not reuse an account password.
3. Set `PAYMENT_INSTRUCTIONS` only to information approved by the organization's treasurer. The example is not real payment information.
4. Start PostgreSQL with `docker compose up -d db`.
5. From the repository root run `npm install`, `npm run db:generate`, and `npm run db:migrate`.
6. Run `npm run dev`, then visit <http://localhost:5173>.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; use a least-privilege application user in production. |
| `SESSION_SECRET` | Signs session cookies; keep private and rotate with planned session invalidation. |
| `FRONTEND_ORIGIN` | One exact browser origin allowed by CORS and write-origin checks. |
| `API_INTERNAL_ORIGIN` | API origin used by the Next.js `/api` rewrite (default `http://localhost:3000`). Set to the API's private reachable URL in deployment. |
| `API_PORT` | API listen port (default 3000). |
| `NODE_ENV` | `development`, `test`, or `production`; production cookies require HTTPS. |
| `PAYMENT_INSTRUCTIONS` | Treasurer-approved manual payment instructions shown to customers. |
| `ALLOW_ADMIN_BOOTSTRAP`, `ADMIN_BOOTSTRAP_TOKEN` | Local-only optional first-admin endpoint; always unavailable in production. Prefer the controlled database bootstrap procedure in the handover guide for production. |

For a local first administrator, set `ALLOW_ADMIN_BOOTSTRAP=true` and a strong temporary `ADMIN_BOOTSTRAP_TOKEN`, fetch `GET /api/csrf`, then send `POST /api/admin/bootstrap` with that CSRF token, an `x-bootstrap-token`, and name/email/password. It is one-time and disabled after an admin exists. Do not put the token in source control. Customer registration creates only `CUSTOMER` accounts. For a controlled production first-admin bootstrap, set `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` only in a secured one-off operator environment, then run `npm run admin:bootstrap`; the script refuses to create an admin if one already exists. Remove the temporary password environment value afterward.

## Commands

- `npm run dev`: Next.js and API together (web at `http://localhost:5173`).
- `npm run build`: API compile then production frontend build.
- `npm test`: API unit tests.
- `npm run db:migrate`: apply checked-in migrations; never use schema reset on production.
- `npm run db:studio`: inspect local database records.
