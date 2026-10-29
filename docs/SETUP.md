# Local setup

Requires Node.js 24.11+, npm, Docker Desktop (or PostgreSQL 17).

1. Copy `.env.example` to `.env` and set a random 32+ character `SESSION_SECRET`.
2. Run `docker compose up -d --wait`.
3. Run `npm install`, `npm run db:generate`, `npm run db:migrate`, and `npm run db:check`.
4. Create an administrator, then start the app with `npm run dev` at http://localhost:5173.

## First administrator

From the repository root, set temporary values in PowerShell:

```powershell
$env:ADMIN_EMAIL = 'your-organization-email@example.com'
$env:ADMIN_NAME = 'Store Admin'
$env:ADMIN_PASSWORD = 'replace-with-a-unique-password-of-at-least-12-characters'
npm --workspace api run admin:bootstrap
Remove-Item Env:ADMIN_PASSWORD
```

Use your real email and a unique password. The script refuses to create another admin once one exists. Customer registration cannot choose the admin role. The optional local bootstrap endpoint remains available only when explicitly enabled using `ALLOW_ADMIN_BOOTSTRAP` and `ADMIN_BOOTSTRAP_TOKEN`; it is unavailable in production. Prefer the command above.

## Populate the store

Open the private admin URL described below and sign in there. In Admin > Payment Settings, enter official bank or QRIS details. In Products, create a product and its first variant. Choose No size when a product has no size option; blank color becomes STANDARD. Add more sizes/colors using Add another variant. Only published products appear publicly. Batch products require preset sizes and zero initial stock. In Batches, create and open a production window. All dates entered in the UI use the operator's local timezone.

Stock adjustments for continuous products require a reason. Batch stock is received through the batch receipt form. Products are archived and variants/payment methods are disabled rather than deleted.

## Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: private session signing secret, minimum 32 characters.
- `FRONTEND_ORIGIN`: exact browser origin, default http://localhost:5173.
- `API_INTERNAL_ORIGIN`: Next.js rewrite destination, default http://localhost:3000; provide at build/development startup.
- `API_PORT`: API port, default 3000.
- `NODE_ENV`: development, test, or production. Production requires HTTPS cookies.
- `RECEIPT_STORAGE_DIR`: optional absolute private directory; default is storage/receipts relative to the API working directory. Use persistent storage in deployment.

The previous PAYMENT_INSTRUCTIONS setting is unused. Official payment details now live in Admin > Payment Settings.

## Validation

`npm run build`, `npm test`, and `npm run db:check` run the standard checks. Integration tests require a dedicated empty migrated local database whose name ends in `_test`:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mipa_store_test?schema=public'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
npm run db:migrate
npm --workspace api run test:integration
Remove-Item Env:DATABASE_URL, Env:TEST_DATABASE_URL
```

Create that test database first. Integration tests populate it with test accounts/orders; do not point them at your development or production database. Browser checks use Python Playwright with `web/test/run-smoke.py`. See `docs/FLOWSTEP.md` for the isolated API port and build configuration.

## Private admin panel

ADMIN_PANEL_PATH is a server-only URL segment in the root .env file. Open http://localhost:5173/<ADMIN_PANEL_PATH> and use the dedicated admin login. The local path was generated randomly during setup. Use a 16–100 character segment of letters, digits, hyphens or underscores; an absent/invalid setting or any other path returns 404. Never prefix this setting with NEXT_PUBLIC_. Next.js loads the shared root .env on server startup. In deployment provide the same setting to the Next.js server and restart after changing it.

There is no admin link in the public store. The private URL still requires ADMIN credentials; customers cannot use the admin login or APIs. Create the first admin with the existing bootstrap command.

Mixed checkout accepts several batches in one order. FULL pays all items initially; BATCH_DEPOSIT pays all merchandise plus half the batch subtotal. Initial payment is due within 24 hours; a verified deposit preserves the order until its balance is paid before batch collection. Merchandise and batch items have independent pickup controls.

## Categories, sizes, colors, and SKUs

The product category dropdown offers T-shirt, Faculty Jacket, Work Shirt, Hoodie, Tote Bag, Accessories, and Other. Choosing Other requires a custom category name. Existing custom categories remain selected as Other when editing.

Each variant form creates one combination. For example, create M / Black with its price and stock, then use Add another variant for L / Black. Do not enter a list such as S, M, L in a single box. Choose No size for items without size options. Batch products must choose XS, S, M, L, XL, XXL, or XXXL and start with zero ready stock.

Color is a plain text field. Type one color name, such as Black or Forest Green; leaving it blank means no color option. The server trims, collapses repeated spaces, and uppercases size/color values before saving.

SKU is generated automatically when saving, for example EKR-7F28D6AB940C, and is displayed with the saved variant. Product, category, price, and stock changes never regenerate it. Existing SKUs remain unchanged. Existing API clients may still supply an explicit SKU; omitting it enables generation. GET /api/admin/catalog-options returns the shared form choices and requires ADMIN authentication.
