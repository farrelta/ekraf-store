# Database

Nine application tables remain: users, products, product_variants, batches, orders, order_items, payment_methods, payment_submissions, inventory_movements. Express session and Prisma migration infrastructure tables are additional. The diagram is docs/schema.dbml.

Products use CONTINUOUS or BATCH selling type and DRAFT/PUBLISHED/ARCHIVED publication status. Each product has at least one size/color variant with unique SKU and product/size/color combination. STANDARD represents a missing option. Batch products require preset sizes and store one integer production estimate in weeks. Accounts have only ADMIN and CUSTOMER roles.

## Mixed checkout

An order can contain merchandise and several batches. batch_id and pickup_status belong to order_items. Each batch item must reference a matching product batch that is open at checkout and must have an embroidery name. Merchandise has neither batch nor embroidery. Historical item descriptions and unit prices are snapshotted; total is derived in IDR.

orders.payment_plan is FULL or BATCH_DEPOSIT. initial_amount snapshots the server-calculated initial payment: total, or full merchandise plus half the batch subtotal rounded to two decimals. The balance is total minus verified payments. payment_submissions.phase distinguishes INITIAL and BALANCE. Payment status is PENDING, PARTIALLY_PAID, PAID, EXPIRED, or CANCELLED.

Initial checkout expires after 24 hours unless timely proof is under review. Verified deposits are retained and the original deadline does not expire the balance. Balance payment must be verified before batch pickup. One SUBMITTED proof is allowed per order and one VERIFIED proof per phase. Reviewed evidence and stock history are protected by SQL triggers.

## Inventory and collection

Continuous checkout reserves merchandise; initial approval consumes those reservations. Cancellation/expiry of an unpaid initial checkout releases them exactly once. Balance approval does not touch merchandise stock again. Serializability and bounded retries prevent conflicting stock and payment operations.

Batch checkout does not consume ready stock. Production receipts tag batch and variant. Allocation reserves received units for individual paid/deposit-paid lines, marking each allocated line ready. Orders from another batch cannot spend those receipts. Batch collection requires the remaining balance verified, consumes the item reservation, and marks that item completed. Merchandise may be collected while batch items are still processing.

Inventory movements reference order_item_id for new line-specific changes. Historical entries may have a null item reference. On-hand and reservation counters reconcile to appended ledger deltas. SQL checks reject invalid balances, quantities, prices, batch windows, review evidence and duplicate verified references. Reference deletion is restricted.

## Migrations

The historical baseline and Flowstep migrations remain. The earlier minimal schema migration is a fresh-start conversion and refuses populated legacy data; the new 20261031000000_mixed_checkout_deposits migration preserves current orders by copying their batch references and pickup progress to items before removing order-level fields. Existing orders retain FULL payment plans and their full historical amount as initial_amount. It updates the verified-payment uniqueness rule by installment phase.

Run npm run db:generate, npm run db:migrate, and npm run db:check. The read-only checker verifies table/migration availability, product/batch links, embroidery, stock-ledger reconciliation, role validity and payment totals. Back up the database before migrations and rehearse on an isolated database.

A deliberate local reset still uses docker compose -p mipa-store down --volumes, followed by docker compose -p mipa-store up -d --wait and npm run db:migrate. This discards project data and should only be used when explicitly intended. Receipt storage is outside the Docker volume.

Back up both PostgreSQL and the private receipt directory to restricted storage outside the app host. Restore them together to a separate environment and verify payment evidence, item pickup states and ledger reconciliation. No remote backup infrastructure is configured by the repository.
