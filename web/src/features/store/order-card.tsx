"use client";
import { useState, type FormEvent } from "react";
import { type Api, type Order, type PaymentMethod, date, money } from "./types";
export function OrderCard({ order, api, methods, admin = false, onChange, report }: { order: Order; api: Api; methods: PaymentMethod[]; admin?: boolean; onChange: () => Promise<void>; report: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [methodId, setMethodId] = useState("");
  const method = methods.find(m => m.id === methodId) ?? methods[0];
  const pending = order.paymentSubmissions.some(s => s.status === "SUBMITTED");
  const unpaid = ["PENDING","PARTIALLY_PAID"].includes(order.paymentStatus);
  const open = order.paymentStatus === "PARTIALLY_PAID" || order.paymentStatus === "PENDING" && new Date(order.expiresAt) > new Date();
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); try { await work(); await onChange(); } catch (e) { report((e as Error).message); } finally { setBusy(false); }
  };
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); const file = data.get("proof") as File;
    if (!file?.size || !method) return;
    if (file.size > 5*1024*1024) { report("Choose a JPG or PNG smaller than 5 MB."); return; }
    await run(async () => { await api(`/api/orders/${order.id}/proof`, { method: "POST", headers: { "Content-Type": file.type, "X-Payment-Method": method.id, "X-Payment-Reference": String(data.get("reference") || "") }, body: file }); report("Proof submitted for manual review."); });
  }
  async function review(id: string, action: "VERIFIED" | "REJECTED", form: HTMLFormElement) {
    const data = new FormData(form);
    await run(() => api(`/api/admin/payment-submissions/${id}/review`, { method: "POST", body: JSON.stringify({ action, reason: data.get("reason"), reference: data.get("reference") }) }));
  }
  return <article className="order-card"><div className="order-head"><div><small>ORDER · {date(order.createdAt)}</small><h3>{order.id}</h3>{admin && <p>{order.customerName} · {order.customerPhone}</p>}</div><span className={`status status-${order.paymentStatus.toLowerCase()}`}>{order.paymentStatus.replaceAll("_"," ")}</span></div>
    {order.items.map(item => <section key={item.id}><div className="summary-row"><span>{item.itemDescription} × {item.quantity}{item.embroideryName && <strong> · Embroidery: {item.embroideryName}</strong>}<br/><small>{item.batchId ? "Batch" : "Merchandise"} · {item.pickupStatus.replaceAll("_"," ")}</small></span><b>{money(Number(item.unitPrice)*item.quantity)}</b></div>
      {item.batchId && item.pickupStatus === "READY_FOR_PICKUP" && order.paymentStatus !== "PAID" && <p>Production is ready. Verify the remaining balance before collecting batch items.</p>}
      {admin && ["PAID","PARTIALLY_PAID"].includes(order.paymentStatus) && (item.pickupStatus === "PROCESSING" && !item.batchId || item.pickupStatus === "READY_FOR_PICKUP") && <button className="button-secondary" disabled={busy || !!item.batchId && order.paymentStatus !== "PAID"} onClick={() => void run(() => api(`/api/admin/order-items/${item.id}/pickup`, { method: "PATCH", body: JSON.stringify({ status: item.pickupStatus === "READY_FOR_PICKUP" ? "COMPLETED" : "READY_FOR_PICKUP" }) }))}>{item.pickupStatus === "READY_FOR_PICKUP" ? "Mark this item collected" : "Mark this item ready"}</button>}
    </section>)}
    <div className="summary-total"><span>Total · campus pickup</span><b>{money(order.total)}</b></div><p>Verified payments: <b>{money(order.paidAmount)}</b> · Outstanding: <b>{money(order.remainingBalance)}</b></p>
    {order.paymentSubmissions.map(s => <section className="payment-instructions" key={s.id}><b>{s.phase === "INITIAL" ? "Initial payment" : "Balance payment"} · {s.status} · {money(s.amount)}</b><p>{s.methodSnapshot.name} · {date(s.submittedAt)}<br/>{s.transactionReference && `Reference: ${s.transactionReference}. `}{s.reviewReason}</p><a href={`/api/payment-submissions/${s.id}/proof`} target="_blank" rel="noreferrer">View payment receipt ↗</a>
      {admin && s.status === "SUBMITTED" && <form onSubmit={e => { e.preventDefault(); void review(s.id,"VERIFIED",e.currentTarget); }}><label>Verified bank / merchant transaction reference<input name="reference" required maxLength={200}/></label><label>Review reason<input name="reason" maxLength={1000}/></label><div className="button-row"><button className="button-primary" disabled={busy}>Approve {money(s.amount)}</button><button type="button" className="button-secondary" disabled={busy} onClick={e => { const form = e.currentTarget.form!; if (!String(new FormData(form).get("reason") || "").trim()) { report("Enter a rejection reason."); return; } void review(s.id,"REJECTED",form); }}>Reject proof</button></div></form>}
    </section>)}
    {!admin && unpaid && (pending ? <p className="payment-instructions">Payment proof is awaiting review. Your reservation stays held while the admin checks it.</p> : open ? <><p>{order.phase === "INITIAL" ? `Pay ${money(order.amountDue)} before ${date(order.expiresAt)}.` : `Remaining batch balance: ${money(order.amountDue)}. Pay and have it verified before collecting batch items.`}</p>
      {!method ? <p>Payment details are being prepared. Contact EKRAF before paying.</p> : <form className="proof-form" onSubmit={upload}><label>Payment method<select value={method.id} onChange={e => setMethodId(e.target.value)}>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="payment-instructions"><b>{method.name}</b><p>{method.instructions}</p>{method.type === "QRIS" ? <img className="qr-image" src={method.qrImageKey!} alt={`${method.name} QRIS code`}/> : <p>{method.bankName} · {method.accountNumber}<br/>{method.accountName}</p>}</div><label>Transaction reference (optional)<input name="reference" maxLength={200}/></label><label>Payment proof (JPG/PNG, max 5 MB)<input name="proof" type="file" accept="image/png,image/jpeg" required/></label><button disabled={busy} className="button-primary">Submit {order.phase === "INITIAL" ? "initial payment" : "balance"} proof · {money(order.amountDue)}</button></form>}
      {order.paymentStatus === "PENDING" && <button className="quiet" disabled={busy} onClick={() => { if (window.confirm("Cancel this unpaid order?")) void run(() => api(`/api/orders/${order.id}/cancel`, { method: "POST" })); }}>Cancel unpaid order</button>}
    </> : <p>The 24-hour payment deadline has passed. Expiry and stock release are processing.</p>)}
  </article>;
}
