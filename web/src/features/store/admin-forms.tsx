"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode, type FormEvent } from "react";
import { CategorySelect, VariantInputs } from "./catalog-fields";
import { useData, useStore } from "./store-provider";
import { Badge, State } from "./ui";
import { date, money, type CatalogOptions } from "./types";
const get = (f: FormData, k: string) => String(f.get(k) || "").trim();
const category = (f: FormData) =>
  (get(f, "categoryChoice") === "Other"
    ? get(f, "customCategory")
    : get(f, "categoryChoice")) || null;
const variant = (f: FormData) => ({
  size: get(f, "size") || "STANDARD",
  color: get(f, "color") || "STANDARD",
  type: get(f, "type") || "STANDARD",
  price: get(f, "price"),
  onHand: Number(get(f, "onHand")),
});
function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  min,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        step={type === "number" ? "1" : undefined}
      />
    </label>
  );
}
export function ActionForm({
  children,
  submit,
}: {
  children: ReactNode;
  submit: (f: FormData) => Promise<unknown>;
}) {
  const { report } = useStore();
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await submit(f);
      report("Saved successfully.");
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="editor-form" onSubmit={save}>
      <fieldset disabled={busy}>{children}</fieldset>
    </form>
  );
}
export function ProductEditor({ id }: { id?: string }) {
  const { api, report } = useStore(),
    router = useRouter(),
    base = "/" + useParams().adminPath;
  const {
      data: options,
      loading: ol,
      error: oe,
    } = useData<CatalogOptions>("/api/admin/catalog-options"),
    { data, loading, error, reload } = useData(
      id ? `/api/admin/products/${id}` : null,
    );
  const p = data?.product;
  const [type, setType] = useState<"CONTINUOUS" | "BATCH">("CONTINUOUS"),
    [history, setHistory] = useState<any[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingVariant, setDeletingVariant] = useState<string | null>(null);
  async function deleteVariant(variant: any) {
    if (deletingVariant || !window.confirm(`Permanently delete variant ${variant.sku}? This cannot be undone.`)) return;
    setDeletingVariant(variant.id);
    try {
      await api(`/api/admin/variants/${variant.id}`, { method: "DELETE" });
      await reload();
      report("Variant permanently deleted.");
    } catch (error) { report((error as Error).message); }
    finally { setDeletingVariant(null); }
  }
  async function deleteProduct() {
    if (deleting || !window.confirm(`Permanently delete "${p.name}" and its variants? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/api/admin/products/${id}`, { method: "DELETE" });
      report("Product permanently deleted.");
      router.replace(base + "/products");
    } catch (error) {
      report((error as Error).message);
      setDeleting(false);
    }
  }
  const mutate = async (url: string, body: unknown, method = "POST") => {
    const result = await api(url, { method, body: JSON.stringify(body) });
    await reload();
    return result;
  };
  return (
    <State loading={ol || (!!id && loading)} error={oe || error}>
      {options && (!id || p) && (
        <>
          <Link className="text-link" href={base + "/products"}>
            ‹ Products
          </Link>
          {p && <section className="panel form-section"><h2>Permanent deletion</h2><p>Only unused drafts with no batches, orders, stock, or stock history can be deleted. Archive other products to preserve their records.</p><button type="button" className="button-danger" disabled={deleting || p.status !== "DRAFT"} onClick={() => void deleteProduct()}>{deleting ? "Deleting…" : "Permanently delete product"}</button></section>}
          <ActionForm
            key={p?.updatedAt || "new"}
            submit={async (f) => {
              const body = {
                name: get(f, "name"),
                description: get(f, "description"),
                category: category(f),
                imageKey: get(f, "imageKey") || null,
                status: get(f, "status"),
                featured: f.get("featured") === "on",
              };
              if (id) await mutate(`/api/admin/products/${id}`, body, "PATCH");
              else {
                const r = await mutate("/api/admin/products", {
                  ...body,
                  sellingType: type,
                  variants: [variant(f)],
                });
                router.replace(base + "/products/" + r.product.id);
              }
            }}
          >
            <section className="panel form-section">
              <h2>Product details</h2>
              {!id && (
                <label>
                  Selling type
                  <select
                    aria-label="Selling type"
                    value={type}
                    onChange={(e) => setType(e.target.value as typeof type)}
                  >
                    <option value="CONTINUOUS">Merchandise</option>
                    <option value="BATCH">Batch order</option>
                  </select>
                </label>
              )}
              <Field
                label="Product name"
                name="name"
                value={p?.name}
                required
              />
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={p?.description}
                  maxLength={5000}
                  rows={4}
                />
              </label>
              <div className="form-grid">
                <CategorySelect options={options} current={p?.category} />
                <label>
                  Status
                  <select
                    name="status"
                    aria-label="Status"
                    defaultValue={p?.status || "DRAFT"}
                  >
                    <option>DRAFT</option>
                    <option>PUBLISHED</option>
                    <option>ARCHIVED</option>
                  </select>
                </label>
              </div>
              <Field
                label="Product image URL (HTTPS)"
                name="imageKey"
                value={p?.imageKey || ""}
                type="url"
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={p?.featured}
                />{" "}
                Feature in the collection
              </label>
              {p?.imageKey && (
                <img className="editor-preview" src={p.imageKey} alt={p.name} />
              )}
            </section>
            {!id && (
              <section className="panel form-section">
                <h2>First variant</h2>
                <VariantInputs options={options} sellingType={type} />
              </section>
            )}
            <button className="button-primary">
              {id ? "Save product" : "Create product"}
            </button>
          </ActionForm>
          {p && (
            <>
              <h2 style={{ marginTop: "2rem" }}>Variants</h2>
              {p.variants.map((v: any) => (
                <section className="panel form-section" key={v.id}>
                  <div className="section-title">
                    <h3>
                      {v.size === "STANDARD" ? "No size" : v.size} /{" "}
                      {v.color === "STANDARD" ? "No color" : v.color} / {v.type === "STANDARD" ? "No type" : v.type}
                    </h3>
                    <Badge value={v.active ? "PUBLISHED" : "ARCHIVED"} />
                  </div>
                  <p className="sku">SKU: {v.sku}</p>
                  <button type="button" className="button-danger" disabled={!!deletingVariant || p.variants.length <= 1} onClick={() => void deleteVariant(v)}>Delete variant permanently</button>
                  <p className="muted">Variants with order history cannot be deleted. Stock history keeps the SKU after deletion. Keep at least one variant.</p>
                  <p className="muted">
                    {v.onHand} on hand · {v.reserved} reserved ·{" "}
                    {v.onHand - v.reserved} available
                  </p>
                  <ActionForm
                    submit={(f) =>
                      mutate(
                        `/api/admin/variants/${v.id}`,
                        {
                          price: get(f, "price"),
                          active: f.get("active") === "on",
                          ...(v.hasOrderHistory ? {} : { size: get(f,"size"), color: get(f,"color"), type: get(f,"type") }),
                        },
                        "PATCH",
                      )
                    }
                  >
                    <fieldset disabled={v.hasOrderHistory}>
                      <p className="muted">{v.hasOrderHistory ? "Size, color and type are locked because this variant has order history." : "Edit options before this variant has orders. SKU and stock stay unchanged."}</p>
                      <div className="form-grid">
                        <label>Size<select name="size" aria-label="Size" defaultValue={v.size}>{[...new Set([...options.sizes,v.size])].filter(size => p.sellingType !== "BATCH" || size !== "STANDARD").map(size => <option key={size} value={size}>{size === "STANDARD" ? "No size" : size}</option>)}</select></label>
                        <label>Color<input name="color" defaultValue={v.color === "STANDARD" ? "" : v.color} maxLength={160}/></label>
                        <label>Type<input name="type" defaultValue={v.type === "STANDARD" ? "" : v.type} maxLength={160}/></label>
                      </div>
                    </fieldset>
                    <div className="form-grid">
                      <Field
                        label="Price (IDR)"
                        name="price"
                        type="number"
                        value={v.price}
                        min={1}
                        required
                      />
                      <label className="check-label">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={v.active}
                        />{" "}
                        Active variant
                      </label>
                    </div>
                    <button className="button-secondary">Save variant</button>
                  </ActionForm>
                  {p.sellingType === "CONTINUOUS" && (
                    <ActionForm
                      submit={(f) =>
                        mutate(`/api/admin/variants/${v.id}/stock`, {
                          onHand: Number(get(f, "onHand")),
                          reason: get(f, "reason"),
                        })
                      }
                    >
                      <div className="form-grid">
                        <Field
                          label="New physical stock"
                          name="onHand"
                          type="number"
                          value={v.onHand}
                          min={v.reserved}
                          required
                        />
                        <Field
                          label="Adjustment reason"
                          name="reason"
                          required
                        />
                      </div>
                      <button className="button-secondary">Adjust stock</button>
                    </ActionForm>
                  )}
                </section>
              ))}
              <details className="panel form-section">
                <summary>Add another variant</summary>
                <ActionForm
                  submit={async (f) => {
                    const r = await mutate(
                      `/api/admin/products/${id}/variants`,
                      variant(f),
                    );
                    report("Variant saved. SKU: " + r.variant.sku);
                  }}
                >
                  <VariantInputs
                    options={options}
                    sellingType={p.sellingType}
                  />
                  <button className="button-primary">Add variant</button>
                </ActionForm>
              </details>
              <button
                className="text-link"
                onClick={() =>
                  void api(`/api/admin/products/${id}/inventory`)
                    .then((r) => setHistory(r.movements))
                    .catch((e) => report(e.message))
                }
              >
                View stock history
              </button>
              {history && (
                <section className="panel form-section">
                  <h2>Stock history</h2>
                  {!history.length && <p>No stock movements yet.</p>}
                  {history.map((m) => (
                    <p key={m.id}>
                      {date(m.createdAt)} · {m.variant?.sku ?? m.variantSku} · {m.reason} · on
                      hand {m.onHandDelta}, reserved {m.reservedDelta}
                    </p>
                  ))}
                  <button onClick={() => setHistory(null)}>
                    Close history
                  </button>
                </section>
              )}
            </>
          )}
        </>
      )}
    </State>
  );
}
const localInput = (d: string) => {
  const value = new Date(d);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function BatchEditor({ id }: { id?: string }) {
  const { api } = useStore(),
    base = "/" + useParams().adminPath,
    router = useRouter();
  const { data, loading, error, reload } = useData(
    id ? `/api/admin/batches/${id}` : null,
  );
  const { data: products } = useData(
      !id ? "/api/admin/products?type=BATCH&pageSize=100" : null,
    ),
    [productId, setProductId] = useState(""),
    [productSearch, setProductSearch] = useState("");
  const { data: searched } = useData(
    !id && productSearch
      ? "/api/admin/products?type=BATCH&pageSize=100&q=" +
          encodeURIComponent(productSearch)
      : null,
  );
  const b = data?.batch;
  const p = b?.product;
  const editable = !b || ["DRAFT", "OPEN"].includes(b.status);
  const mutate = async (url: string, body: unknown, method = "POST") => {
    const r = await api(url, { method, body: JSON.stringify(body) });
    await reload();
    return r;
  };
  return (
    <State loading={!!id && loading} error={error}>
      <Link className="text-link" href={base + "/batches"}>
        ‹ Batch orders
      </Link>
      {(!id || b) && (
        <>
          <ActionForm
            key={b?.updatedAt || "new"}
            submit={async (f) => {
              const fields = {
                announcement: get(f, "announcement"),
                productionWeeks: Number(get(f, "weeks")),
                status: get(f, "status"),
                ...(editable
                  ? {
                      opensAt: new Date(get(f, "opensAt")).toISOString(),
                      closesAt: new Date(get(f, "closesAt")).toISOString(),
                    }
                  : {}),
              };
              if (id) await mutate(`/api/admin/batches/${id}`, fields, "PATCH");
              else {
                const r = await mutate("/api/admin/batches", {
                  ...fields,
                  productId: productId || products?.products[0]?.id,
                  name: get(f, "name"),
                });
                router.replace(base + "/batches/" + r.batch.id);
              }
            }}
          >
            <section className="panel form-section">
              <h2>Product details</h2>
              {!id ? (
                <>
                  <label>
                    Find batch product
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search the catalog"
                    />
                  </label>
                  <label>
                    Product
                    <select
                      aria-label="Product"
                      required
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    >
                      <option value="">Choose product</option>
                      {(searched?.products || products?.products || []).map(
                        (p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <Field label="Batch name" name="name" required />
                </>
              ) : (
                <>
                  <h3>
                    {p.name} · {b.name}
                  </h3>
                  <p className="muted">
                    Prices follow the product variants. Existing orders retain
                    their charged prices.
                  </p>
                </>
              )}
            </section>
            <section className="panel form-section">
              <h2>Order window</h2>
              <div className="form-grid">
                {editable ? (
                  <>
                    <Field
                      label="Opens at (local time)"
                      name="opensAt"
                      type="datetime-local"
                      value={b ? localInput(b.opensAt) : undefined}
                      required
                    />
                    <Field
                      label="Closes at (local time)"
                      name="closesAt"
                      type="datetime-local"
                      value={b ? localInput(b.closesAt) : undefined}
                      required
                    />
                  </>
                ) : (
                  <p>
                    {date(b.opensAt)} – {date(b.closesAt)}
                  </p>
                )}
                <Field
                  label="Estimated production (weeks)"
                  name="weeks"
                  type="number"
                  value={b?.productionWeeks || 4}
                  min={1}
                  required
                />
                <label>
                  Status
                  <select
                    name="status"
                    aria-label="Status"
                    defaultValue={b?.status || "DRAFT"}
                  >
                    {(id
                      ? [
                          "DRAFT",
                          "OPEN",
                          "CLOSED",
                          "IN_PRODUCTION",
                          "READY",
                          "COMPLETED",
                          "CANCELLED",
                        ]
                      : ["DRAFT", "OPEN"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="panel form-section">
              <h2>Announcement</h2>
              <label>
                Announcement message
                <textarea
                  name="announcement"
                  rows={4}
                  defaultValue={b?.announcement}
                  maxLength={2000}
                />
              </label>
            </section>
            <button className="button-primary">
              {id ? "Save batch" : "Create batch order"}
            </button>
          </ActionForm>
          {b && ["CLOSED", "IN_PRODUCTION", "READY"].includes(b.status) && (
            <ActionForm
              submit={(f) =>
                mutate(`/api/admin/batches/${id}/receive`, {
                  items: p.variants
                    .map((v: any) => ({
                      variantId: v.id,
                      quantity: Number(get(f, v.id)),
                    }))
                    .filter((v: any) => v.quantity > 0),
                  reason: get(f, "reason"),
                })
              }
            >
              <section className="panel form-section">
                <h2>Receive production stock</h2>
                <p>
                  Record actual delivered quantities. Paid and deposit-paid
                  orders are allocated automatically.
                </p>
                <div className="form-grid">
                  {p.variants.map((v: any) => (
                    <Field
                      key={v.id}
                      label={`${v.size} / ${v.color} · ${v.sku}`}
                      name={v.id}
                      type="number"
                      min={0}
                      value={0}
                    />
                  ))}
                  <Field
                    label="Delivery reference / reason"
                    name="reason"
                    required
                  />
                </div>
                <button className="button-primary">Record receipt</button>
              </section>
            </ActionForm>
          )}
        </>
      )}
    </State>
  );
}
export function PaymentSettings() {
  const { api } = useStore(),
    { data, loading, error, reload } = useData("/api/admin/payment-methods"),
    [type, setType] = useState("QRIS");
  const mutate = async (url: string, body: unknown, method = "POST") => {
    await api(url, { method, body: JSON.stringify(body) });
    await reload();
  };
  return (
    <State loading={loading} error={error} retry={reload}>
      <ActionForm
        submit={(f) =>
          mutate("/api/admin/payment-methods", {
            name: get(f, "name"),
            type,
            instructions: get(f, "instructions"),
            qrImageKey: get(f, "qrImageKey") || null,
            bankName: get(f, "bankName") || null,
            accountName: get(f, "accountName") || null,
            accountNumber: get(f, "accountNumber") || null,
          })
        }
      >
        <section className="panel form-section">
          <h2>Add payment method</h2>
          <p className="muted">
            Disable an old method and add a new one when official account
            details change. Submitted proofs keep their original details.
          </p>
          <div className="form-grid">
            <Field label="Display name" name="name" required />
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>QRIS</option>
                <option>BANK_TRANSFER</option>
              </select>
            </label>
            {type === "QRIS" ? (
              <Field
                label="QRIS image URL (HTTPS)"
                name="qrImageKey"
                type="url"
                required
              />
            ) : (
              <>
                <Field label="Bank" name="bankName" required />
                <Field label="Account name" name="accountName" required />
                <Field label="Account number" name="accountNumber" required />
              </>
            )}
          </div>
          <label>
            Instructions
            <textarea name="instructions" rows={3} />
          </label>
          <button className="button-primary">Add payment method</button>
        </section>
      </ActionForm>
      {data?.methods.map((m: any) => (
        <section className="panel form-section" key={m.id}>
          <div className="section-title">
            <h2>{m.name}</h2>
            <Badge value={m.enabled ? "PUBLISHED" : "ARCHIVED"} />
          </div>
          <p>
            {m.type === "QRIS"
              ? "QRIS"
              : `${m.bankName} · ${m.accountNumber} · ${m.accountName}`}
          </p>
          <ActionForm
            submit={() =>
              mutate(
                `/api/admin/payment-methods/${m.id}`,
                { enabled: !m.enabled },
                "PATCH",
              )
            }
          >
            <button className="button-secondary">
              {m.enabled ? "Disable" : "Enable"}
            </button>
          </ActionForm>
        </section>
      ))}
    </State>
  );
}
