# Manual payments

## Current workflow

1. Checkout stores the server-calculated IDR total, creates a pending order, snapshots product lines, and reserves inventory for 48 hours.
2. The storefront displays `PAYMENT_INSTRUCTIONS`. Configure only details that the organization has approved; the repository example is placeholder text.
3. A customer may submit a free-text transaction reference. This creates a `REFERENCE_SUBMITTED` event; it does not upload proof and never changes payment state.
4. An `ADMIN` or `TREASURER` checks the actual official bank/QRIS merchant account, then confirms or rejects with the order's exact amount/reference. Rejection requires a reason and releases its reserved stock in the same transaction. Refund marking requires a reason and is allowed only from `PAID`.
5. Only after successful verification does fulfillment move to processing. Staff complete the pickup/shipping lifecycle in the dashboard/API.

Reconcile order public ID, amount, payer/reference, settlement date, and official account statement. Keep the external statement under the treasurer's organization-controlled access policy. The app records the actor and timestamp but does not connect to or verify a bank.

Pending orders expire after 48 hours. A worker releases reserved stock once; a customer can cancel before payment. Paid-order cancellation/refund requires external financial reconciliation; the app records a refund state but does not send money or automatically restock refunded items.

## Future gateway

No gateway is integrated. Before choosing one, check current merchant eligibility, fees, settlement and refund terms, supported methods, and organization account requirements from the provider's official documentation. Keep provider transaction IDs separate from order IDs. Implement server-side transaction creation, authenticated webhooks, amount/order validation, idempotency, duplicate/out-of-order delivery handling, sandbox tests, reconciliation, and a documented refund process. Never trust a browser success page or client status.
