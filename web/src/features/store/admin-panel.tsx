"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { type Api, type Order, type PaymentMethod, type Product, money, date } from "./types";
import { OrderCard } from "./order-card";

function Field({ label, name, type = "text", required = false, value, min, step }: { label: string; name: string; type?: string; required?: boolean; value?: string | number; min?: string; step?: string }) {
  return <label>{label}<input name={name} type={type} required={required} defaultValue={value} min={min} step={step}/></label>;
}
function ActionForm({ children, onSubmit, report, reset = false }: { children: ReactNode; onSubmit: (data: FormData) => Promise<unknown>; report: (message: string) => void; reset?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setBusy(true);
    try { await onSubmit(data); if (reset) form.reset(); } catch (e) { report((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="product-form" onSubmit={submit}><fieldset disabled={busy}>{children}</fieldset></form>;
}
const get = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const variantData = (f: FormData) => ({ sku: get(f, "sku"), size: get(f, "size") || "STANDARD", color: get(f, "color") || "STANDARD", price: get(f, "price"), onHand: Number(get(f, "onHand")) });
const variantInputs = <div className="form-grid"><Field label="SKU" name="sku" required/><Field label="Size (blank = no size option)" name="size"/><Field label="Color (blank = no color option)" name="color"/><Field label="Price (IDR)" name="price" type="number" min="1" step="0.01" required/><Field label="Initial stock (zero for batches)" name="onHand" type="number" min="0" step="1" value="0" required/></div>;

export function AdminPanel({ api, report, refreshShop }: { api: Api; report: (message: string) => void; refreshShop: () => Promise<void> }) {
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodType, setMethodType] = useState("QRIS");
  const [history, setHistory] = useState<{ id: string; reason: string; onHandDelta: number; reservedDelta: number; createdAt: string; variant: { sku: string } }[]>([]);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    const [p, o, m] = await Promise.all([api("/api/admin/products"), api("/api/admin/orders"), api("/api/admin/payment-methods")]);
    setProducts(p.products); setOrders(o.orders); setMethods(m.methods);
  }, [api]);
  useEffect(() => { void load().catch(e => report(e.message)); }, [load, report]);
  const mutate = async (url: string, data: unknown, method = "POST") => { await api(url, { method, body: JSON.stringify(data) }); await Promise.all([load(), refreshShop()]); report("Saved successfully."); };
  const batchProducts = products.filter(p => p.sellingType === "BATCH");
  return <section className="staff-page"><p className="eyebrow">EKRAF ADMIN</p><h1>Manage the store</h1><nav className="admin-tabs">{["products", "batches", "payments", "orders"].map(t => <button className={tab === t ? "button-primary" : "button-secondary"} key={t} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {tab === "products" && <>
      <ActionForm report={report} reset onSubmit={f => mutate("/api/admin/products", { name: get(f,"name"), category: get(f,"category") || null, description: get(f,"description"), imageKey: get(f,"imageKey") || null, sellingType: get(f,"sellingType"), status: get(f,"status"), variants: [variantData(f)] })}><h2>Add product</h2><div className="form-grid"><Field label="Product name" name="name" required/><Field label="Category" name="category"/><label>Selling type<select name="sellingType"><option value="CONTINUOUS">Continuous · ready stock</option><option value="BATCH">Batch · preset size + embroidery name</option></select></label><label>Status<select name="status"><option>DRAFT</option><option>PUBLISHED</option></select></label><Field label="Product image URL (HTTPS)" name="imageKey" type="url"/></div><label>Description<textarea name="description"/></label><p>First variant — batch products need a preset size and zero initial stock.</p>{variantInputs}<button className="button-primary">Create product</button></ActionForm>
      {products.map(p => <article className="admin-product" key={p.id}>
        <ActionForm report={report} onSubmit={f => mutate(`/api/admin/products/${p.id}`, { name: get(f,"name"), category: get(f,"category") || null, description: get(f,"description"), imageKey: get(f,"imageKey") || null, status: get(f,"status") }, "PATCH")}><h2>{p.name} <small>{p.sellingType}</small></h2><div className="form-grid"><Field label="Name" name="name" value={p.name} required/><Field label="Category" name="category" value={p.category || ""}/><Field label="Image URL (HTTPS)" name="imageKey" value={p.imageKey || ""} type="url"/><label>Status<select name="status" defaultValue={p.status}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label></div><label>Description<textarea name="description" defaultValue={p.description}/></label><button className="button-secondary">Save product</button></ActionForm>
        {p.variants.map(v => <div className="variant-admin" key={v.id}><ActionForm report={report} onSubmit={f => mutate(`/api/admin/variants/${v.id}`, { price: get(f,"price"), active: f.get("active") === "on" }, "PATCH")}><h3>{v.sku} · {v.size} / {v.color}</h3><p>{v.onHand} on hand · {v.reserved} reserved · {v.onHand-v.reserved} available</p><div className="form-grid"><Field label="Price (IDR)" name="price" value={v.price} type="number" min="1" step="0.01" required/><label className="active-toggle"><input type="checkbox" name="active" defaultChecked={v.active}/> Active variant</label></div><button className="button-secondary">Save variant</button></ActionForm>
          {p.sellingType === "CONTINUOUS" && <ActionForm report={report} onSubmit={f => mutate(`/api/admin/variants/${v.id}/stock`, { onHand: Number(get(f,"onHand")), reason: get(f,"reason") })}><div className="form-grid"><Field label="New physical stock" name="onHand" type="number" min={String(v.reserved)} step="1" value={v.onHand} required/><Field label="Adjustment reason" name="reason" required/></div><button className="button-secondary">Adjust stock</button></ActionForm>}
        </div>)}
        <details><summary>Add another variant</summary><ActionForm reset report={report} onSubmit={f => mutate(`/api/admin/products/${p.id}/variants`, variantData(f))}>{variantInputs}<button className="button-secondary">Add variant</button></ActionForm></details>
        <button className="quiet" onClick={() => void api(`/api/admin/products/${p.id}/inventory`).then(d => setHistory(d.movements)).catch(e => report(e.message))}>View stock history</button>
      </article>)}
      {history.length > 0 && <article className="order-card"><h2>Stock history</h2>{history.map(m => <p key={m.id}>{date(m.createdAt)} · {m.variant.sku} · {m.reason} · physical {m.onHandDelta > 0 ? "+" : ""}{m.onHandDelta}, reserved {m.reservedDelta > 0 ? "+" : ""}{m.reservedDelta}</p>)}<button className="quiet" onClick={() => setHistory([])}>Close history</button></article>}
    </>}
    {tab === "batches" && <>
      {!batchProducts.length ? <p>Create a batch product and its sizes first.</p> : <ActionForm reset report={report} onSubmit={f => mutate("/api/admin/batches", { productId: get(f,"productId"), name: get(f,"name"), opensAt: new Date(get(f,"opensAt")).toISOString(), closesAt: new Date(get(f,"closesAt")).toISOString(), productionWeeks: Number(get(f,"weeks")), announcement: get(f,"announcement"), status: get(f,"status") })}><h2>Create batch</h2><div className="form-grid"><label>Product<select name="productId">{batchProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Field label="Batch name" name="name" required/><Field label="Opens at (local time)" name="opensAt" type="datetime-local" required/><Field label="Closes at (local time)" name="closesAt" type="datetime-local" required/><Field label="Production weeks" name="weeks" type="number" min="1" step="1" value="4" required/><label>Status<select name="status"><option>DRAFT</option><option>OPEN</option></select></label></div><label>Announcement<textarea name="announcement"/></label><button className="button-primary">Create batch</button></ActionForm>}
      {batchProducts.flatMap(p => p.batches.map(b => <article className="order-card" key={b.id}><h2>{p.name} · {b.name}</h2><p>{b.status} · closes {date(b.closesAt)} · production {b.productionWeeks} weeks</p><ActionForm report={report} onSubmit={f => mutate(`/api/admin/batches/${b.id}`, { status: get(f,"status"), announcement: get(f,"announcement") }, "PATCH")}><label>Batch status<select name="status" defaultValue={b.status}>{["DRAFT","OPEN","CLOSED","IN_PRODUCTION","READY","COMPLETED","CANCELLED"].map(s => <option key={s}>{s}</option>)}</select></label><label>Announcement<textarea name="announcement" defaultValue={b.announcement}/></label><button className="button-secondary">Update batch</button></ActionForm>
        {["CLOSED","IN_PRODUCTION","READY"].includes(b.status) && <ActionForm report={report} reset onSubmit={f => mutate(`/api/admin/batches/${b.id}/receive`, { items: p.variants.map(v => ({ variantId: v.id, quantity: Number(get(f,v.id)) })).filter(i => i.quantity > 0), reason: get(f,"reason") })}><h3>Receive production stock</h3><p>Enter quantities actually received. Paid orders are allocated automatically and become ready for pickup when complete.</p><div className="form-grid">{p.variants.map(v => <Field key={v.id} label={`${v.sku} · ${v.size} / ${v.color}`} name={v.id} type="number" min="0" step="1" value="0"/>)}<Field label="Receipt reason / delivery reference" name="reason" required/></div><button className="button-primary">Record receipt</button></ActionForm>}
      </article>))}
    </>}
    {tab === "payments" && <>
      <ActionForm reset report={report} onSubmit={f => mutate("/api/admin/payment-methods", { name: get(f,"name"), type: methodType, instructions: get(f,"instructions"), qrImageKey: get(f,"qrImageKey") || null, bankName: get(f,"bankName") || null, accountName: get(f,"accountName") || null, accountNumber: get(f,"accountNumber") || null })}><h2>Add payment method</h2><p>Enter the organization’s official details. Disable an old method and add a new one when account details change.</p><div className="form-grid"><Field label="Display name" name="name" required/><label>Type<select value={methodType} onChange={e => setMethodType(e.target.value)}><option>QRIS</option><option>BANK_TRANSFER</option></select></label>{methodType === "QRIS" ? <Field label="QRIS image URL (HTTPS)" name="qrImageKey" type="url" required/> : <><Field label="Bank" name="bankName" required/><Field label="Account name" name="accountName" required/><Field label="Account number" name="accountNumber" required/></>}</div><label>Payment instructions<textarea name="instructions"/></label><button className="button-primary">Add payment method</button></ActionForm>
      {methods.map(m => <article className="order-card" key={m.id}><h3>{m.name} · {m.type}</h3><p>{m.enabled ? "Enabled" : "Disabled"} · {m.type === "BANK_TRANSFER" ? `${m.bankName} · ${m.accountNumber} · ${m.accountName}` : "QRIS"}</p><button className="button-secondary" onClick={() => void mutate(`/api/admin/payment-methods/${m.id}`, { enabled: !m.enabled }, "PATCH").catch(e => report(e.message))}>{m.enabled ? "Disable" : "Enable"}</button></article>)}
      <h2>Receipts awaiting verification</h2>{orders.filter(o => o.paymentSubmissions.some(s => s.status === "SUBMITTED")).map(o => <OrderCard key={o.id} order={o} api={api} methods={methods} admin onChange={load} report={report}/>)}
    </>}
    {tab === "orders" && <><label>Search orders<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order ID or customer"/></label>{orders.filter(o => `${o.id} ${o.customerName}`.toLowerCase().includes(search.toLowerCase())).map(o => <OrderCard key={o.id} order={o} api={api} methods={methods} admin onChange={load} report={report}/>)}{!orders.length && <p>No orders yet.</p>}</>}
  </section>;
}
