# Operations, deployment, and recovery

This repository does not configure a hosting provider, production domain, external monitoring, or scheduled off-host backups. Provider accounts, ownership, alerts, and restore procedures must be established before public launch.

## Deployment

1. Keep source, hosting, domain/DNS, PostgreSQL, image storage, and bank/QRIS accounts organization-owned, with at least two maintainers and provider MFA.
2. Run persistent Next.js and API processes behind HTTPS. Use managed PostgreSQL with backups and a least-privilege app account; use separate migration credentials where supported.
3. Set `DATABASE_URL`, `SESSION_SECRET`, `FRONTEND_ORIGIN`, `ADMIN_PANEL_PATH`, `RECEIPT_STORAGE_DIR`, and `NODE_ENV=production`. Provide `API_INTERNAL_ORIGIN` before the Next.js build so `/api` rewrites reach the API; use the exact public origin for `FRONTEND_ORIGIN`. Keep the private admin segment server-only.
4. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, and `npm run build`. Back up before migrations and retain the last known-good deployment. Run `npm --workspace api start` and `npm --workspace web start` under a process supervisor.
5. Use persistent private receipt storage outside the public directory, backed up with PostgreSQL. Configure organization-controlled HTTPS image hosting for products/QRIS.
6. Monitor `GET /api/health`, which checks database connectivity. Test staging checkout, review, pickup, expiry, HTTPS sessions, access restrictions, and restore before launch.

Use one API instance while receipt storage and rate limits remain process/local-host dependent. Multiple hosts need shared private storage and distributed request limiting. No provider price estimates or free tiers in old notes should be treated as a deployment commitment.

## Security controls and limits

CUSTOMER and ADMIN are the only roles. Protected requests reload roles from the database. Passwords use Argon2id; PostgreSQL sessions use HttpOnly, SameSite=Lax and production Secure cookies. Mutations require CSRF tokens and approved origins. The API uses Helmet, login throttling, input bounds, parameterized queries, no-store responses, and safe errors.

Checkout uses server prices, historical snapshots, UUID idempotency, serializable transactions, and availability checks. Owner/admin authorization protects orders and receipt retrieval. Proof uploads require authentication/CSRF, PNG/JPEG signatures, random server filenames, and a maximum 5 MB body. Reviewed evidence and stock history are protected from ordinary modification.

Limits: no password reset, email verification, account MFA, upload antivirus/re-encoding, general admin audit log, payment gateway, shipping, or automated refund workflow. Do not imply these are implemented. Keep secrets, cookies, receipt contents, database dumps, and request bodies out of Git/logs. Use a password manager and rotate credentials/invalidate sessions after compromise or staff departure.

## Daily operation

- Reconcile each submitted installment against the official bank/merchant account before approval. A receipt alone is not proof that money arrived. No transaction reference is required by the forms.
- Review pending evidence within the published maximum (currently 24 hours). Check balances before batch collection and arrange campus pickup by WhatsApp or published announcements.
- Check health, deployment/migration failures, pending orders, stock exceptions, and the latest successful backup.
- Handle paid-order cancellations, refunds, and disputes through an organization-controlled process outside this initial app; retain the case record privately.

## Backup and incident recovery

Back up PostgreSQL and the private receipt directory to restricted storage outside the app host. Restore them together into a separate environment, then verify receipts, payment totals, pickup states, and ledger reconciliation with `npm run db:check`. A successful dump is not a tested restore.

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
