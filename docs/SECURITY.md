# Security controls

- Public registration always creates CUSTOMER. ADMIN is the only privileged role. Server middleware reloads the account role from PostgreSQL before protected requests.
- Passwords use Argon2id. Sessions live in PostgreSQL with HttpOnly, SameSite=Lax, and production Secure cookies. Mutations require session CSRF tokens and an exact allowed Origin.
- Helmet headers, login throttling, input bounds, parameterized queries, safe server errors, and no-store API responses are enabled.
- Checkout uses server catalog prices, opaque order identifiers, immutable price/description snapshots, UUID idempotency keys, serializable transactions, bounded conflict retries, and stock-availability checks. Owners can see only their orders; admins review all orders.
- Payment approval requires manual official-account reconciliation and a verified reference. SQL prevents duplicate pending/verified submissions and reference reuse per method; reviewed evidence and inventory history cannot be rewritten through updates/deletes.
- Receipt uploads require authentication, CSRF, PNG/JPEG signatures, and a maximum 5 MB body. Files have random server-generated names outside the public directory. Only owners/admins can retrieve them. Product and QRIS images use HTTPS URLs.
- Real PostgreSQL integration tests cover oversell races, duplicate approvals, private receipt access, rejection/resubmission, expiry holds, batch allocation, and historical snapshots.

## Operational limits

This initial app has no password reset, email verification, account MFA, antivirus/content re-encoding service, managed object storage, external monitoring, or general administrative audit log. Login throttling is process-local. Receipt storage is local private disk and must be persistent and backed up with PostgreSQL. Deploy one API instance until shared receipt storage and distributed request limiting are configured.

Admins can change product settings and review financial evidence, so restrict access and use organization-controlled credentials and a password manager. Require hosting/provider MFA and at least two organization maintainers. No payment gateway or automated refund verification is connected; admins must check actual account statements before approving.

Keep `.env` and passwords out of source control and logs. Use HTTPS, a least-privilege runtime database account, and separate migration credentials. Rotate secrets and invalidate sessions during offboarding or compromise. Verify backups/restoration and assign monitoring owners before production rollout.
