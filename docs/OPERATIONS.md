# Operations and recovery

## Daily/weekly checks

- Treasurer reconciles each order marked paid against the official organization bank/merchant account and records the exact transaction reference in the staff dashboard.
- Assigned operator checks `GET /api/health`, hosting/database alerts, failed migration/deploy logs, and the latest successful database backup.
- Review pending payments older than 24 hours and expired orders. Payment references are unverified claims until checked externally.
- Keep logs free of request bodies, passwords, cookies, payment details, and database connection strings.

## Incident response

1. The on-call organization maintainer acknowledges an outage and records start time and affected services.
2. If account compromise is suspected, disable the affected hosting/admin access, rotate session and provider secrets, invalidate sessions by restarting after secret rotation, and preserve relevant provider logs.
3. For payment discrepancies, stop changing order payment states, compare each reference and amount with the official account, and retain an incident record outside the app.
4. Restore service from the last known-good deployment. If database integrity is suspect, stop writes, take a forensic snapshot, and restore a verified backup to a separate database before switching traffic.
5. Notify affected customers through an organization-controlled channel after confirming the facts. Do not include sensitive transaction data.
6. Record cause, impact, recovery time, and follow-up actions; update the handover notes.

## Recovery checklist

- [ ] Two maintainers can access the organization-owned source, hosting, domain, database, and payment accounts.
- [ ] Restore the newest backup to a separate database and record the result.
- [ ] Confirm the production secret manager contains required settings and no secret is in Git.
- [ ] Deploy the last known-good commit and apply only reviewed migrations.
- [ ] Confirm `/api/health`, storefront browsing, a staging checkout, staff login, and payment review.
- [ ] Confirm domain/DNS and renewal dates; confirm logs and alerts reach current maintainers.

There is currently no configured monitoring, backup schedule, named responder, or tested restoration procedure. Assign these owners and verify them before launch; don't mark backups operational until a restore exercise succeeds.
