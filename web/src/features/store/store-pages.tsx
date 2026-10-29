"use client";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useData, useStore } from "./store-provider";
import { StoreLayout, State, Pager, Badge, Icon } from "./ui";
import {
  type Product,
  type Order,
  type PaymentMethod,
  money,
  date,
} from "./types";
import { jacketPhoto, teePhoto } from "./design-assets";
import { OrderCard } from "./order-card";

export function ProductImage({ product }: { product: Product }) {
  return product.imageKey ? (
    <img
      src={product.imageKey}
      alt={product.name}
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="image-placeholder">
      <Icon name="box" size={36} />
      <span>{product.name}</span>
    </div>
  );
}
const price = (p: Product) =>
  p.variants
    .filter((v) => v.active)
    .reduce((min, v) => Math.min(min, Number(v.price)), Infinity);
function ProductTile({ product: p }: { product: Product }) {
  const batch = p.batches[0],
    available = p.variants.reduce((n, v) => n + v.onHand - v.reserved, 0);
  const href =
    p.sellingType === "BATCH" && batch
      ? `/batch-orders/${batch.id}`
      : `/products/${p.id}`;
  return (
    <article className="product-tile">
      <Link className="tile-image" href={href}>
        <ProductImage product={p} />
      </Link>
      <div className="tile-meta">
        <small>
          {p.sellingType === "BATCH"
            ? "BATCH ORDER"
            : p.category || "MERCHANDISE"}
        </small>
        <Link aria-label={`View ${p.name}`} className="tile-arrow" href={href}>
          <Icon name="external" size={14} />
        </Link>
      </div>
      {p.sellingType === "BATCH" && (
        <span className="tiny-badge">
          {batch ? "Batch order open" : "Batch closed"}
        </span>
      )}
      <Link href={href}>
        <h3>{p.name}</h3>
      </Link>
      <p>
        {p.sellingType === "BATCH" ? "From " : ""}
        {Number.isFinite(price(p)) ? money(price(p)) : "Unavailable"}
      </p>
      <small className="green">
        {p.sellingType === "BATCH"
          ? batch
            ? `Order by ${new Date(batch.closesAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "No open production batch"
          : available > 0
            ? "Ready for campus pickup"
            : "Sold out"}
      </small>
    </article>
  );
}
export function ShopPage({ batchOnly = false }: { batchOnly?: boolean }) {
  const search = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const params = new URLSearchParams(search.toString());
  if (batchOnly) params.set("type", "BATCH");
  const { data, error, loading, reload } = useData("/api/products?" + params);
  const { data: batchData } = useData("/api/batches?pageSize=1");
  const [dismissed, setDismissed] = useState(false);
  const batch = batchData?.batches[0];
  function change(key: string, value: string) {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(pathname + "?" + next.toString(), { scroll: false });
  }
  return (
    <StoreLayout>
      <div className="store-container">
        {!batchOnly && (
          <>
            {batch && !dismissed && (
              <aside className="announcement">
                <small>BATCH ORDER OPEN</small>
                <div>
                  <strong>{batch.product.name} — size + name embroidery</strong>
                  <span>
                    Order by {date(batch.closesAt)} · {batch.productionWeeks}{" "}
                    weeks production
                  </span>
                </div>
                <Link href={`/batch-orders/${batch.id}`}>
                  View batch order →
                </Link>
                <button
                  aria-label="Dismiss announcement"
                  onClick={() => setDismissed(true)}
                >
                  ×
                </button>
              </aside>
            )}
            <section className="flow-hero">
              <div className="hero-copy">
                <small>EKRAF BEM MIPA UGM · OFFICIAL STORE</small>
                <h1>
                  Made for
                  <br />
                  campus life.
                </h1>
                <p>
                  Everyday merch and limited batch pieces, made by MIPA students
                  for MIPA students.
                </p>
                <div className="button-row">
                  <a className="button-light" href="#collection">
                    Shop Now
                  </a>
                  <Link className="button-outline-light" href="/about">
                    About EKRAF →
                  </Link>
                </div>
              </div>
              <div className="hero-photos">
                <figure className="hero-tee">
                  <img src={teePhoto} alt="Black campus T-shirts on hangers" />
                  <figcaption>Campus essentials</figcaption>
                </figure>
                <figure className="hero-jacket">
                  <img src={jacketPhoto} alt="Forest green varsity jacket" />
                  <figcaption>Faculty collection</figcaption>
                </figure>
                {batch && (
                  <Link
                    className="hero-batch"
                    href={`/batch-orders/${batch.id}`}
                  >
                    Batch order open
                  </Link>
                )}
              </div>
            </section>
          </>
        )}
        <section id="collection" className="collection">
          <div className="collection-heading">
            <div>
              <small className="eyebrow">
                {batchOnly ? "MADE TO ORDER" : "COLLECTION"}
              </small>
              <h1>{batchOnly ? "Batch orders" : "Shop the collection"}</h1>
            </div>
            <form
              className="compact-search"
              onSubmit={(e) => {
                e.preventDefault();
                change(
                  "search",
                  String(new FormData(e.currentTarget).get("search") || ""),
                );
              }}
            >
              <Icon name="search" size={15} />
              <input
                name="search"
                aria-label="Search collection"
                placeholder="Search products"
                defaultValue={search.get("search") || search.get("q") || ""}
              />
              <button className="sr-only">Search</button>
            </form>
            <div className="collection-controls">
              {!batchOnly && (
                <div className="segmented">
                  {[
                    ["", "All products"],
                    ["CONTINUOUS", "Merchandise"],
                    ["BATCH", "Batch order"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      className={
                        (search.get("type") || "") === v ? "active" : ""
                      }
                      onClick={() => change("type", v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <select
                aria-label="Sort products"
                value={search.get("sort") || "featured"}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="featured">Featured</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="newest">Newest</option>
              </select>
              {data?.categories.length > 0 && (
                <select
                  aria-label="Filter category"
                  value={search.get("category") || ""}
                  onChange={(e) => change("category", e.target.value)}
                >
                  <option value="">All categories</option>
                  {data.categories.map((c: string) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <State loading={loading} error={error} retry={reload}>
            {data?.products.length ? (
              <div className="product-grid">
                {data.products.map((p: Product) => (
                  <ProductTile key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>
                  {search.size
                    ? "No products match your filters."
                    : "The collection is being prepared."}
                </h3>
                <p>
                  {search.size
                    ? "Try another search or category."
                    : "Check back soon for campus merchandise and upcoming batches."}
                </p>
              </div>
            )}
            <Pager
              value={data?.pagination}
              onPage={(page) => change("page", String(page))}
            />
          </State>
        </section>
        {!batchOnly && (
          <section className="buying-steps">
            <small className="outlined-label">HOW IT WORKS</small>
            <h2 className="mobile-only">Buy in four simple steps</h2>
            <div>
              {[
                ["Browse", "Pick your everyday merch or batch order piece."],
                ["Choose", "Select your size, color, and quantity."],
                [
                  "Pay",
                  "Pay in full or choose a 50% batch DP and upload proof.",
                ],
                ["Receive", "Track each item and collect it on campus."],
              ].map(([name, copy], i) => (
                <article key={name}>
                  <small>
                    0{i + 1} {name.toUpperCase()}
                  </small>
                  <h3>{name}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </StoreLayout>
  );
}

export function ProductPage({
  id,
  batchMode = false,
}: {
  id: string;
  batchMode?: boolean;
}) {
  const { data, loading, error, reload } = useData(
    batchMode ? `/api/batches/${id}` : `/api/products/${id}`,
  );
  const { add } = useStore();
  const router = useRouter();
  const p: Product | undefined = batchMode
    ? data?.batch.product
    : data?.product;
  const batch = batchMode ? data?.batch : p?.batches[0];
  const [selected, setSelected] = useState(""),
    [quantity, setQuantity] = useState(1),
    [name, setName] = useState(""),
    [review, setReview] = useState(false);
  const variants = p?.variants.filter((v) => v.active) || [],
    v = variants.find((v) => v.id === selected) || variants[0];
  const isBatch = p?.sellingType === "BATCH";
  const colors = [...new Set(variants.map((v) => v.color))],
    sizes = [
      ...new Set(
        variants.filter((x) => !v || x.color === v.color).map((v) => v.size),
      ),
    ].sort((a, b) => {
      const sizes = ["STANDARD", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
      const rank = (size: string) =>
        sizes.includes(size) ? sizes.indexOf(size) : sizes.length;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  const open =
    batch &&
    batch.status === "OPEN" &&
    new Date(batch.opensAt) <= new Date() &&
    new Date(batch.closesAt) > new Date();
  const available = v ? v.onHand - v.reserved : 0;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v) return;
    if (isBatch && !review) {
      setReview(true);
      return;
    }
    add({
      variantId: v.id,
      batchId: isBatch ? batch.id : null,
      quantity,
      ...(isBatch ? { embroideryName: name.trim() } : {}),
    });
    router.push("/cart");
  }
  return (
    <StoreLayout simple={!isBatch}>
      <div className="store-container detail-container">
        <State loading={loading} error={error} retry={reload}>
          {p && (
            <>
              <nav className="breadcrumb">
                <Link href={isBatch ? "/batch-orders" : "/"}>
                  {isBatch ? "Batch Order" : "Shop"}
                </Link>{" "}
                / {p.name}
              </nav>
              {isBatch && (
                <div className="batch-notice">
                  <Icon name="clock" size={16} />
                  {batch
                    ? `${batch.name} ${open ? "closes" : "closed"} ${date(batch.closesAt)} · Estimated production ${batch.productionWeeks} weeks after closing`
                    : "No open production batch"}
                </div>
              )}
              <div className="product-detail-grid">
                <div>
                  <div className="detail-photo">
                    <ProductImage product={p} />
                  </div>
                  {isBatch ? (
                    <small className="muted">
                      Sample image · color may vary slightly
                    </small>
                  ) : (
                    p.imageKey && (
                      <div className="photo-thumb">
                        <ProductImage product={p} />
                      </div>
                    )
                  )}
                </div>
                <div className="product-detail-copy">
                  <small className="eyebrow">
                    {isBatch
                      ? batch?.name || "BATCH ORDER"
                      : p.category || "MERCHANDISE"}
                  </small>
                  <h1>{p.name}</h1>
                  <p className="muted">{p.description}</p>
                  <h2>{v ? money(v.price) : "Unavailable"}</h2>
                  {isBatch && (
                    <div className="checkout-steps">
                      <span className={!review ? "active" : ""}>
                        1 Choose details
                      </span>
                      <span className={review ? "active" : ""}>2 Review</span>
                      <span>3 Pay</span>
                    </div>
                  )}
                  <form className="variant-choice" onSubmit={submit}>
                    {review ? (
                      <>
                        <h3>Review your customization</h3>
                        <p>
                          Size: {v?.size} · Color:{" "}
                          {v?.color === "STANDARD" ? "Standard" : v?.color}
                        </p>
                        <p>
                          Embroidery: <strong>{name}</strong> · Quantity:{" "}
                          {quantity}
                        </p>
                        <p>Total: {v && money(Number(v.price) * quantity)}</p>
                        <button
                          className="text-link"
                          type="button"
                          onClick={() => setReview(false)}
                        >
                          Edit details
                        </button>
                        <p className="muted">
                          You can pay in full or choose 50% batch DP during
                          mixed checkout.
                        </p>
                      </>
                    ) : (
                      <>
                        {colors.some((c) => c !== "STANDARD") && (
                          <fieldset>
                            <legend>Color</legend>
                            <div className="choice-row">
                              {colors.map((color) => (
                                <button
                                  type="button"
                                  key={color}
                                  aria-pressed={v?.color === color}
                                  className={
                                    v?.color === color
                                      ? "choice selected"
                                      : "choice"
                                  }
                                  onClick={() =>
                                    setSelected(
                                      variants.find(
                                        (x) =>
                                          x.color === color &&
                                          x.size === v?.size,
                                      )?.id ||
                                        variants.find((x) => x.color === color)!
                                          .id,
                                    )
                                  }
                                >
                                  {color === "STANDARD" ? "Standard" : color}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        )}
                        {sizes.some((s) => s !== "STANDARD") && (
                          <fieldset>
                            <legend>{isBatch ? "Jacket size" : "Size"}</legend>
                            <div className="choice-row">
                              {sizes.map((size) => (
                                <button
                                  type="button"
                                  aria-pressed={v?.size === size}
                                  className={
                                    v?.size === size
                                      ? "size-choice selected"
                                      : "size-choice"
                                  }
                                  key={size}
                                  onClick={() =>
                                    setSelected(
                                      variants.find(
                                        (x) =>
                                          x.color === v?.color &&
                                          x.size === size,
                                      )!.id,
                                    )
                                  }
                                >
                                  {size === "STANDARD" ? "One size" : size}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        )}
                        {isBatch && (
                          <>
                            <label>
                              Name for embroidery
                              <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                maxLength={80}
                                placeholder="Exactly as it should be embroidered"
                              />
                            </label>
                            <label>
                              Faculty<span className="fixed-value">MIPA</span>
                            </label>
                          </>
                        )}
                        <label>
                          Quantity
                          <div className="quantity-control">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              disabled={quantity <= 1}
                              onClick={() => setQuantity((q) => q - 1)}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              aria-label="Quantity"
                              min="1"
                              max={isBatch ? 100 : Math.min(available, 100)}
                              value={quantity}
                              onChange={(e) =>
                                setQuantity(Number(e.target.value))
                              }
                              required
                            />
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              disabled={quantity >= (isBatch ? 100 : available)}
                              onClick={() => setQuantity((q) => q + 1)}
                            >
                              +
                            </button>
                          </div>
                        </label>
                        {isBatch && (
                          <p className="info-note">
                            Names are embroidered exactly as entered. Please
                            double-check spelling before continuing.
                          </p>
                        )}
                      </>
                    )}
                    <button
                      className="button-primary full-width"
                      disabled={
                        !v ||
                        (isBatch ? !open : available < quantity) ||
                        !Number.isInteger(quantity) ||
                        quantity < 1
                      }
                    >
                      {isBatch
                        ? open
                          ? review
                            ? "Add reviewed item to cart"
                            : `Review order · ${v ? money(Number(v.price) * quantity) : ""}`
                          : "Batch closed"
                        : available > 0
                          ? "Add to cart"
                          : "Sold out"}
                    </button>
                  </form>
                  <div className="detail-assurance">
                    <span>
                      <Icon name="box" size={15} />
                      {isBatch
                        ? "Produced after batch closing"
                        : "Campus pickup"}
                    </span>
                    <span>
                      <Icon name="check" size={15} />
                      Manual payment verification
                    </span>
                  </div>
                </div>
              </div>
              {!isBatch && (
                <section className="detail-information">
                  <h3>Details</h3>
                  <p>
                    {p.description ||
                      "Campus merchandise from EKRAF BEM MIPA UGM."}
                  </p>
                  <div className="detail-assurance">
                    <span>Size and color availability varies by variant.</span>
                    <span>Collect on campus after payment verification.</span>
                  </div>
                </section>
              )}
            </>
          )}
        </State>
      </div>
    </StoreLayout>
  );
}

export function CartPage() {
  const {
      cart,
      remove,
      quantity,
      api,
      user,
      ready,
      report,
      checkoutKey,
      completeCheckout,
      invalidateCheckout,
    } = useStore(),
    router = useRouter();
  const ids = [...new Set(cart.map((l) => l.variantId))].join(",");
  const { data, loading, error, reload } = useData(
    cart.length ? "/api/cart/variants?ids=" + encodeURIComponent(ids) : null,
  );
  const [plan, setPlan] = useState("FULL"),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false);
  const variants = data?.variants || [];
  const sum = (batchOnly = false) =>
    cart.reduce(
      (sum, l) =>
        sum +
        (batchOnly && !l.batchId
          ? 0
          : Math.round(
              Number(
                variants.find((v: any) => v.id === l.variantId)?.price || 0,
              ) * 100,
            ) * l.quantity),
      0,
    );
  const subtotal = sum() / 100,
    batchTotal = sum(true) / 100,
    initial =
      plan === "BATCH_DEPOSIT" && batchTotal
        ? (sum() - sum(true) + Math.round(sum(true) / 2)) / 100
        : subtotal;
  async function checkout(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const result = await api("/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": checkoutKey() },
        body: JSON.stringify({
          customerName: user.name,
          customerPhone: phone,
          paymentPlan: batchTotal ? plan : "FULL",
          items: cart.map(
            ({ variantId, batchId, quantity, embroideryName }) => ({
              variantId,
              batchId,
              quantity,
              embroideryName,
            }),
          ),
        }),
      });
      completeCheckout();
      router.push(`/orders/${result.order.id}/payment`);
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <StoreLayout>
      <div className="store-container cart-page">
        <div className="page-heading">
          <small className="eyebrow">CAMPUS PICKUP</small>
          <h1>Your cart</h1>
          <p>Merchandise and batch items, together in one checkout.</p>
        </div>
        {!cart.length ? (
          <div className="empty">
            <h2>Your bag is empty.</h2>
            <Link className="button-primary" href="/">
              Explore the collection
            </Link>
          </div>
        ) : (
          <State loading={loading || !ready} error={error} retry={reload}>
            <div className="checkout-grid">
              <section className="panel cart-items">
                {cart.map((line) => {
                  const v = variants.find((v: any) => v.id === line.variantId);
                  return (
                    <article className="cart-item" key={line.id}>
                      <div className="cart-photo">
                        {v ? (
                          <ProductImage product={v.product} />
                        ) : (
                          <Icon name="box" />
                        )}
                      </div>
                      <div>
                        <h3>{v?.product.name || "Unavailable item"}</h3>
                        <p>
                          {v?.size === "STANDARD" ? "" : v?.size}{" "}
                          {v?.color === "STANDARD" ? "" : v?.color}
                        </p>
                        {line.embroideryName && (
                          <p>
                            Name: <strong>{line.embroideryName}</strong>
                          </p>
                        )}
                        <Badge value={line.batchId ? "BATCH" : "MERCHANDISE"} />
                        <label className="cart-quantity">
                          Quantity
                          <input
                            type="number"
                            min="1"
                            max="100"
                            disabled={busy}
                            value={line.quantity}
                            onChange={(e) =>
                              quantity(line.id, Number(e.target.value))
                            }
                          />
                        </label>
                        <button
                          disabled={busy}
                          className="text-link"
                          onClick={() => remove(line.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <strong>
                        {v
                          ? money(Number(v.price) * line.quantity)
                          : "Unavailable"}
                      </strong>
                    </article>
                  );
                })}
              </section>
              <aside className="panel">
                <h2>Order summary</h2>
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Campus pickup</span>
                  <span>Included</span>
                </div>
                <div className="summary-total">
                  <span>Total</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                {user ? (
                  <form onSubmit={checkout}>
                    {batchTotal > 0 && (
                      <fieldset>
                        <legend>Batch payment</legend>
                        <label className="radio-option">
                          <input
                            type="radio"
                            name="plan"
                            value="FULL"
                            checked={plan === "FULL"}
                            onChange={() => {
                              setPlan("FULL");
                              invalidateCheckout();
                            }}
                          />
                          Pay everything in full
                        </label>
                        <label className="radio-option">
                          <input
                            type="radio"
                            name="plan"
                            value="BATCH_DEPOSIT"
                            checked={plan === "BATCH_DEPOSIT"}
                            onChange={() => {
                              setPlan("BATCH_DEPOSIT");
                              invalidateCheckout();
                            }}
                          />
                          Full merchandise + 50% batch DP
                        </label>
                      </fieldset>
                    )}
                    <p>
                      Due within 24 hours: <strong>{money(initial)}</strong>
                    </p>
                    {initial < subtotal && (
                      <p className="muted">
                        Remaining batch balance: {money(subtotal - initial)},
                        verified before batch pickup.
                      </p>
                    )}
                    <label>
                      Name
                      <input value={user.name} readOnly />
                    </label>
                    <label>
                      WhatsApp / phone number
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        minLength={6}
                        maxLength={30}
                        required
                        autoComplete="tel"
                      />
                    </label>
                    <button
                      className="button-primary full-width"
                      disabled={
                        busy ||
                        cart.some(
                          (l) =>
                            !variants.some((v: any) => v.id === l.variantId),
                        )
                      }
                    >
                      {busy ? "Creating order…" : "Continue to payment"}
                    </button>
                  </form>
                ) : (
                  <>
                    <p>Sign in to reserve your items and pay.</p>
                    <Link
                      className="button-primary full-width"
                      href="/sign-in?next=/cart"
                    >
                      Sign in to checkout
                    </Link>
                  </>
                )}
                <p className="muted">
                  Ready merchandise can be collected separately from batch
                  pieces.
                </p>
              </aside>
            </div>
          </State>
        )}
      </div>
    </StoreLayout>
  );
}

export function AuthPage({ register = false }: { register?: boolean }) {
  const { api, refreshAuth, ready, report } = useStore();
  const router = useRouter(),
    search = useSearchParams();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      await refreshAuth();
      const next = search.get("next");
      router.replace(
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : "/orders",
      );
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <StoreLayout simple>
      <div className="auth-page panel">
        <small className="eyebrow">EKRAF BEM MIPA UGM</small>
        <h1>{register ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">Shop campus merchandise and track your orders.</p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Name
              <input
                name="name"
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={register ? 12 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </label>
          <button
            className="button-primary full-width"
            disabled={busy || !ready}
          >
            {register ? "Create account" : "Sign in"}
          </button>
        </form>
        <Link
          className="text-link"
          href={`${register ? "/sign-in" : "/register"}?next=${encodeURIComponent(search.get("next") || "/orders")}`}
        >
          {register
            ? "Already have an account? Sign in"
            : "Create a customer account"}
        </Link>
      </div>
    </StoreLayout>
  );
}

export function OrdersPage({
  id,
  payment = false,
}: {
  id?: string;
  payment?: boolean;
}) {
  const { api, user, ready, report } = useStore();
  const params = useSearchParams(),
    router = useRouter();
  const { data, loading, error, reload } = useData(
    ready && user
      ? id
        ? `/api/orders/${id}`
        : `/api/orders?page=${params.get("page") || 1}`
      : null,
  );
  const { data: methods } = useData("/api/payment-methods");
  return (
    <StoreLayout>
      <div
        className={`store-container ${payment ? "payment-page" : "orders-page"}`}
      >
        <nav className="breadcrumb">
          <Link href="/orders">My Orders</Link>
          {id && " / " + (payment ? "Payment" : "Order details")}
        </nav>
        <h1>
          {payment
            ? "Complete your payment"
            : id
              ? "Order details"
              : "My orders"}
        </h1>
        {!ready ? (
          <State loading />
        ) : !user ? (
          <div className="empty">
            <p>Sign in to view your orders and payment proofs.</p>
            <Link
              className="button-primary"
              href={`/sign-in?next=${encodeURIComponent(id ? `/orders/${id}${payment ? "/payment" : ""}` : "/orders")}`}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <State loading={loading} error={error} retry={reload}>
            {id ? (
              data?.order && (
                <>
                  {payment && (
                    <div className="checkout-steps">
                      <span className="done">✓ Order</span>
                      <span className="active">2 Payment</span>
                      <span>3 Verification</span>
                    </div>
                  )}
                  <OrderCard
                    order={data.order}
                    api={api}
                    methods={methods?.methods || []}
                    onChange={reload}
                    report={report}
                    paymentPage={payment}
                  />
                </>
              )
            ) : (
              <>
                <div className="order-list">
                  {data?.orders.map((o: Order) => (
                    <Link
                      className="panel order-list-row"
                      href={`/orders/${o.id}`}
                      key={o.id}
                    >
                      <div>
                        <small>{date(o.createdAt)}</small>
                        <h3>{o.id}</h3>
                        <p>
                          {o.items
                            .map((i) => i.itemDescription.split(" · ")[0])
                            .join(", ")}
                        </p>
                      </div>
                      <Badge value={o.paymentStatus} />
                      <strong>{money(o.total)}</strong>
                      <span>›</span>
                    </Link>
                  ))}
                </div>
                {!data?.orders.length && (
                  <div className="empty">
                    No orders yet. <Link href="/">Browse the collection</Link>
                  </div>
                )}
                <Pager
                  value={data?.pagination}
                  onPage={(page) => router.replace(`/orders?page=${page}`)}
                />
              </>
            )}
          </State>
        )}
      </div>
    </StoreLayout>
  );
}
export function AboutPage() {
  return (
    <StoreLayout simple>
      <div className="store-container about-page">
        <section className="about-intro">
          <div>
            <small className="eyebrow">EKRAF</small>
            <h1>Made by MIPA, for MIPA</h1>
            <p>
              EKRAF BEM MIPA UGM is a student organization unit that develops
              creative products, merchandise, and apparel for the MIPA UGM
              community. We make useful, meaningful pieces that represent campus
              life.
            </p>
          </div>
          <div className="identity-panel">
            <strong>EKRAF</strong>
            <span>Creative economy and merchandise unit</span>
          </div>
        </section>
        <section>
          <h2>What we do</h2>
          <div className="about-programs">
            {[
              ["EKRAF Podcast", "Sharing with successful entrepreneurs."],
              ["Kewiras Belajar", "On-site learning with local businesses."],
              [
                "Forum Kewiras",
                "Sharing with other student associations in MIPA.",
              ],
            ].map(([title, copy]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="about-bottom">
          <div>
            <h2>Our values</h2>
            <div className="choice-row">
              {["Creative", "Collaborative", "Responsible"].map((v) => (
                <span className="value-tag" key={v}>
                  {v}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2>Get in touch</h2>
            <div className="panel contact-card">
              <a
                href="https://www.instagram.com/ekrafbem_mipa/"
                target="_blank"
                rel="noreferrer"
              >
                <span>Instagram</span>
                <strong>@ekrafbem_mipa</strong>
              </a>
              <a href="mailto:ekrafbem.mipa@ugm.ac.id">
                <span>Email</span>
                <strong>ekrafbem.mipa@ugm.ac.id</strong>
              </a>
            </div>
          </div>
        </section>
      </div>
    </StoreLayout>
  );
}
