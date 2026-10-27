# Leadership handover

## Ownership checklist

Keep these under organization-controlled identities with at least two current maintainers and recovery methods:

- GitHub organization/repository and branch protections.
- Frontend/API hosting and deployment secrets.
- Domain registrar, DNS, TLS renewal (usually automated), and contact email.
- PostgreSQL hosting, backups, restore access, and database credentials.
- Image storage (once selected).
- Organization bank/QRIS merchant account used for reconciliation.
- Error monitoring and status/alert contacts.

Record service owner, backup owner, renewal/billing date, monthly cost, recovery path, and next renewal in an organization-owned password manager or internal record. Never store secrets or recovery codes in this repository.

## Member onboarding/offboarding

1. Approve access with the organization lead and service owner. Use an individual account, MFA, and least privilege; do not share personal passwords.
2. Grant repository and hosting access through organization teams. Make the new treasurer an app `TREASURER` account through a reviewed database/admin procedure.
3. Walk through deploy, payment reconciliation, expiry behavior, backup checking, and restore procedure. Confirm they can reach two maintainers.
4. On departure, remove organization and provider access, rotate shared/service credentials, invalidate sessions, review audit history, and transfer renewal/contact ownership.

## Administrator bootstrap and recovery

The public bootstrap endpoint is local-development only and returns 404 in production. For production, run `npm run admin:bootstrap` from a secured one-off operator environment with temporary `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, and database access. The script refuses to run if any administrator already exists. Record the action and revoke temporary credentials. For emergency recovery after all administrators are locked out, use the managed database's audited access path with two-person review to promote an existing user; restore normal access immediately and never enable the public bootstrap endpoint in production.

## Before graduating

- [ ] Repository and all operational accounts are organization-owned with two maintainers.
- [ ] New developer has completed local setup from `SETUP.md`.
- [ ] Current treasurer can verify a staging payment and explain statement reconciliation.
- [ ] Backup restore succeeded and the next exercise date is assigned.
- [ ] Domain, bills, provider limits, and renewal owners are recorded.
- [ ] Production secrets were transferred through the organization's password manager and rotated after handover.
- [ ] Open issues and launch blockers are recorded with owners and due dates.
