# Database and business rules

The authoritative model is [`api/prisma/schema.prisma`](../api/prisma/schema.prisma); [`schema.dbml`](schema.dbml) is the importable drawDB diagram. Prisma uses camelCase in code and snake_case physical mappings.

## Tables

Ten application tables, plus session and Prisma migration infrastructure:

| Table | Purpose |
| --- | --- |
| `users` | CUSTOMER/ADMIN accounts and saved contact details. |
| `products` | Catalog content, category, selling type, publication/featured state, embroidery requirement. |
| `product_variants` | Immutable SKU, optional size/color/type, price, on-hand/reserved quantities, active state. |
| `batches` | Product production windows, lifecycle, integer production estimate in weeks. |
| `orders` | Customer/contact snapshots, idempotency key, payment plan, initial amount, deadline/status. |
| `order_items` | Historical description/price, quantity, optional batch/embroidery, independent pickup state. |
| `payment_methods` | Enabled QRIS/bank destinations and instructions. |
| `payment_submissions` | Private proof, destination snapshot, installment amount, review decision/reviewer. |
| `inventory_movements` | Append-only stock/reservation ledger and SKU snapshots. |
| `announcements` | Independent published/scheduled store and pickup messages. |

## Products and variants

Products are CONTINUOUS or BATCH, with DRAFT/PUBLISHED/ARCHIVED status. Each has at least one variant. The ordered `image_keys` array stores up to eight photo URLs without adding a table. Its first entry is also stored in legacy `image_key` for existing clients; clearing the gallery clears both. The additive migration backfills existing cover URLs. Admin forms upload files; legacy HTTPS image references remain readable and accepted by existing API clients. Size/color/type values are normalized before enforcing uniqueness across product + size + color + type. `STANDARD` represents an absent option and is hidden from customers. Batch variants require preset clothing sizes. Embroidery names belong to order lines and are required only when the batch product offers personalization.

SKU generation is server-side and immutable. Existing API clients may supply an explicit SKU. Price, category, profile, and payment-method changes do not rewrite historical snapshots. Variant options can change only before any order history exists; price and active state remain editable.

## Checkout and manual payments

One order may contain continuous merchandise and several batches. Each batch line references its chosen matching product batch, which must be open and within its ordering dates. Continuous lines have no batch or embroidery. Totals derive from historical unit price × quantity, in IDR using Decimal arithmetic.

- `FULL`: pay the whole order initially.
- `BATCH_DEPOSIT`: pay all merchandise plus 50% of the batch subtotal, rounded to two decimals. Merchandise-only orders cannot use this plan.

Example: Rp85,000 merchandise + Rp265,000 jacket totals Rp350,000. Deposit checkout requires Rp217,500 initially, with Rp132,500 remaining before batch pickup.

Initial proof must arrive within 24 hours. Timely pending evidence holds stock during review. Rejection requires a reason and permits resubmission while the initial window remains valid. A verified deposit preserves the order beyond its original deadline; rejecting balance evidence preserves accepted payments.

The server permits one SUBMITTED proof per order and one VERIFIED proof per INITIAL/BALANCE phase. Review transitions and related stock changes are atomic; reviewed evidence is immutable. Uploading proof does not mark an order paid. The forms do not request transaction references: admins must verify actual money in the official account. Older API clients may still supply a reference; supplied verified references cannot be reused per payment method.

## Inventory and campus pickup

Available continuous stock is `on_hand - reserved`. Checkout reserves it; initial approval consumes physical stock and reservations. Unpaid cancellation/expiry releases reservations once. The expiry worker runs every minute and skips evidence awaiting review. Balance approval never consumes merchandise a second time. Serializable transactions with bounded retries handle races.

Batch checkout does not reserve ready stock. Close ordering before production/receipt; admins may close early. Payment verification does not require waiting for the batch deadline. Receipts identify batch and variant; received units are allocated to paid/deposit-paid lines within that batch. Collecting a batch item requires the order's remaining balance verified and consumes that item's physical/reserved units. Merchandise may be collected earlier, independently.

Inventory balances reconcile to ledger deltas. Stock movements are append-only; automatic variant-reference detachment is the limited exception. Continuous stock of 1–5 is low; zero is sold out.

## Retention and announcements

Permanent product deletion is allowed in any publication state unless any associated order has a verified payment (including a deposit) or an unresolved submitted proof. It cancels entire unpaid orders, releases their reservations, deletes catalog variants/batches, and retains order descriptions, prices, embroidery and ledger snapshots with nullable catalog references. Resolve proofs first; archive products with verified payments. A variant may be deleted only if it has no order history and is not the last variant; its stock history retains the SKU and detaches the variant reference. Disable referenced payment methods rather than deleting them.

Announcements are separate from batches. Public messages must be published and within optional start/end dates; end must follow start. Legacy batch announcement text was retained and copied into drafts for review/publishing.

## Migrations and integrity

Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:check`. The checker verifies migrations/tables, product/batch relationships, historical embroidery validity, inventory reconciliation, roles, and verified totals.

Commit migration files. Back up PostgreSQL, public media, and private receipts before changing a populated store; rehearse on a restored isolated copy. Never reset a populated database to apply an additive migration. The historical `20261030000000_minimal_ekraf` fresh-start transition refuses populated legacy data; later migrations preserve the current model's records. Recovery and retention responsibilities are in [Operations](OPERATIONS.md).
