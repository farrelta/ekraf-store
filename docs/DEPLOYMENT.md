# Deployment

## Current state

No hosting, domain, managed database, storage bucket, monitoring, or backup provider has been selected or configured. The application has not been deployed. The initial cost target is Rp150,000–Rp350,000/month, but there is no verified provider quote in this repository. Do not treat a free tier or this estimate as a production plan.

Before selecting providers, compare current official pricing and limits for: one small persistent Next.js Node server, one small persistent API process, managed PostgreSQL with backups, HTTPS domain/DNS, image storage, logs/error monitoring, and payment processing fees. Confirm Indonesian region availability, data export/restore, sleep/scale-to-zero behavior, egress, quotas, tax, currency conversion, backup retention, and account recovery. Prefer accounts owned by the organization and use at least two maintainers.

## Production requirements

1. Give the organization control of its GitHub repository, hosting, domain registrar/DNS, database, image storage, and payment account.
2. Use a managed PostgreSQL database with automated backups and tested restore. Create a least-privilege database user for the app.
3. Host one persistent Next.js server and one persistent API instance under HTTPS. Provide `API_INTERNAL_ORIGIN` to the Next.js build environment so its `/api` rewrite targets the API's private reachable origin; keep `FRONTEND_ORIGIN` set to the exact public browser origin so CORS and CSRF origin checks match. Set `DATABASE_URL`, `SESSION_SECRET`, `PAYMENT_INSTRUCTIONS`, and `NODE_ENV=production` in the API host's secret manager.
4. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, and `npm run build` in CI/deployment. Keep rollback instructions and a pre-migration backup.
5. Configure health checks to `GET /api/health`. It checks PostgreSQL connectivity. Alert on unhealthy state and failed backups.
6. Configure product image hosting separately. Until a managed image service is selected, add products with organization-approved HTTPS image URLs only.
7. Test customer checkout, staff payment verification, HTTPS cookies, CORS/CSRF, order expiry, backup, and restore in staging before any public launch.

Keep gateway credentials out of the app until a gateway is actually integrated and tested. Do not deploy this MVP before the launch blockers in `SECURITY.md` and `OPERATIONS.md` are closed.
