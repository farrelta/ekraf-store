"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Product = { id: string; name: string; description: string; imageUrl?: string | null; price: string; stock: number; category?: { name: string } | null };
type User = { id: string; name: string; email: string; role: string };
type Order = { publicId: string; total: string; paymentStatus: string; fulfillmentStatus: string; expiresAt: string; createdAt: string; paymentEvents?: { action: string; reason: string; reference: string; createdAt: string; actor?: { name: string; email: string } | null }[]; items: { productName: string; quantity: number; lineTotal: string }[]; customerName: string; customerPhone: string };
type Movement = { type: string; quantity: number; reason: string; createdAt: string; order?: { publicId: string } | null };
const money = (value: string | number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
const NOTICE_DURATION_MS = 5_000;
const CART_STORAGE_KEY = "mipa-store:cart:v1";
const CHECKOUT_KEY_STORAGE_KEY = "mipa-store:checkout-key:v1";

function readCart(): Record<string, number> {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY) ?? localStorage.getItem("cart");
    const value: unknown = JSON.parse(stored || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, quantity]) =>
      id.length > 0 && Number.isSafeInteger(quantity) && Number(quantity) > 0 && Number(quantity) <= 100_000
    )) as Record<string, number>;
  } catch {
    return {};
  }
}

function readCheckoutKey(): string {
  try {
    const value = localStorage.getItem(CHECKOUT_KEY_STORAGE_KEY) ?? localStorage.getItem("checkout-key") ?? "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : "";
  } catch {
    return "";
  }
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [identity, setIdentity] = useState({ name: "", email: "", password: "", phone: "", notes: "" });
  const [isLogin, setIsLogin] = useState(true);
  const [csrf, setCsrf] = useState("");
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminProducts, setAdminProducts] = useState<(Product & { active: boolean })[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [settledAdminSearch, setSettledAdminSearch] = useState("");
  const [checkoutKey, setCheckoutKey] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockHistory, setStockHistory] = useState<{ productName: string; movements: Movement[] } | null>(null);
  const [view, setView] = useState<"shop" | "orders" | "admin">("shop");
  const [productDraft, setProductDraft] = useState({ name: "", description: "", price: "", stock: "0", imageUrl: "" });

  const api = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (options.body) headers.set("Content-Type", "application/json");
    if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) headers.set("X-CSRF-Token", csrf);
    const response = await fetch(path, { ...options, headers, credentials: "include" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Request failed"); }
    return response.status === 204 ? null : response.json();
  };

  const refresh = async () => {
    const [p, i, c, me] = await Promise.all([
      fetch("/api/products").then(r => r.json()),
      fetch("/api/payment-instructions").then(r => r.json()),
      fetch("/api/csrf", { credentials: "include" }).then(r => r.json()),
      fetch("/api/auth/me", { credentials: "include" })
    ]);
    setProducts(p.products); setInstructions(i.instructions); setCsrf(c.token);
    if (me.ok) { const body = await me.json(); setUser(body.user); }
    else if (me.status === 401) setUser(null);
  };
  useEffect(() => {
    setCart(readCart());
    setCheckoutKey(readCheckoutKey());
    setStorageReady(true);
  }, []);
  useEffect(() => { let active = true; void refresh().catch(e => { if (active) setNotice(e.message); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); localStorage.removeItem("cart"); } catch { /* Storage can be disabled or full; the in-memory cart still works. */ }
  }, [cart, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    try { if (checkoutKey) localStorage.setItem(CHECKOUT_KEY_STORAGE_KEY, checkoutKey); else localStorage.removeItem(CHECKOUT_KEY_STORAGE_KEY); localStorage.removeItem("checkout-key"); } catch { /* Checkout remains available for this page session. */ }
  }, [checkoutKey, storageReady]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => { const timer = window.setTimeout(() => setSettledAdminSearch(adminSearch.trim()), 250); return () => window.clearTimeout(timer); }, [adminSearch]);
  useEffect(() => {
    if (!user || view !== "orders") return;
    let active = true;
    void api("/api/orders").then(d => { if (active) setOrders(d.orders); }).catch(e => { if (active) setNotice(e.message); });
    return () => { active = false; };
  }, [user, view]);
  useEffect(() => {
    if (!user || view !== "admin" || !["ADMIN", "TREASURER"].includes(user.role)) return;
    let active = true;
    const query = settledAdminSearch ? `?q=${encodeURIComponent(settledAdminSearch)}` : "";
    void api(`/api/admin/orders${query}`).then(d => { if (active) setAdminOrders(d.orders); }).catch(e => { if (active) setNotice(e.message); });
    if (user.role === "ADMIN") void api("/api/admin/products").then(d => { if (active) setAdminProducts(d.products); }).catch(e => { if (active) setNotice(e.message); });
    return () => { active = false; };
  }, [user, view, settledAdminSearch]);

  const filtered = useMemo(() => products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const cartLines = products.filter(p => cart[p.id]).map(p => ({ ...p, quantity: cart[p.id] }));
  const subtotal = cartLines.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);
  const quantity = (id: string, value: number, stock: number) => setCart(prev => ({ ...prev, [id]: Math.max(0, Math.min(stock, value)) }));

  const submitAuth = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setNotice("");
    try {
      const body = isLogin ? { email: identity.email, password: identity.password } : { name: identity.name, email: identity.email, password: identity.password };
      const result = await api(`/api/auth/${isLogin ? "login" : "register"}`, { method: "POST", body: JSON.stringify(body) });
      setUser(result.user); setIdentity(v => ({ ...v, password: "" }));
      const fresh = await api("/api/csrf"); setCsrf(fresh.token);
      setNotice("Signed in successfully.");
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  };

  const checkout = async () => {
    if (!user) { setNotice("Sign in or create a customer account before checkout."); return; }
    if (!cartLines.length) return;
    setBusy(true); setNotice("");
    try {
      const body = { items: cartLines.map(p => ({ productId: p.id, quantity: p.quantity })), customerName: identity.name || user.name, customerPhone: identity.phone, fulfillmentMethod: "PICKUP", fulfillmentNotes: identity.notes };
      const key = checkoutKey || crypto.randomUUID(); setCheckoutKey(key);
      const response = await api("/api/orders", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });
      setCheckoutKey(""); setCart({}); setView("orders"); setOrders([response.order]);
      setNotice(`Order ${response.order.publicId} created. Pay ${money(response.order.total)} using the instructions below.`);
    } catch (e) { setNotice((e as Error).message); await refresh(); } finally { setBusy(false); }
  };

  const signOut = async () => { await api("/api/auth/logout", { method: "POST" }); setUser(null); setView("shop"); };
  const paymentReference = async (publicId: string) => {
    const reference = window.prompt("Payment reference (optional)") || "";
    try { await api(`/api/orders/${publicId}/payment-reference`, { method: "POST", body: JSON.stringify({ reference }) }); setNotice("Reference submitted for manual review. Payment is not yet confirmed."); }
    catch (e) { setNotice((e as Error).message); }
  };
  const decidePayment = async (order: Order, action: "PAID" | "REJECTED") => {
    const reason = action === "REJECTED" ? window.prompt("Reason for rejection") || "" : "Verified against official account";
    if (action === "REJECTED" && !reason) return;
    const reference = action === "PAID" ? window.prompt("Official bank or merchant transaction reference") || "" : "";
    if (action === "PAID" && !reference) return;
    try { await api(`/api/admin/orders/${order.publicId}/payment`, { method: "POST", body: JSON.stringify({ action, reason, reference }) }); const d = await api("/api/admin/orders"); setAdminOrders(d.orders); }
    catch (e) { setNotice((e as Error).message); }
  };
  const createProduct = async (e: FormEvent) => {
    e.preventDefault();
    try { await api("/api/admin/products", { method: "POST", body: JSON.stringify({ ...productDraft, price: Number(productDraft.price), stock: Number(productDraft.stock), imageUrl: productDraft.imageUrl || null }) }); setProductDraft({ name: "", description: "", price: "", stock: "0", imageUrl: "" }); await refresh(); setNotice("Product created."); }
    catch (e) { setNotice((e as Error).message); }
  };
  const saveProduct = async (product: Product, form: HTMLFormElement) => {
    const fields = new FormData(form);
    try {
      const adjustmentReason = String(fields.get("stockAdjustmentReason") || "").trim();
      await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ name: fields.get("name"), description: fields.get("description"), price: Number(fields.get("price")), stock: Number(fields.get("stock")), imageUrl: fields.get("imageUrl") || null, ...(adjustmentReason ? { stockAdjustmentReason: adjustmentReason } : {}), active: fields.get("active") === "on" }) });
      const d = await api("/api/admin/products"); setAdminProducts(d.products); setNotice("Product updated.");
    } catch (e) { setNotice((e as Error).message); }
  };
  const cancelOrder = async (publicId: string) => {
    if (!window.confirm("Cancel this pending order and release its stock reservation?")) return;
    try { await api(`/api/orders/${publicId}/cancel`, { method: "POST", body: JSON.stringify({}) }); const d = await api("/api/orders"); setOrders(d.orders); setNotice("Order cancelled and stock reservation released."); }
    catch (e) { setNotice((e as Error).message); }
  };
  const changeFulfillment = async (order: Order, status: string) => {
    try { await api(`/api/admin/orders/${order.publicId}/fulfillment`, { method: "PATCH", body: JSON.stringify({ status }) }); const d = await api(`/api/admin/orders${adminSearch ? `?q=${encodeURIComponent(adminSearch)}` : ""}`); setAdminOrders(d.orders); }
    catch (e) { setNotice((e as Error).message); }
  };
  const showStockHistory = async (product: Product) => {
    try { const data = await api(`/api/admin/products/${product.id}/inventory`); setStockHistory({ productName: product.name, movements: data.movements }); }
    catch (e) { setNotice((e as Error).message); }
  };

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#home" onClick={() => setView("shop")}><span className="brand-mark">M</span><span>MIPA <b>STORE</b><small>Campus creative goods</small></span></a><nav><button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}>Shop</button>{user && <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>My orders</button>}{user && ["ADMIN", "TREASURER"].includes(user.role) && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Staff</button>}</nav><div className="account">{user ? <><span>{user.name}</span><button className="quiet" onClick={() => void signOut()}>Sign out</button></> : <span>Campus shop</span>}</div></header>
    <main>
      {notice && <div className="notice" role="status" aria-live="polite"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      {view === "shop" && <>
        <section className="hero"><div><p className="eyebrow">MADE ON CAMPUS, MADE TO LAST</p><h1>Good things,<br/><em>made together.</em></h1><p>Discover thoughtful creations from our campus community. Every order supports a more sustainable creative economy.</p><a href="#catalog" className="hero-link">Explore the collection <span>↓</span></a></div><div className="hero-art"><div className="sun"></div><div className="art-card card-a"><span>✳</span><b>local<br/>makers</b></div><div className="art-card card-b"><span>◌</span><b>thoughtful<br/>goods</b></div><div className="art-caption">Small batch · Campus made</div></div></section>
        <section className="catalog" id="catalog"><div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Find your next favorite</h2></div><label className="search">⌕ <input aria-label="Search products" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
          {filtered.length === 0 ? <div className="empty">{search ? "No products match that search." : "The collection is being prepared. Check back soon."}</div> : <div className="product-grid">{filtered.map((p, i) => <article className="product" key={p.id}><div className={`product-image tint-${i % 4}`}>{p.imageUrl ? <img src={p.imageUrl} alt={p.name} referrerPolicy="no-referrer"/> : <div className="placeholder-art"><span>{["✳", "◌", "⌁", "✿"][i % 4]}</span><small>MIPA / GOODS</small></div>}<span className="stock-pill">{p.stock ? `${p.stock} available` : "Sold out"}</span></div><div className="product-info"><div><small>{p.category?.name || "CAMPUS GOODS"}</small><h3>{p.name}</h3></div><b>{money(p.price)}</b></div><p className="description">{p.description || "A thoughtful piece made by our campus community."}</p><button className="detail-link" onClick={() => setSelectedProduct(p)}>View product details ↗</button><div className="buy-row">{cart[p.id] ? <div className="stepper"><button aria-label="Remove one" onClick={() => quantity(p.id, cart[p.id] - 1, p.stock)}>−</button><span>{cart[p.id]}</span><button aria-label="Add one" disabled={cart[p.id] >= p.stock} onClick={() => quantity(p.id, cart[p.id] + 1, p.stock)}>+</button></div> : <span className="subtle">{p.stock ? "Ready for pickup" : "Currently unavailable"}</span>}<button className="add-button" disabled={!p.stock} onClick={() => quantity(p.id, (cart[p.id] || 0) + 1, p.stock)}>{cart[p.id] ? "Added" : "Add to bag"} <span>↗</span></button></div></article>)}</div>}
        </section>
        <section className="checkout-area"><div><p className="eyebrow">YOUR BAG</p><h2>Ready when you are.</h2><p>Orders are reserved for 48 hours while our treasurer confirms payment. Pickup details are coordinated after payment is verified.</p></div><div className="checkout-card"><h3>Order summary <span>{cartLines.reduce((s,p)=>s+p.quantity,0)} items</span></h3>{cartLines.length === 0 ? <p className="subtle">Your bag is empty.</p> : cartLines.map(p => <div className="summary-row" key={p.id}><span>{p.name} × {p.quantity}</span><b>{money(Number(p.price)*p.quantity)}</b></div>)}<div className="summary-total"><span>Estimated total</span><b>{money(subtotal)}</b></div>{!user && <form onSubmit={submitAuth} className="auth-form"><div className="form-head"><b>{isLogin ? "Sign in to checkout" : "Create a customer account"}</b><button type="button" className="link-button" onClick={() => setIsLogin(v => !v)}>{isLogin ? "Create account" : "I have an account"}</button></div>{!isLogin && <input required minLength={2} placeholder="Your name" value={identity.name} onChange={e => setIdentity({...identity,name:e.target.value})}/>}<input required type="email" placeholder="Email address" value={identity.email} onChange={e => setIdentity({...identity,email:e.target.value})}/><input required type="password" minLength={12} placeholder="Password (12+ characters)" value={identity.password} onChange={e => setIdentity({...identity,password:e.target.value})}/><button className="button-secondary" disabled={busy}>{isLogin ? "Sign in" : "Create account"}</button></form>}{user && cartLines.length > 0 && <div className="checkout-form"><input aria-label="Phone number" required placeholder="Phone number for pickup" value={identity.phone} onChange={e=>setIdentity({...identity,phone:e.target.value})}/><textarea aria-label="Pickup note" placeholder="Pickup note (optional)" value={identity.notes} onChange={e=>setIdentity({...identity,notes:e.target.value})}/><button className="button-primary" disabled={busy || !identity.phone.trim()} onClick={() => void checkout()}>{busy ? "Placing order…" : "Place order"} <span>→</span></button></div>}</div></section>
      </>}
      {view === "orders" && <section className="staff-page"><p className="eyebrow">YOUR ACCOUNT</p><h1>Order history</h1>{orders.length === 0 ? <div className="empty">No orders yet. Your next favorite might be in the collection.</div> : orders.map(o => <article className="order-card" key={o.publicId}><div className="order-head"><div><small>ORDER REFERENCE</small><h3>{o.publicId}</h3></div><span className={`status status-${o.paymentStatus.toLowerCase()}`}>{o.paymentStatus.replaceAll("_", " ")}</span></div>{o.items.map((i,n)=><div className="summary-row" key={n}><span>{i.productName} × {i.quantity}</span><b>{money(i.lineTotal)}</b></div>)}<div className="summary-total"><span>Total · {o.fulfillmentStatus.replaceAll("_", " ")}</span><b>{money(o.total)}</b></div>{o.paymentStatus === "PENDING" && <><div className="payment-instructions"><b>Manual payment instructions · pay by {new Date(o.expiresAt).toLocaleString("id-ID")}</b><p>{instructions}</p></div><div className="button-row"><button className="button-secondary" onClick={() => void paymentReference(o.publicId)}>Submit payment reference</button><button className="button-secondary" onClick={() => void cancelOrder(o.publicId)}>Cancel order</button></div></>}</article>)}</section>}
      {view === "admin" && <section className="staff-page"><p className="eyebrow">STAFF WORKSPACE</p><h1>Orders & products</h1>{user?.role === "ADMIN" && <><form className="product-form" onSubmit={createProduct}><h3>Add a product</h3><div className="form-grid"><input required placeholder="Product name" value={productDraft.name} onChange={e=>setProductDraft({...productDraft,name:e.target.value})}/><input required type="number" min="0.01" step="0.01" placeholder="Price (IDR)" value={productDraft.price} onChange={e=>setProductDraft({...productDraft,price:e.target.value})}/><input required type="number" min="0" step="1" placeholder="Stock" value={productDraft.stock} onChange={e=>setProductDraft({...productDraft,stock:e.target.value})}/><input type="url" placeholder="Image URL (HTTPS)" value={productDraft.imageUrl} onChange={e=>setProductDraft({...productDraft,imageUrl:e.target.value})}/></div><textarea placeholder="Description" value={productDraft.description} onChange={e=>setProductDraft({...productDraft,description:e.target.value})}/><button className="button-primary">Create product</button></form><h2>Manage products</h2>{adminProducts.map(p=><form className="product-form" key={p.id} onSubmit={e=>{e.preventDefault();void saveProduct(p,e.currentTarget);}}><div className="form-grid"><input name="name" aria-label="Product name" defaultValue={p.name}/><input name="price" aria-label="Price" type="number" min="0.01" step="0.01" defaultValue={p.price}/><input name="stock" aria-label="Stock" type="number" min="0" step="1" defaultValue={p.stock}/><input name="imageUrl" aria-label="HTTPS image URL" type="url" defaultValue={p.imageUrl || ""} placeholder="HTTPS image URL"/></div><input name="stockAdjustmentReason" aria-label="Stock adjustment reason" placeholder="Reason if changing stock"/><textarea name="description" aria-label="Description" defaultValue={p.description}/><label className="active-toggle"><input name="active" type="checkbox" defaultChecked={p.active}/> Available in storefront</label><div className="button-row"><button className="button-secondary" type="button" onClick={() => void showStockHistory(p)}>View stock history</button><button className="button-secondary">Save product changes</button></div></form>)}{stockHistory && <div className="order-card"><div className="order-head"><h3>{stockHistory.productName} · stock history</h3><button className="quiet" onClick={() => setStockHistory(null)}>Close</button></div>{stockHistory.movements.length ? stockHistory.movements.map((m,n)=><div className="summary-row" key={n}><span>{m.type.replaceAll("_"," ")} · {m.reason} {m.order ? `· ${m.order.publicId}` : ""} · {new Date(m.createdAt).toLocaleString("id-ID")}</span><b>{m.quantity > 0 ? "+" : ""}{m.quantity}</b></div>) : <p className="subtle">No stock movements recorded.</p>}</div>}</>}
      <div className="admin-search"><h2>Order review</h2><input aria-label="Search orders" placeholder="Search order reference or customer" value={adminSearch} onChange={e=>setAdminSearch(e.target.value)}/></div>{adminOrders.map(o=><article className="order-card" key={o.publicId}><div className="order-head"><div><small>{o.customerName} · {o.customerPhone}</small><h3>{o.publicId}</h3></div><span className={`status status-${o.paymentStatus.toLowerCase()}`}>{o.paymentStatus}</span></div>{o.items.map((i,n)=><div className="summary-row" key={n}><span>{i.productName} × {i.quantity}</span><b>{money(i.lineTotal)}</b></div>)}<div className="payment-history">{o.paymentEvents?.map((event,n)=><p key={n}><b>{event.action}</b> · {new Date(event.createdAt).toLocaleString("id-ID")} {event.actor?.name ? `· ${event.actor.name}` : ""}{event.reference ? `· ${event.reference}` : ""}{event.reason ? `· ${event.reason}` : ""}</p>)}</div><div className="summary-total"><span>{o.fulfillmentStatus}</span><b>{money(o.total)}</b></div>{o.paymentStatus === "PENDING" && <div className="button-row"><button className="button-secondary" onClick={() => void decidePayment(o,"REJECTED")}>Reject with reason</button><button className="button-primary" onClick={() => void decidePayment(o,"PAID")}>Confirm payment</button></div>}{o.paymentStatus === "PAID" && o.fulfillmentStatus !== "COMPLETED" && <div className="button-row"><select aria-label="New fulfillment status" id={`fulfillment-${o.publicId}`} defaultValue=""><option value="" disabled>Update fulfillment</option>{(o.fulfillmentStatus === "PROCESSING" ? [["READY_FOR_PICKUP","Ready for pickup"],["SHIPPED","Shipped"]] : [["COMPLETED","Completed"]]).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><button className="button-secondary" onClick={()=>{const select=document.getElementById(`fulfillment-${o.publicId}`) as HTMLSelectElement;void changeFulfillment(o,select.value);}}>Update status</button></div>}</article>)}</section>}
    </main>
    {selectedProduct && <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title" onKeyDown={e=>{if(e.key==="Escape")setSelectedProduct(null);}} onClick={e=>e.stopPropagation()}><button className="detail-close" autoFocus aria-label="Close product details" onClick={() => setSelectedProduct(null)}>×</button><div className="detail-image">{selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} referrerPolicy="no-referrer"/> : <span>✳</span>}</div><p className="eyebrow">{selectedProduct.category?.name || "CAMPUS GOODS"}</p><h2 id="detail-title">{selectedProduct.name}</h2><p>{selectedProduct.description || "A thoughtful piece made by our campus community."}</p><b>{money(selectedProduct.price)}</b><p className="subtle">{selectedProduct.stock ? `${selectedProduct.stock} available` : "Currently unavailable"}</p><button className="button-primary" disabled={!selectedProduct.stock || (cart[selectedProduct.id] || 0) >= selectedProduct.stock} onClick={() => { quantity(selectedProduct.id,(cart[selectedProduct.id] || 0)+1,selectedProduct.stock);setSelectedProduct(null); }}>Add to bag</button></section></div>}
    <footer><a className="brand" href="#home"><span className="brand-mark">M</span><span>MIPA <b>STORE</b><small>Campus creative goods</small></span></a><p>Thoughtful goods, made together.<br/>Pickup and manual payment for campus orders.</p><span className="footer-note">© MIPA Store · Campus community</span></footer>
    {cartLines.length > 0 && view === "shop" && <button className="mobile-bag" onClick={() => document.querySelector(".checkout-area")?.scrollIntoView({behavior:"smooth"})}>Bag · {cartLines.length} <span>{money(subtotal)} →</span></button>}
  </div>;
}
