# Operations, deployment, and recovery

This repository does not configure a hosting provider, production domain, external monitoring, or scheduled off-host backups. Provider accounts, ownership, alerts, and restore procedures must be established before public launch.

## Deployment

1. Keep source, hosting, domain/DNS, PostgreSQL, image storage, and bank/QRIS accounts organization-owned, with at least two maintainers and provider MFA.
2. Run persistent Next.js and API processes behind HTTPS. Use managed PostgreSQL with backups and a least-privilege app account; use separate migration credentials where supported.
3. Set `DATABASE_URL`, `SESSION_SECRET`, `FRONTEND_ORIGIN`, `ADMIN_PANEL_PATH`, `RECEIPT_STORAGE_DIR`, `MEDIA_STORAGE_DIR`, and `NODE_ENV=production`. Provide `API_INTERNAL_ORIGIN` before the Next.js build so `/api` rewrites reach the API; use the exact public origin for `FRONTEND_ORIGIN`. Keep the private admin segment server-only.
4. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, and `npm run build`. Back up before migrations and retain the last known-good deployment. Run `npm --workspace api start` and `npm --workspace web start` under a process supervisor.
5. Use persistent private receipt storage outside the public directory, backed up with PostgreSQL. Mount persistent `MEDIA_STORAGE_DIR` storage for public product/QRIS uploads. HTTPS is supplied by the app origin.
6. Monitor `GET /api/health`, which checks database connectivity. Test staging checkout, review, pickup, expiry, HTTPS sessions, access restrictions, and restore before launch.

Use one API instance while receipt storage and rate limits remain process/local-host dependent. Multiple hosts need shared private storage and distributed request limiting. No provider price estimates or free tiers in old notes should be treated as a deployment commitment.

## Security controls and limits

CUSTOMER and ADMIN are the only roles. Protected requests reload roles from the database. Passwords use Argon2id; PostgreSQL sessions use HttpOnly, SameSite=Lax and production Secure cookies. Mutations require CSRF tokens and approved origins. The API uses Helmet, login throttling, input bounds, parameterized queries, no-store responses, and safe errors.

Checkout uses server prices, historical snapshots, UUID idempotency, serializable transactions, and availability checks. Owner/admin authorization protects orders and receipt retrieval. Admin product/QRIS uploads require ADMIN/CSRF, a 10 MB input limit, decoded JPEG/PNG/WebP validation, a 40-megapixel limit, and server-generated filenames. Images are re-encoded without source metadata; product photos use WebP, QRIS uses lossless PNG. Public `/api/media/` URLs are immutable and cacheable. The receipt directory is never served through this route. Removed/replaced public image files are retained to protect other records and historical payment snapshots; automatic orphan cleanup is not implemented.

Proof uploads require authentication/CSRF, PNG/JPEG signatures, random server filenames, and a maximum 5 MB body. Reviewed evidence and stock history are protected from ordinary modification.

Limits: no password reset, email verification, account MFA, upload antivirus or receipt re-encoding, general admin audit log, payment gateway, shipping, or automated refund workflow. Do not imply these are implemented. Keep secrets, cookies, receipt contents, database dumps, and request bodies out of Git/logs. Use a password manager and rotate credentials/invalidate sessions after compromise or staff departure.

## Daily operation

- Reconcile each submitted installment against the official bank/merchant account before approval. A receipt alone is not proof that money arrived. No transaction reference is required by the forms.
- Review pending evidence within the published maximum (currently 24 hours). Check balances before batch collection and arrange campus pickup by WhatsApp or published announcements.
- Check health, deployment/migration failures, pending orders, stock exceptions, and the latest successful backup.
- Handle paid-order cancellations, refunds, and disputes through an organization-controlled process outside this initial app; retain the case record privately.

## Backup and incident recovery

Back up PostgreSQL, the public media directory, and the private receipt directory to restricted storage outside the app host. Restore them together into a separate environment, then verify receipts, payment totals, pickup states, and ledger reconciliation with `npm run db:check`. A successful dump is not a tested restore.

For an incident:

1. Record affected services and start time; assign a maintainer.
2. For suspected compromise, revoke affected access, preserve logs, rotate session/provider secrets, and invalidate sessions.
3. For payment discrepancies, pause payment decisions and reconcile actual statements; preserve evidence outside the app.
4. For suspected data corruption, stop writes, snapshot current data, and validate a restored copy before switching traffic. Otherwise deploy the last known-good version.
5. Verify health and staging flows; communicate confirmed impact through an organization-controlled channel. Record cause and follow-up actions.

Do not delete Docker volumes or reset the database during routine updates. Receipt files are outside the PostgreSQL Docker volume.

## Handover and launch checklist

- [ ] Two maintainers have organization-controlled repository, hosting, domain, database, storage, payment, and monitoring access.
- [ ] Owners, billing/renewal dates, recovery methods, backup retention, and incident contacts are recorded privately.
- [ ] New maintainer completes [local setup](SETUP.md) and the [customer/admin checklist](E2E-TESTING.md).
- [ ] Official payment details, pickup/support process, and review-time commitment are confirmed.
- [ ] Off-host backup scheduling, alerts, and a separate-environment restore exercise are verified.
- [ ] Production secrets and HTTPS settings are checked; staging access and payment flows pass.
- [ ] Departing members lose app/provider access; shared credentials are rotated, sessions invalidated, and renewal ownership transferred.

The first-admin CLI documented in Setup refuses to run once an admin exists. If all administrators are locked out, use the database provider's audited recovery process with organization approval; never enable a public production bootstrap endpoint. There is no general app audit log, so handover and exceptional access records must be retained externally.


## Small Ubuntu VPS deployment

Use Ubuntu Server 24.04 LTS, 2 vCPU, 2 GB RAM, and a 25 GB SSD. This configuration needs a staging load test before a promoted batch. Keep PostgreSQL defaults initially. The API shares a five-connection pool with the session store and waits up to five seconds for a connection.

1. Provision Docker Engine with Compose, Nginx, a TLS certificate, rclone, and curl. On a new host without swap, create a 2 GiB swapfile with `sudo fallocate -l 2G /swapfile`, then run `sudo chmod 600 /swapfile`, `sudo mkswap /swapfile`, and `sudo swapon /swapfile`. Add `/swapfile none swap sw 0 0` once to `/etc/fstab` and confirm with `swapon --show`.
2. Run the **Build production image** workflow on the release revision and select the VPS architecture (`amd64` or `arm64`). Set the repository variables `NEXT_PUBLIC_SUPPORT_WHATSAPP` and `NEXT_PUBLIC_PAYMENT_REVIEW_HOURS` before building. Download the artifact, extract its outer ZIP, transfer `ekraf-store.tar.gz`, and run `docker load -i ekraf-store.tar.gz`. Copy the matching `deploy/` folder to the server. Move the release archive off the VPS after loading it to reclaim disk space.
3. Create three files inside `deploy/` with permissions 0600. In `.env.database`, set `POSTGRES_USER=ekraf`, `POSTGRES_DB=ekraf`, and a random `POSTGRES_PASSWORD`. In `.env.production`, set `DATABASE_URL=postgresql://ekraf:PASSWORD@db:5432/ekraf?schema=public` (URL-encode the password), `SESSION_SECRET`, the exact HTTPS `FRONTEND_ORIGIN`, and all six R2 variables from `.env.example`. In `.env.web`, set the server-only `ADMIN_PANEL_PATH`. Compose keeps database ports unpublished and binds the web and API ports to loopback.
4. From `deploy/`, run `docker compose up -d --wait db`, then `docker compose run --rm api ../node_modules/.bin/prisma migrate deploy` and `docker compose up -d --force-recreate api web`. On a new database, use the existing CLI bootstrap script via `docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_NAME api node dist/scripts/bootstrap-admin.js` after exporting the required bootstrap variables in your shell. Use a unique password of at least 12 characters and unset it after bootstrapping.
5. Replace `shop.example.com` in `deploy/nginx.conf` with your store domain, including the certificate paths. Install the config on the host, verify with `sudo nginx -t`, and reload Nginx. If the store is proxied by Cloudflare, configure Nginx real IP handling using Cloudflare's published IP ranges before enabling the proxy. Keep Nginx's forwarded headers authoritative so Express rate limits see the actual client address. Verify `/api/health`, a customer sign-in, and an admin sign-in over HTTPS.

### R2 cutover and caching

- Create two **Standard** buckets. Attach the assets subdomain to the public media bucket and leave the receipts bucket private, with no public domain or development URL. Issue credentials limited to these two buckets. Keep the assets subdomain stable because new public upload URLs are saved in the database.
- For an existing store, pause uploads before cutover. From the existing API working directory, compile the API and run `node --env-file=../.env dist/scripts/copy-uploads-to-r2.js` with both local directories and the six R2 settings configured. The script preserves filenames, skips already present keys and leaves the source files intact. Confirm product images and sample receipts are present in the corresponding buckets before starting the R2-enabled release. Existing media paths redirect to the assets domain. Existing proof paths still require order ownership or admin access and redirect to a signed URL valid for 60 seconds.
- Keep Cloudflare's cache rules limited to the public assets hostname and the store's `/_next/static/*` path. Bypass caching for private routes and `/api/*`. Verify the assets hostname returns cache hits for repeated image requests and that receipt redirects and signed responses are `no-store`. Review R2 usage against the free allowance.
- Test opening an existing photo, checkout QRIS image and old receipt after cutover. Verify a new upload, a denied cross-account receipt request, and signed URL expiry. If rolling back to local storage after new R2 uploads, copy new private receipt objects back by their original keys before switching off R2. Keep the public assets hostname active for database entries that already reference it.

### Backups and batch launch test

- Schedule `backup-db.sh` outside opening hours with `BACKUP_DEST` set to a private off-server rclone destination. Configure cron or systemd to run it daily and immediately before migrations. Back up both R2 buckets to restricted storage separately, using a private destination for receipts. Test restoring the database and both buckets together. Container logs rotate at 10 MB with three files per service. Use Ubuntu's Nginx log rotation.
- Schedule `check-disk.sh` every 15 minutes with a private `DISK_ALERT_WEBHOOK` accepting a form field named `text`. Run a test notification before relying on it. Keep these environment values in a restricted host file.
- Use a separate staging VPS or a test environment with identical resources and isolated data, R2 buckets and dummy payment instructions. Seed one open batch, an active variant, one dummy payment method, and one to five `@example.test` customers with saved names and phone numbers. Set `BASE_URL`, `CONFIRM_STAGING=yes`, `BATCH_ID`, `VARIANT_ID`, `PAYMENT_METHOD_ID`, `RECEIPT_PNG` (a dummy PNG path), `TEST_ACCOUNTS` (JSON array of email/password objects), and `CHECKOUTS_PER_SECOND`. Run `k6 run deploy/batch-load.js` once at the expected rate and once at twice that rate. The script signs in during setup to stay within the per-IP login limit, then exercises browsing, concurrent checkouts and proof uploads. Wait for the login rate window if repeating with more accounts.
- Require p95 checkout below 2 seconds, unexpected journey failures below 1%, zero mismatched order IDs on retries, and zero dropped iterations. Compare container restart counts and container IDs before and after. During the test use `docker stats`, `vmstat 1`, and `DB_POOL_LOG=true` on the staging API to see CPU, memory, swap and queued database connections. Switch off pool logging afterward. Upgrade to 4 GB if sustained swap activity or memory pressure causes failures. Investigate CPU or database waits separately.
