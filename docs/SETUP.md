# Local setup

Requires Node.js 24.11+, npm, and Docker Desktop or PostgreSQL 17.

## Start the app

1. Copy `.env.example` to `.env`. Set a random `SESSION_SECRET` of at least 32 characters and a private `ADMIN_PANEL_PATH` of 16–100 letters, digits, hyphens, or underscores.
2. Start PostgreSQL with `docker compose up -d --wait`, or configure `DATABASE_URL` for your existing local database.
3. Run:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:check
```

4. Create the first administrator below, then run `npm run dev`.
5. Open http://localhost:5173. Open `http://localhost:5173/<ADMIN_PANEL_PATH>` for the separate admin login.

Normal setup does not seed products, payment methods, or passwords. For an isolated store with sample data, use [E2E testing](E2E-TESTING.md).

## First administrator

From the repository root:

```powershell
$env:ADMIN_EMAIL = 'your-organization-email@example.com'
$env:ADMIN_NAME = 'Store Admin'
$env:ADMIN_PASSWORD = 'replace-with-a-unique-password-of-at-least-12-characters'
npm --workspace api run admin:bootstrap
Remove-Item Env:ADMIN_PASSWORD
```

The script refuses to create another admin once one exists. Public registration always creates CUSTOMER. The optional bootstrap HTTP endpoint is disabled by default and unavailable in production. The private admin URL still requires ADMIN authentication.

## Configure the store

- **Payment Settings:** add official QRIS or bank account details. Product and QRIS images use HTTPS URLs.
- **Products:** create a product and its first variant, then publish it. Categories include standard choices and Other. Each variant represents one size/color/type combination with its own price, stock, active flag, and automatically generated immutable SKU.
- **Options:** enter one plain-text color/type per variant; blank means no option. Continuous products may omit all options. Batch products require a preset size and zero initial stock; embroidery is controlled by the product's Require an embroidery name checkbox.
- **Batches:** create an order window and production estimate in whole weeks. Multiple batches can be open independently. Receive delivered stock through the batch editor; use reasoned stock adjustments for continuous products.
- **Announcements:** publish store news, maintenance, sales, or pickup instructions independently of batches. Optional start/end dates control visibility. Home rotates messages every six seconds and refreshes within 30 seconds or on window focus. The bell opens `/announcements`.

Customers register with name, email, password, and phone. They edit contact details at `/account`; email changes require the current password. Checkout displays saved contact details as text. Legacy accounts must add a phone on Account before ordering. Profile changes affect future orders only.

See [database and payment rules](DATABASE.md) for deposits, stock, pickup, and deletion restrictions.

## Environment settings

Use [.env.example](../.env.example) as the normal configuration reference. [The E2E example](../.env.e2e.example) documents the separately generated test configuration.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL`, `SESSION_SECRET` | Database connection and private session signing secret. |
| `FRONTEND_ORIGIN` | Exact browser origin; normally `http://localhost:5173`. |
| `API_INTERNAL_ORIGIN` | Next.js API rewrite destination, set before build/start; normally `http://localhost:3000`. |
| `API_PORT`, `API_HOST` | API port and bind address; defaults 3000 and `0.0.0.0`. |
| `ADMIN_PANEL_PATH` | Server-only private URL segment; never prefix with `NEXT_PUBLIC_`. |
| `RECEIPT_STORAGE_DIR` | Private persistent receipt directory; defaults to `storage/receipts` from the API working directory. |
| `NODE_ENV` | Development, test, or production; production uses Secure cookies. |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_PAYMENT_REVIEW_HOURS` | Public pickup/payment support details. |
| `ALLOWED_DEV_ORIGINS` | Additional development origins, such as an approved tunnel hostname. |

Restart after server configuration changes. Payment destinations are managed in admin, not environment variables.

## Checks

```powershell
npm test
npm run build
npm run db:check
node --test web/test/money.test.mjs
```

Integration and browser prerequisites, isolated environment commands, and the full customer/admin checklist are in [E2E testing](E2E-TESTING.md). Deployment and recovery are in [Operations](OPERATIONS.md).
