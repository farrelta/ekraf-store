# Local customer and admin full-flow testing

This environment is separate from the normal store. All prices, bank details, QRIS artwork, receipts, customers, and orders here are test fixtures. Do not transfer money. WhatsApp contact is disabled in test mode.

## Open the test store

- Customer: http://127.0.0.1:5187
- Admin: http://127.0.0.1:5187/ekraf-test-admin-panel
- Admin email: `admin@example.test`
- Customer email: `customer@example.test`
- Other customer: `customer2@example.test`
- Existing customer with no phone saved: `legacy@example.test`
- Run `npm run e2e:info` to see the generated test-only password. It is also stored in the ignored `.env.e2e` file.
- Sample payment proof: `api/storage/e2e/sample-proof.png`.

Use separate browser profiles/windows for admin and customer. Multiple tabs in one profile share the same login. A normal window plus an incognito window works.

## Files to commit

Commit `scripts/e2e.mjs`, the npm scripts, test source files, `.env.e2e.example`, database migrations, and this checklist. The example documents generated configuration; normally run `npm run e2e:prepare` instead of copying it. Preparation generates the local `.env.e2e` with fresh secrets and machine-specific paths.

Do not commit `.env.e2e`, database dumps, uploaded proofs, screenshots, logs, process IDs, generated QR artwork, or `.next-e2e`. These are local state covered by `.gitignore`.

## Commands and isolation

```powershell
npm run e2e:prepare # creates/migrates/seeds only the dedicated test database
npm run e2e:start   # starts hidden test servers; normal store servers stay running
npm run e2e:check   # checks logins, test banner, cookie isolation and permissions
npm run e2e:info    # shows URLs and test-only login information
npm run e2e:stop    # stops only these test servers; retains all test data
```

`npm run e2e:dev` runs the same servers in the foreground; Ctrl+C stops them. Do not run it while the background test servers are running.

The database is `ekraf_manual_e2e_test`, API port is `3919`, frontend port is `5187`, cookie name is `ekraf.e2e.sid`, Next output is `web/.next-e2e`, and receipt storage is `api/storage/e2e/receipts`. The normal `.env` is not modified. Logs are in `api/storage/e2e/server.log`. Re-running prepare retains your existing test orders; it does not reset the database. All fixture batches have real deadlines, so adjust their windows in test admin if testing again much later.

Do not point the existing empty-database integration suite at this seeded database: it intentionally refuses nonempty databases.

## Initial catalog

| Product | Options | Price / stock |
| --- | --- | --- |
| TEST Everyday Tee | M/Black, L/Black, M/White | Rp85,000; 10/8/5 units |
| TEST Department Keychain | Physics, Computer Science, Chemistry | Rp12,001.01; 5/3/0 units before the expiry fixture |
| TEST Tote Bag | Black, White; no size | Rp55,000; 3/2 units |
| TEST Sticker | No selectable options | Rp10,000; 10 units |
| TEST Faculty Jacket | S, M, L; embroidery name required | S/M Rp265,000; L Rp275,000; zero ready stock |
| TEST Unused Draft | Standard variant | Hidden from customers; safe fixture for deletion testing |

The jacket has an open batch closing seven days after setup, a future draft batch, and an expired open window for checking closure. The expiry fixture reserves one Physics keychain on an overdue order; the worker releases it within its next 60-second cycle after startup. This is the only pre-created order; dashboard verified revenue starts at zero.

Catalog images are intentionally unset. Use an HTTPS image URL when testing image entry. The hero still uses the project's existing supplied photographs.

## 1. Accounts and access

- [ ] Browse without an account; checkout requires sign-in or registration.
- [ ] Register a new `.test` customer with name and phone; return to the same cart.
- [ ] Confirm checkout prefills both saved values.
- [ ] In Account, edit name/phone, refresh, and confirm persistence.
- [ ] Changing email requires the current password; a duplicate email is rejected.
- [ ] Sign in as `legacy@example.test`; checkout links to Account to add a phone, then displays it as text.
- [ ] Customer accounts cannot access admin data, and an incorrect private admin path returns 404.
- [ ] Use `customer2@example.test` to check that another customer's orders and receipt URLs are inaccessible.

## 2. Catalog, variants, stock and decimal prices

- [ ] Keychain displays `Rp12.001,01`; Chemistry is sold out.
- [ ] Tee Black/L -> White keeps L selected and explains that White/L is unavailable. Choose M to recover.
- [ ] Sticker has no size/color/type selectors; Tote shows color only; jacket requires size and embroidery.
- [ ] Add quantities beyond available stock: the cart warns and blocks checkout.
- [ ] Separate cart lines for the same variant share the same stock allowance.

## 3. Mixed checkout with a batch deposit

Use one M/Black Tee and one M Jacket from TEST Open Batch, with an embroidery name such as TEST STUDENT.

- [ ] Total: Rp350,000.
- [ ] Choose full merchandise plus 50% batch deposit: Rp217,500 initially; Rp132,500 later.
- [ ] Create the order; the first deadline is 24 hours away.
- [ ] Tee stock becomes reserved; jacket stock is not reserved before production receipt.
- [ ] Refresh/back does not create a duplicate checkout.
- [ ] Select TEST Bank or TEST QRIS. Do not pay. Check account/amount copy and QR image download. The test QR is explicitly non-payable.
- [ ] Upload `sample-proof.png`. Reservations remain held while proof awaits review.

## 4. Admin payment review and merchandise pickup

- [ ] Find the proof in Payment Verification; open the receipt.
- [ ] Reject it with reason `TEST rejection`; customer sees the reason and can resubmit.
- [ ] Approve the resubmission after checking the official account; no transaction reference is required.
- [ ] Order becomes Deposit verified; received money is Rp217,500, not the full Rp350,000.
- [ ] Tee reservation clears and physical stock falls by one.
- [ ] Mark the Tee ready, then collected, independently of the jacket.
- [ ] Already-reviewed submissions cannot be approved a second time.

## 5. Batch production, balance and pickup

- [ ] In Batch Orders, close TEST Open Batch, then Start production.
- [ ] Record one delivered M jacket with reason `TEST delivery`. Receipt labels identify size/color/type/SKU.
- [ ] The customer's jacket becomes ready for pickup, with one unit reserved.
- [ ] Collecting the jacket remains blocked until the balance is verified.
- [ ] Customer uploads balance proof for Rp132,500; admin verifies after checking the official account.
- [ ] Order is fully paid; dashboard received money totals Rp350,000 across both submissions, counted once each.
- [ ] Collect the jacket. Its physical stock and reservation both decrease by one.
- [ ] Mark the batch ready, then complete only after all paid items are collected.
- [ ] Confirm cancellation/completion explains blocked actions while eligible orders or pickups remain.

## 6. Product and batch management

- [ ] Create a TEST product using standard category or Other; automatic SKU appears after saving.
- [ ] Add variants and reject duplicate size/color/type combinations.
- [ ] Edit a price to `12001.01`; verify `Rp12.001,01` in the store.
- [ ] Before order history exists, edit options; SKU remains unchanged.
- [ ] After order history exists, options/deletion are protected; price and active status remain editable.
- [ ] Adjust continuous physical stock with a reason and review the ledger.
- [ ] Create a second batch for the jacket; preset sizes, production weeks and window validation work.
- [ ] Close TEST Expired Window without changing its dates.
- [ ] Product lists include older products by default; explicit date/search filters and Clear filters work.
- [ ] Delete TEST Unused Draft. Referenced products should be archived instead.
- [ ] Remove an unused variant while keeping at least one; referenced variants stay protected.

## 7. Cancellation, expiry, reports and history

- [ ] Cancel a new unpaid order with no pending proof; reserved stock is released.
- [ ] Check the seeded overdue order changes to expired after the worker runs, and its keychain reservation is released.
- [ ] A submitted proof holds stock during review even when its initial deadline passes.
- [ ] Deposits preserve the order past its initial deadline; balance is due before batch pickup.
- [ ] Editing catalog prices, customer details or disabling payment methods does not rewrite old order/payment snapshots.
- [ ] Verify dashboard totals, customer spending, filters, pagination, CSV export and Jakarta date ranges.

## Automated checks

Unit/build/integrity checks run from the project root:

```powershell
npm test
npm run build
npm run db:check
node --test web/test/money.test.mjs
```

### Integration suite

Create a new empty local PostgreSQL database ending in `_test`, then migrate it before running the suite. The example connection below must use your local database credentials. It must not name the normal database or the seeded manual E2E database. Tests populate the database; use another fresh empty database on the next run.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:replace-with-local-password@localhost:5432/ekraf_integration_test?schema=public'
$previousDatabaseUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = $env:TEST_DATABASE_URL
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Test database migration failed' }
    npm --workspace api run test:integration
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    Remove-Item Env:TEST_DATABASE_URL
}
```

### Browser fixtures

Install Python Playwright once:

```powershell
python -m pip install playwright
python -m playwright install chromium
```


The browser fixture scripts in `web/test/customer-*.py` and `web/test/admin-management.py` intercept API responses and do not replace the manual transaction checklist above. Run them against the normal development frontend at `http://localhost:5173`: the customer UX fixture expects the normal WhatsApp support link, which is intentionally disabled in this test environment.

## Announcements and optional personalization

- [ ] Admin → Announcements: publish two messages. Home rotates every six seconds and supports dismissal; the navbar bell opens the full page.
- [ ] Edit a message; the open storefront updates within 30 seconds or when focused again.
- [ ] Check /announcements, draft visibility, scheduled start/end, and unpublished messages.
- [ ] Previous batch announcement text is preserved as drafts in Announcements; review and publish it there.
- [ ] Open two batches for one product; customer can select either, and order lines retain the chosen batch.
- [ ] Uncheck Require an embroidery name on a batch product; checkout works with preset size and no custom name.
- [ ] Batch initial stock cannot be entered; receive delivered stock from the batch editor.
- [ ] Customer/admin Show and Hide password buttons toggle without submitting the login form.
- [ ] Contact details are text in checkout and payment; Account edits apply to future orders only.

## Interface hardening checks

With the isolated test server running:

```powershell
node --test web/test/hardening.test.mjs
python web/test/hardening.py
```

These checks cover date-aware batch selection, persistent field-linked validation errors, input preservation, offline/server/rate-limit/session failures, request timeout, duplicate-submit prevention, refreshed CSRF tokens, visible receipt-upload focus/error states, sticky-summary clearance, broken catalog images, and Unicode at narrow widths. Browser API mutations are intercepted; they do not create real orders or products. Success notifications still use the five-second shrinking progress bar; errors remain with the form until another submission succeeds. The test defaults to the manual E2E address/private path; `TEST_BASE_URL` and `ADMIN_PANEL_PATH` can override them.


## Responsive interaction checks

After `npm run e2e:prepare` and starting the isolated test frontend, run `python web/test/adapt.py`. It checks customer and admin layouts from 320 to 2560 pixels, phone landscape, mobile collection search, touch target sizes, quantity/cart persistence, and horizontal admin navigation by touch and keyboard, active-section visibility, and desktop sidebar behavior. It uses seeded catalog data and a test admin login; it does not save catalog changes or create orders. Screenshots are saved under ignored `api/storage/e2e/adapt/`. These are Chromium viewport and synthesized touch checks, not physical iOS/Android device results.


## Product and QRIS image uploads

Run `python web/test/images.py` with the isolated seeded E2E server running. It creates one temporary zero-stock product, uploads/removes/reorders real images, publishes the product for shop-cover/detail-gallery checks, and exercises detail thumbnails, unboxed arrows, keyboard, synthesized touch swipes, and responsive resizing. It then adds a clearly labeled test QRIS method. Cleanup deletes its unused product and disables its test payment method; uploaded test media stays in the ignored isolated media folder. No payment is made. The API integration suite additionally covers permission/CSRF checks, corrupt/oversized files, public caching, gallery limits, cover compatibility, and cross-purpose image rejection.
