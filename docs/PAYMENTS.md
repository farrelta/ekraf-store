# Manual payments and deposits

An order can contain merchandise and items from multiple production batches. All collections are campus pickup. Each order item retains its product/variant description, price, batch reference, embroidery name where applicable, and independent pickup state.

## Payment options

- FULL: pay the entire order initially.
- BATCH_DEPOSIT: pay all merchandise plus 50% of the batch subtotal initially. The remainder is due before collecting batch items. A deposit cannot be selected for merchandise-only orders.

Example: Rp85,000 tee + Rp265,000 jacket = Rp350,000 total. Initial deposit checkout requires Rp217,500; the remaining balance is Rp132,500. The server calculates and snapshots the initial requirement using Decimal arithmetic, rounding to two decimal places. No bundle discount is implemented yet.

Initial payment proof must be submitted within 24 hours of checkout. Timely proof holds the reservation while awaiting review. Once the initial deposit is verified, the order becomes PARTIALLY_PAID and is not expired by that original deadline. Balance can be paid after deposit verification and must be verified before batch collection. Rejecting balance evidence preserves the accepted deposit and allows resubmission.

## Manual verification

Admins configure official bank/QRIS details in the private admin panel. Customers upload a private JPG/PNG receipt of at most 5 MB for the currently required installment. Each submission snapshots its amount, phase (INITIAL or BALANCE), and payment destination. Admins must check the real account statement, actual installment amount, payer, date and transaction reference before approval. Rejection requires a reason.

SQL allows one pending submission per order and one verified submission per order/phase. Verified merchant references cannot be reused for the same payment method. Reviewed evidence is immutable. Approval updates payment state and inventory atomically; balance approval never consumes merchandise again.

## Separate pickups

After initial payment verification, merchandise can move through PROCESSING, READY_FOR_PICKUP and COMPLETED independently. Batch production receipts are allocated to deposit-paid or fully paid items and can mark individual items ready. Batch items cannot be marked collected until the entire remaining order balance is verified. Each item records its own pickup status, so a mixed order may have collected merchandise and a jacket still in production.

The app provides no shipping, reviews, arbitrary customization fields, automatic refunds or separate How to buy page. Paid/deposit-paid cancellation and exceptional refund disputes require an organization-controlled manual process outside this initial implementation.

Private receipt files live in api/storage/receipts or RECEIPT_STORAGE_DIR. Back up that directory alongside PostgreSQL. A hidden admin URL is a navigation measure; authenticated ADMIN authorization remains mandatory on every privileged API.
