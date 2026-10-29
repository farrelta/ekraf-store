"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { type Api, type Order, type PaymentMethod, date, money } from "./types";
import { Badge, Icon } from "./ui";
export function OrderCard({
  order,
  api,
  methods,
  admin = false,
  onChange,
  report,
  paymentPage = false,
  submissionId,
}: {
  order: Order;
  api: Api;
  methods: PaymentMethod[];
  admin?: boolean;
  onChange: () => Promise<void>;
  report: (message: string) => void;
  paymentPage?: boolean;
  submissionId?: string;
}) {
  const [busy, setBusy] = useState(false),
    [methodId, setMethodId] = useState(""),
    [fileName, setFileName] = useState("");
  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const pending = order.paymentSubmissions.some(
      (s) => s.status === "SUBMITTED",
    ),
    unpaid = ["PENDING", "PARTIALLY_PAID"].includes(order.paymentStatus),
    open =
      order.paymentStatus === "PARTIALLY_PAID" ||
      (order.paymentStatus === "PENDING" &&
        new Date(order.expiresAt) > new Date());
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await onChange();
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      file = f.get("proof") as File;
    if (!file?.size || !method) return;
    if (file.size > 5 * 1024 * 1024) {
      report("Choose a JPG or PNG smaller than 5 MB.");
      return;
    }
    await run(async () => {
      await api(`/api/orders/${order.id}/proof`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-Payment-Method": method.id,
          "X-Payment-Reference": String(f.get("reference") || ""),
        },
        body: file,
      });
      report("Proof submitted for manual verification.");
    });
  }
  async function review(s: string, action: string, form: HTMLFormElement) {
    const f = new FormData(form);
    if (action === "REJECTED" && !String(f.get("reason") || "").trim()) {
      report("Enter a rejection reason.");
      return;
    }
    await run(() =>
      api(`/api/admin/payment-submissions/${s}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          reason: f.get("reason"),
          reference: f.get("reference"),
        }),
      }),
    );
  }
  const evidence = order.paymentSubmissions.filter(
    (s) => !submissionId || s.id === submissionId,
  );
  return (
    <article className={paymentPage ? "payment-order" : "order-card panel"}>
      <div className="order-head">
        <div>
          <small>ORDER REFERENCE</small>
          <h2>{order.id}</h2>
          <p className="muted">
            {order.customerName} · {order.customerPhone} ·{" "}
            {date(order.createdAt)}
          </p>
        </div>
        <Badge value={order.paymentStatus} />
      </div>
      <div className={paymentPage ? "checkout-grid" : "order-content-grid"}>
        <div className="payment-main">
          {paymentPage &&
            unpaid &&
            (pending ? (
              <div className="info-note">
                <Icon name="clock" />
                Your proof is awaiting review. Reservations stay held while we
                verify it.
              </div>
            ) : open ? (
              <form className="payment-form" onSubmit={upload}>
                <h2>
                  {order.phase === "INITIAL"
                    ? "Choose payment method"
                    : "Pay the remaining batch balance"}
                </h2>
                <p className="muted">
                  {order.phase === "INITIAL"
                    ? `Please pay ${money(order.amountDue)} before ${date(order.expiresAt)}.`
                    : `Pay ${money(order.amountDue)} and have it verified before batch pickup.`}
                </p>
                {!method ? (
                  <div className="empty">
                    Payment details are being prepared. Contact EKRAF before
                    paying.
                  </div>
                ) : (
                  <>
                    <fieldset className="payment-methods">
                      <legend className="sr-only">Payment method</legend>
                      {methods.map((m) => (
                        <label
                          key={m.id}
                          className={`payment-option ${method.id === m.id ? "selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="method"
                            checked={method.id === m.id}
                            onChange={() => setMethodId(m.id)}
                          />
                          {m.name}
                        </label>
                      ))}
                    </fieldset>
                    <div className="payment-destination">
                      {method.type === "QRIS" ? (
                        <>
                          <img
                            className="qr-image"
                            src={method.qrImageKey!}
                            alt={`${method.name} QRIS code`}
                          />
                          <small>Scan with your banking or e-wallet app</small>
                        </>
                      ) : (
                        <>
                          <strong>{method.bankName}</strong>
                          <span className="account-number">
                            {method.accountNumber}
                          </span>
                          <span>{method.accountName}</span>
                        </>
                      )}
                      <strong>{money(order.amountDue)}</strong>
                      <small>Order: {order.id}</small>
                    </div>
                    <details className="pay-instructions">
                      <summary>
                        How to pay with{" "}
                        {method.type === "QRIS" ? "QRIS" : "bank transfer"}
                      </summary>
                      <p>
                        {method.instructions ||
                          "Pay the displayed installment to the official account, save your receipt, then upload it below."}
                      </p>
                    </details>
                    <div className="panel proof-panel">
                      <h2>Upload payment proof</h2>
                      <label className="upload-zone">
                        <Icon name="upload" size={24} />
                        <strong>
                          {fileName || "Drop screenshot here or choose a file"}
                        </strong>
                        <small>JPG or PNG · max 5 MB</small>
                        <input
                          name="proof"
                          type="file"
                          accept="image/png,image/jpeg"
                          aria-label="Payment proof (JPG/PNG, max 5 MB)"
                          required
                          onChange={(e) =>
                            setFileName(e.target.files?.[0]?.name || "")
                          }
                        />
                      </label>
                      <div className="form-grid">
                        <label>
                          Your name
                          <input value={order.customerName} readOnly />
                        </label>
                        <label>
                          WhatsApp number
                          <input value={order.customerPhone} readOnly />
                        </label>
                      </div>
                      <label>
                        Transaction reference (optional)
                        <input name="reference" maxLength={200} />
                      </label>
                    </div>
                    <button
                      className="button-primary full-width"
                      disabled={busy}
                    >
                      Submit{" "}
                      {order.phase === "INITIAL"
                        ? "initial payment"
                        : "balance"}{" "}
                      proof
                    </button>
                    <small className="payment-help">
                      We check payments manually against the official account.
                      Uploading proof does not confirm payment.
                    </small>
                  </>
                )}
              </form>
            ) : (
              <div className="info-note">
                The 24-hour initial payment window has ended. Expiry and
                reservation release are processing.
              </div>
            ))}
          {!admin && !paymentPage && unpaid && (
            <Link
              className="button-primary"
              href={`/orders/${order.id}/payment`}
            >
              {pending
                ? "View verification status"
                : order.paymentStatus === "PARTIALLY_PAID"
                  ? "Pay batch balance"
                  : "Complete payment"}
            </Link>
          )}
          {order.paymentStatus === "PAID" && (
            <div className="info-note">
              <Icon name="check" />
              Payment verified. Track each item’s pickup status below.
            </div>
          )}
          {!admin && order.paymentStatus === "PENDING" && !pending && open && (
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Cancel this unpaid order?"))
                  void run(() =>
                    api(`/api/orders/${order.id}/cancel`, { method: "POST" }),
                  );
              }}
            >
              Cancel unpaid order
            </button>
          )}
          {evidence.length > 0 && (
            <section className="payment-history">
              <h2>
                {admin && submissionId
                  ? "Review payment evidence"
                  : "Payment history"}
              </h2>
              {evidence.map((s) => (
                <article className="evidence-card panel" key={s.id}>
                  <div className="section-title">
                    <h3>
                      {s.phase === "INITIAL"
                        ? "Initial payment"
                        : "Balance payment"}{" "}
                      · {money(s.amount)}
                    </h3>
                    <Badge value={s.status} />
                  </div>
                  <p>
                    {s.methodSnapshot.name} · {date(s.submittedAt)}
                  </p>
                  <p>
                    {s.transactionReference &&
                      `Reference: ${s.transactionReference}`}
                  </p>
                  {s.reviewReason && (
                    <p className="review-reason">{s.reviewReason}</p>
                  )}
                  <a
                    className="text-link"
                    href={`/api/payment-submissions/${s.id}/proof`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open receipt ↗
                  </a>
                  {admin && (
                    <div className="receipt-preview">
                      <img
                        src={`/api/payment-submissions/${s.id}/proof`}
                        alt="Customer payment receipt"
                      />
                    </div>
                  )}
                  {admin && s.status === "SUBMITTED" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void review(s.id, "VERIFIED", e.currentTarget);
                      }}
                    >
                      <h3>Review checklist</h3>
                      <ul className="review-checklist">
                        <li>
                          Match the installment amount against the official
                          account
                        </li>
                        <li>Confirm payer and destination account</li>
                        <li>Check transaction date and merchant reference</li>
                      </ul>
                      <label>
                        Verified bank / merchant transaction reference
                        <input name="reference" required maxLength={200} />
                      </label>
                      <label>
                        Review reason
                        <input name="reason" maxLength={1000} />
                      </label>
                      <div className="button-row">
                        <button className="button-primary" disabled={busy}>
                          Approve {money(s.amount)}
                        </button>
                        <button
                          type="button"
                          className="button-danger"
                          disabled={busy}
                          onClick={(e) =>
                            void review(s.id, "REJECTED", e.currentTarget.form!)
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              ))}
            </section>
          )}
        </div>
        <aside className="order-summary panel">
          <h2>Order summary</h2>
          {order.items.map((item) => (
            <div className="summary-item" key={item.id}>
              <div className="summary-row">
                <span>
                  {item.itemDescription} × {item.quantity}
                  {item.embroideryName && (
                    <small>Embroidery: {item.embroideryName}</small>
                  )}
                </span>
                <strong>{money(Number(item.unitPrice) * item.quantity)}</strong>
              </div>
              <Badge value={item.pickupStatus} />
              <small>
                {item.batchId ? "Batch item" : "Merchandise"} · campus pickup
              </small>
              {item.batchId &&
                item.pickupStatus === "READY_FOR_PICKUP" &&
                order.paymentStatus !== "PAID" && (
                  <p>Ready. Balance must be verified before collection.</p>
                )}
              {admin &&
                ["PAID", "PARTIALLY_PAID"].includes(order.paymentStatus) &&
                ((item.pickupStatus === "PROCESSING" && !item.batchId) ||
                  item.pickupStatus === "READY_FOR_PICKUP") && (
                  <button
                    className="button-secondary"
                    disabled={
                      busy || (!!item.batchId && order.paymentStatus !== "PAID")
                    }
                    onClick={() =>
                      void run(() =>
                        api(`/api/admin/order-items/${item.id}/pickup`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            status:
                              item.pickupStatus === "READY_FOR_PICKUP"
                                ? "COMPLETED"
                                : "READY_FOR_PICKUP",
                          }),
                        }),
                      )
                    }
                  >
                    {item.pickupStatus === "READY_FOR_PICKUP"
                      ? "Mark this item collected"
                      : "Mark this item ready"}
                  </button>
                )}
            </div>
          ))}
          <div className="summary-row">
            <span>Pickup at campus</span>
            <span>Included</span>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(order.total)}</strong>
          </div>
          <div className="summary-row">
            <span>Verified payments</span>
            <strong>{money(order.paidAmount)}</strong>
          </div>
          <div className="summary-row">
            <span>Outstanding balance</span>
            <strong>{money(order.remainingBalance)}</strong>
          </div>
          {unpaid && (
            <div className="amount-due">
              <span>
                {order.phase === "INITIAL"
                  ? "Initial payment due"
                  : "Balance due"}
              </span>
              <strong>{money(order.amountDue)}</strong>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
