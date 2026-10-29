# Manual payment workflow

1. Admin configures official bank transfer or QRIS details in Admin > Payments. Product/QRIS images use HTTPS URLs.
2. Customer signs in, selects a ready-stock group or one batch, and places an order for campus pickup. The payment deadline is 48 hours after creation.
3. Customer pays the full order amount and uploads a JPG/PNG receipt (maximum 5 MB). Receipt files are private. Uploading proof does not confirm payment.
4. Admin opens the proof and compares the merchant/bank account, full amount, payer, transaction date, and reference against the official account statement. Approve using the verified merchant reference, or reject with a reason.
5. Rejection keeps the order unpaid. The customer may resubmit before the deadline. If the deadline has passed, rejection expires the order and releases its continuous-stock reservation. Pending proof keeps the reservation held until reviewed.
6. Verified continuous orders move to processing. Admin marks them ready for pickup, then collected. Batch orders become ready only after their production stock is received and allocated; collection then consumes the allocated stock.

Only ADMIN can review payments. There is no third role, payment gateway, partial-payment support, automated refund, or shipping workflow. Paid orders cannot be cancelled through this initial app. Handle exceptional refund disputes outside the app with an organization-controlled record.

SQL enforces one submitted and one verified proof per order and prevents reusing a verified reference for the same payment method. Rejected attempts remain visible and reviewed evidence cannot be edited. Method details are snapshotted, so disabling an account or creating a replacement does not change historical proof records.

Receipts are stored in `api/storage/receipts` by default, or `RECEIPT_STORAGE_DIR`. Back up this directory with PostgreSQL; it is not included in the Docker database volume. Owners and admins may retrieve receipts through authenticated API routes; never expose the directory with a static file server.
