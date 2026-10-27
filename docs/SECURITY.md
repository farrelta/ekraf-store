# Security notes and threat model

## Controls present

- Passwords use Argon2id. There is no public admin registration; public sign-up always creates a customer.
- Privileged routes check session roles on the server. Product management and fulfillment require `ADMIN`; payment review allows `ADMIN` and `TREASURER`.
- PostgreSQL-backed sessions use `HttpOnly`, `SameSite=Lax`, and production-only `Secure` cookies. Writes require a session-bound CSRF token and reject a mismatched Origin. CORS allows one configured origin.
- Helmet security headers, JSON request-size cap, Zod validation, login rate limit, generic login errors, parameterized Prisma queries, and safe 500 responses are enabled.
- Checkout never accepts browser prices. It snapshots product name and price, uses a serializable transaction and conditional stock decrement, and requires a UUID idempotency key.
- Customer order lookups are constrained to the signed-in owner. Public order references are random UUIDs. Receipts/references cannot mark payment paid.
- Payment state and fulfillment state are separate. Decisions require staff role, legal transitions, actor/timestamp/amount/reason history, and rejection/refund reasons. App routes only append payment and audit records.
- Image URLs are limited to HTTPS; file upload is not implemented.

## Threats and remaining work

| Threat | Current mitigation | Remaining concern |
| --- | --- | --- |
| Unauthorized payment confirmation | Staff-only endpoint, state transition checks, audit event, manual official-account reconciliation | Staff account takeover; configure MFA/password manager at identity/hosting level and review staff access. |
| Price/quantity manipulation | Server pricing and Zod quantity bounds | Add integration tests against a real isolated PostgreSQL database. |
| Overselling | Conditional stock decrement, serializable transaction, reservation release transaction | Expiry runs only while API is up; alert and reconcile after outages. |
| Account takeover | Argon2id, login limiter, protected sessions | No email verification, password reset, MFA, or distributed rate limiter; single-instance deployment only until changed. |
| Cross-customer order access | Owner-filtered queries | Verify through integration tests after test DB is available. |
| Malicious uploads | No uploads accepted | Choose managed object storage and implement content-signature/size validation before upload feature is released. |
| Duplicate payment processing | Unique idempotency key for order creation and atomic payment transition | Concurrent integration test and manual reconciliation process remain launch requirements. |
| Customer/transaction data loss | PostgreSQL transactions, operational backup plan | No backup provider or restore test is configured. |
| Compromised administrator | Separate treasurer role, role checks, audit trail | Organization must use two maintainers, managed MFA, least privilege, and timely offboarding. |

## Secret handling and response

Keep `.env` and production secrets in a secret manager; rotate credentials when a maintainer leaves or compromise is suspected. Never log passwords, cookies, payment references, or full connection strings. Production must use HTTPS and a least-privilege database account. The session secret invalidates existing sessions when rotated. See `OPERATIONS.md` for response steps.

This checklist is not a security certification. Production review, integration tests, access ownership, backup/restore, image storage, and account recovery are not yet verified.
