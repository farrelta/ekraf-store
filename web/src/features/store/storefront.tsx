"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { OrderCard } from "./order-card";
import { type Api, type Order, type PaymentMethod, type Product, type User, money, date } from "./types";

const AdminPanel = dynamic(() => import("./admin-panel").then(m => m.AdminPanel), { loading: () => <p>Loading admin workspace…</p> });
type CartLine = { id: string; variantId: string; batchId: string | null; embroideryName?: string; quantity: number };
const CART_KEY = "ekraf:cart:v2";
const KEYS_KEY = "ekraf:checkout:v2";
function ProductCard({ product: p, add }: { product: Product; add: (line: Omit<CartLine, "id">) => void }) {
  const [variantId, setVariantId] = useState("");
  const [batchId, setBatchId] = useState("");
  const v = p.variants.find(v => v.id === variantId) ?? p.variants[0];
  const batch = p.batches.find(b => b.id === batchId) ?? p.batches[0];
  const isBatch = p.sellingType === "BATCH";
  const available = v ? v.onHand - v.reserved : 0;
  const canBuy = !!v && (isBatch ? !!batch : available > 0);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!v || !canBuy) return;
    const f = new FormData(e.currentTarget);
    add({ variantId: v.id, batchId: isBatch ? batch!.id : null, quantity: Number(f.get("quantity")), ...(isBatch ? { embroideryName: String(f.get("name") || "").trim() } : {}) });
  }
  return <article className="product"><div className="product-image tint-1">{p.imageKey ? <img src={p.imageKey} alt={p.name} referrerPolicy="no-referrer"/> : <div className="placeholder-art"><span>EK</span><small>EKRAF BEM MIPA UGM</small></div>}<span className="stock-pill">{isBatch ? batch ? "Batch open" : "Batch closed" : `${available} available`}</span></div><div className="product-info"><div><small>{p.category || (isBatch ? "BATCH ORDER" : "MERCHANDISE")}</small><h3>{p.name}</h3></div><b>{v ? money(v.price) : "Unavailable"}</b></div><p className="description">{p.description}</p>
    <form className="product-options" onSubmit={submit}>
      {p.variants.length > 0 && <label>Size / color<select value={v?.id || ""} onChange={e => setVariantId(e.target.value)}>{p.variants.map(v => <option value={v.id} key={v.id}>{v.size === "STANDARD" ? "One size" : v.size} / {v.color === "STANDARD" ? "Standard" : v.color} · {money(v.price)}</option>)}</select></label>}
      {isBatch && batch && <><label>Batch<select value={batch.id} onChange={e => setBatchId(e.target.value)}>{p.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><p className="subtle">Order by {date(batch.closesAt)} · production about {batch.productionWeeks} weeks</p>{batch.announcement && <p>{batch.announcement}</p>}<label>Name for embroidery<input name="name" required minLength={1} maxLength={80} placeholder="Exactly as it should be embroidered"/></label></>}
      <div className="buy-row"><label>Quantity<input name="quantity" type="number" min="1" max={isBatch ? 100 : Math.min(available, 100)} defaultValue="1" required/></label><button className="button-primary" disabled={!canBuy}>{canBuy ? "Add to bag" : isBatch ? "No open batch" : "Sold out"}</button></div>
    </form>
  </article>;
}
export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  const [view, setView] = useState("shop");
  const [notice, setNotice] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const report = useCallback((message: string) => setNotice(message), []);
  const api: Api = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (options.body && typeof options.body === "string") headers.set("Content-Type", "application/json");
    if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrf);
    const response = await fetch(url, { ...options, headers, credentials: "include", cache: "no-store" });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request failed. Please try again.");
    return data;
  }, [csrf]);
  const refreshShop = useCallback(async () => {
    const [p, m] = await Promise.all([api("/api/products"), api("/api/payment-methods")]);
    setProducts(Array.isArray(p.products) ? p.products : []); setMethods(Array.isArray(m.methods) ? m.methods : []);
  }, [api]);
  const refreshOrders = useCallback(async () => { const data = await api("/api/orders"); setOrders(data.orders); }, [api]);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      if (Array.isArray(stored)) setCart(stored.filter((x): x is CartLine => !!x && typeof x.id === "string" && typeof x.variantId === "string" && (x.batchId === null || typeof x.batchId === "string") && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 100 && (x.embroideryName === undefined || typeof x.embroideryName === "string")));
      const saved: unknown = JSON.parse(localStorage.getItem(KEYS_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) setKeys(Object.fromEntries(Object.entries(saved).filter(([,v]) => typeof v === "string" && /^[a-f0-9-]{36}$/i.test(v))));
    } catch { /* Invalid saved state starts an empty bag. */ }
    setReady(true);
    let active = true;
    void Promise.all([
      fetch("/api/csrf", { credentials: "include", cache: "no-store" }).then(async r => { if (!r.ok) throw new Error("Could not initialize your session"); return r.json(); }),
      fetch("/api/auth/me", { credentials: "include", cache: "no-store" }).then(async r => { if (r.status === 401) return { user: null }; if (!r.ok) throw new Error("Could not load your account"); return r.json(); })
    ]).then(([c, me]) => { if (active) { setCsrf(c.token); setUser(me.user); } }).catch(e => { if (active) report(e.message); });
    return () => { active = false; };
  }, [report]);
  useEffect(() => { void refreshShop().catch(e => report(e.message)); }, [refreshShop, report]);
  useEffect(() => { if (user && view === "orders") void refreshOrders().catch(e => report(e.message)); }, [user, view, refreshOrders, report]);
  useEffect(() => { if (ready) try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); localStorage.setItem(KEYS_KEY, JSON.stringify(keys)); } catch { /* Bag remains usable if storage is unavailable. */ } }, [cart, keys, ready]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  const variants = products.flatMap(p => p.variants.map(v => ({ ...v, product: p })));
  const groups = [...new Set(cart.map(line => line.batchId || "continuous"))];
  function clearKey(group: string) { setKeys(old => { const next = { ...old }; delete next[group]; return next; }); }
  function add(line: Omit<CartLine,"id">) {
    if (busy) return;
    clearKey(line.batchId || "continuous");
    setCart(old => [...old, { ...line, id: crypto.randomUUID() }]); report("Added to bag. Each batch and ready-stock group has its own checkout.");
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true);
    try {
      const data = await api(`/api/auth/${isLogin ? "login" : "register"}`, { method: "POST", body: JSON.stringify({ name: f.get("name"), email: f.get("email"), password: f.get("password") }) });
      setUser(data.user); const c = await api("/api/csrf"); setCsrf(c.token); form.reset(); report("Signed in successfully.");
    } catch (e) { report((e as Error).message); } finally { setBusy(false); }
  }
  async function checkout(group: string) {
    if (!user) { report("Sign in before placing an order."); return; }
    if (phone.trim().length < 6) { report("Enter your phone number for campus pickup."); return; }
    const lines = cart.filter(l => (l.batchId || "continuous") === group);
    if (lines.some(l => !variants.some(v => v.id === l.variantId))) { report("Remove unavailable items before checkout."); return; }
    const key = keys[group] || crypto.randomUUID();
    // Persist before sending so a reload can safely retry an uncertain response.
    const nextKeys = { ...keys, [group]: key }; setKeys(nextKeys);
    try { localStorage.setItem(KEYS_KEY, JSON.stringify(nextKeys)); } catch { /* This page still retains the checkout key. */ }
    setBusy(true);
    try {
      const data = await api("/api/orders", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ batchId: group === "continuous" ? null : group, customerName: user.name, customerPhone: phone, items: lines.map(({ variantId, quantity, embroideryName }) => ({ variantId, quantity, embroideryName })) }) });
      setCart(old => old.filter(l => !lines.some(done => done.id === l.id))); clearKey(group); setOrders([data.order]); setView("orders"); await refreshShop(); report(`Order created. Pay ${money(data.order.total)} and upload your receipt in My orders.`);
    } catch (e) { report((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="app-shell"><header className="topbar"><a href="#" className="brand" onClick={() => setView("shop")}><span className="brand-mark">E</span><span>EKRAF<small>BEM MIPA UGM</small></span></a><nav><button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}>Shop</button>{user && <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>My orders</button>}{user?.role === "ADMIN" && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Admin</button>}</nav><div className="account">{user ? <><span>{user.name}</span><button className="quiet" onClick={() => void api("/api/auth/logout", { method: "POST" }).then(async () => { setUser(null); setOrders([]); setView("shop"); const c = await api("/api/csrf"); setCsrf(c.token); }).catch(e => report(e.message))}>Sign out</button></> : <a href="#account">Sign in</a>}</div></header>
    <main>{notice && <div className="notice" role="status" aria-live="polite"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      {view === "shop" && <>
        <section className="hero"><div><p className="eyebrow">EKRAF BEM MIPA UGM · OFFICIAL STORE</p><h1>Made for<br/><em>campus life.</em></h1><p>Everyday merchandise and faculty batch pieces. Made by MIPA students, for MIPA students.</p><a href="#catalog" className="hero-link">Shop the collection ↓</a></div><div className="hero-art"><div className="sun"/><div className="art-card card-a"><span>E</span><b>campus<br/>essentials</b></div><div className="art-card card-b"><span>M</span><b>made<br/>for MIPA</b></div></div></section>
        <section className="catalog" id="catalog"><div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Shop the collection</h2></div><label className="search"><input aria-label="Search products" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)}/></label></div><div className="admin-tabs">{[["ALL","All products"],["CONTINUOUS","Merchandise"],["BATCH","Batch orders"]].map(([key,label]) => <button key={key} className={filter === key ? "button-primary" : "button-secondary"} onClick={() => setFilter(key)}>{label}</button>)}</div><div className="product-grid">{products.filter(p => (filter === "ALL" || p.sellingType === filter) && p.name.toLowerCase().includes(search.toLowerCase())).map(p => <ProductCard key={p.id} product={p} add={add}/>)}</div>{!products.length && <p className="empty">The collection is being prepared. Check back soon.</p>}</section>
        <section className="checkout-area" id="account"><div><p className="eyebrow">YOUR BAG</p><h2>Ready when you are.</h2><p>Campus pickup · QRIS or bank transfer · manual payment verification. Place separate orders for ready-stock items and each production batch.</p></div><div className="checkout-card">
          {!user && <form className="auth-form" onSubmit={authenticate}><div className="form-head"><h3>{isLogin ? "Sign in" : "Create an account"}</h3><button type="button" className="link-button" onClick={() => setIsLogin(!isLogin)}>{isLogin ? "Create account" : "Sign in"}</button></div>{!isLogin && <label>Name<input name="name" required minLength={2} autoComplete="name"/></label>}<label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" required minLength={isLogin ? 1 : 12} autoComplete={isLogin ? "current-password" : "new-password"}/></label><button className="button-primary" disabled={busy || !csrf}>{isLogin ? "Sign in" : "Create account"}</button></form>}
          {user && <label>Phone number for campus pickup<input value={phone} onChange={e => setPhone(e.target.value)} type="tel" autoComplete="tel"/></label>}
          {!cart.length && <p>Your bag is empty.</p>}{groups.map(group => {
            const lines = cart.filter(l => (l.batchId || "continuous") === group);
            const title = group === "continuous" ? "Ready-stock order" : products.flatMap(p => p.batches).find(b => b.id === group)?.name || "Batch order";
            const subtotal = lines.reduce((sum,l) => sum + Number(variants.find(v => v.id === l.variantId)?.price || 0) * l.quantity,0);
            return <section className="bag-group" key={group}><h3>{title}</h3>{lines.map(l => { const v = variants.find(v => v.id === l.variantId); return <div className="summary-row" key={l.id}><span>{v ? `${v.product.name} · ${v.size}/${v.color}` : "Unavailable product"} × {l.quantity}{l.embroideryName && <strong> · {l.embroideryName}</strong>}</span><button className="quiet" disabled={busy} onClick={() => { setCart(old => old.filter(x => x.id !== l.id)); clearKey(group); }}>Remove</button></div>; })}<div className="summary-total"><span>Estimated total</span><b>{money(subtotal)}</b></div><button className="button-primary" disabled={busy || !user || !csrf || phone.trim().length < 6} onClick={() => void checkout(group)}>Place this order</button></section>;
          })}
        </div></section>
      </>}
      {view === "orders" && user && <section className="staff-page"><p className="eyebrow">YOUR ACCOUNT</p><h1>My orders</h1><button className="quiet" onClick={() => void refreshOrders().catch(e => report(e.message))}>Refresh order status</button>{orders.map(o => <OrderCard key={o.id} order={o} api={api} methods={methods} onChange={refreshOrders} report={report}/>)}{!orders.length && <p>No orders yet.</p>}</section>}
      {view === "admin" && user?.role === "ADMIN" && <AdminPanel api={api} report={report} refreshShop={refreshShop}/>}
    </main><footer><div className="brand">EKRAF<small>BEM MIPA UGM</small></div><p>Made by MIPA, for MIPA.<br/>Campus pickup and manually verified payments.</p></footer>
  </div>;
}
