"use client";
import Link from "next/link";
import {
  useParams,
  useSearchParams,
  useRouter,
  usePathname,
} from "next/navigation";
import { type ReactNode } from "react";
import { useStore, useData } from "./store-provider";
import { ProductEditor, BatchEditor, PaymentSettings } from "./admin-forms";
import { OrderCard } from "./order-card";
import { Avatar, Badge, DateFilters, Icon, Pager, State, Stats } from "./ui";
import { money, date } from "./types";
const labels: Record<string, string> = {
  dashboard: "Dashboard",
  orders: "Orders",
  payments: "Payment verification",
  products: "Products",
  batches: "Batch orders",
  customers: "Customers",
  settings: "Payment settings",
};
const descriptions: Record<string, string> = {
  orders:
    "Track every merchandise and batch order from payment to campus pickup.",
  payments: "Review transfer receipts before an order moves into processing.",
  products: "Manage your merchandise and batch order listings.",
  batches: "Manage production windows and keep students informed.",
  customers: "Everyone who has registered with EKRAF.",
  settings: "Manage the official QRIS and bank transfer details.",
};
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} data-label={headers[j]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          No matching records. Try changing the filters.
        </div>
      )}
    </div>
  );
}
function Chart({ series }: { series: { date: string; amount: string }[] }) {
  const max = Math.max(1, ...series.map((s) => Number(s.amount))),
    points = series
      .map(
        (s, i) =>
          `${44 + (i / Math.max(1, series.length - 1)) * 650},${170 - (Number(s.amount) / max) * 140}`,
      )
      .join(" ");
  return (
    <div className="sales-chart">
      <svg
        viewBox="0 0 720 205"
        role="img"
        aria-label="Daily verified payments in IDR"
      >
        <title>Daily verified payments in IDR</title>
        {[0, 0.5, 1].map((v, i) => (
          <g key={i}>
            <line
              x1="44"
              x2="700"
              y1={170 - v * 140}
              y2={170 - v * 140}
              stroke="#f0f0f1"
            />
            <text x="0" y={174 - v * 140}>
              {v === 0 ? "Rp 0" : money(max * v)}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="#00c853"
          strokeWidth="2.5"
        />
        {series
          .filter(
            (_, i) =>
              i === 0 ||
              i === series.length - 1 ||
              i === Math.floor(series.length / 2),
          )
          .map((s) => (
            <text
              key={s.date}
              x={
                44 + (series.indexOf(s) / Math.max(1, series.length - 1)) * 650
              }
              y="198"
              textAnchor="middle"
            >
              {s.date.slice(5)}
            </text>
          ))}
      </svg>
      <details>
        <summary>View daily amounts</summary>
        {series.map((s) => (
          <div className="summary-row" key={s.date}>
            <span>{s.date}</span>
            <span>{money(s.amount)}</span>
          </div>
        ))}
      </details>
    </div>
  );
}
function Dashboard() {
  const base = "/" + useParams().adminPath,
    search = useSearchParams(),
    router = useRouter(),
    { user } = useStore(),
    {
      data: d,
      loading,
      error,
      reload,
    } = useData("/api/admin/dashboard?" + search);
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(search.toString());
    q.set(k, v);
    router.replace(base + "?" + q, { scroll: false });
  };
  const change =
    d?.changePercent == null
      ? "No previous-period baseline"
      : `${d.changePercent > 0 ? "+" : ""}${d.changePercent}% vs previous period`;
  return (
    <>
      <div className="admin-title">
        <div>
          <h1>Hello, {user?.name.split(" ")[0]}</h1>
          <p>Here’s what’s happening in your store.</p>
        </div>
        <DateFilters
          from={search.get("from") || d?.range.from || ""}
          to={search.get("to") || d?.range.to || ""}
          onChange={set}
        />
      </div>
      <State loading={loading} error={error} retry={reload}>
        {d && (
          <>
            <Stats
              items={[
                {
                  label: "Money received",
                  value: money(d.received),
                  note: change,
                },
                {
                  label: "Orders",
                  value: d.orders,
                  note: "Created in this period",
                },
                {
                  label: "Awaiting verification",
                  value: d.pending,
                  note: "Payments to review",
                },
                {
                  label: "Active batch orders",
                  value: d.activeBatches,
                  note: money(d.outstanding) + " outstanding in period",
                },
              ]}
            />
            <div className="dashboard-grid">
              <section className="panel chart-panel">
                <div className="section-title">
                  <div>
                    <h2>Sales overview</h2>
                    <p>
                      {d.range.from} – {d.range.to} · Asia/Jakarta
                    </p>
                  </div>
                  <span className="green small">{change}</span>
                </div>
                <Chart series={d.series} />
              </section>
              <section className="panel action-panel">
                <h2>Action needed</h2>
                {[
                  [
                    `${d.pending} payments to verify`,
                    "Review customer payment proofs",
                    "payments",
                  ],
                  [
                    `${d.closingCount} batches closing soon`,
                    "Review current order windows",
                    "batches",
                  ],
                  [
                    `${d.lowStock} low-stock products`,
                    "Available continuous stock of 1–5 units",
                    "products?stock=low",
                  ],
                  [
                    money(d.outstanding) + " outstanding",
                    "Batch balances for orders in this period",
                    "orders?payment=PARTIALLY_PAID",
                  ],
                ].map(([title, copy, url]) => (
                  <Link key={url} href={base + "/" + url}>
                    <Icon name="clock" />
                    <div>
                      <strong>{title}</strong>
                      <small>{copy}</small>
                    </div>
                    <span>View</span>
                  </Link>
                ))}
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent orders</h2>
                  <p>Latest orders in the selected period</p>
                </div>
                <Link className="green small" href={base + "/orders"}>
                  View all orders
                </Link>
              </div>
              <Table
                headers={["Order", "Customer", "Amount", "Payment", ""]}
                rows={d.recentOrders.map((o: any) => [
                  <Link href={base + "/orders/" + o.id}>{o.id}</Link>,
                  o.customerName,
                  money(o.total),
                  <Badge value={o.paymentStatus} />,
                  <Link
                    aria-label={"Open order " + o.id}
                    href={base + "/orders/" + o.id}
                  >
                    ›
                  </Link>,
                ])}
              />
            </section>
          </>
        )}
      </State>
    </>
  );
}
export function AdminPage({ section, id }: { section: string; id?: string }) {
  const base = "/" + useParams().adminPath,
    search = useSearchParams(),
    router = useRouter(),
    pathname = usePathname(),
    { api, report } = useStore();
  const detail = !!id,
    newForm = id === "new";
  const endpoint = section === "payments" ? "payment-submissions" : section;
  const url =
    section === "dashboard" ||
    section === "settings" ||
    newForm ||
    (detail && ["products", "batches"].includes(section))
      ? null
      : `/api/admin/${endpoint}${id ? "/" + id : ""}?${search}`;
  const { data: d, loading, error, reload } = useData(url);
  const {
    data: customerOrders,
    loading: col,
    error: coe,
  } = useData(
    section === "customers" && id
      ? "/api/admin/orders?userId=" +
          id +
          "&page=" +
          (search.get("page") || "1")
      : null,
  );
  const change = (k: string, v: string) => {
    const q = new URLSearchParams(search.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    if (k !== "page") q.delete("page");
    router.replace(pathname + "?" + q, { scroll: false });
  };
  const select = (key: string, label: string, values: string[][]) => (
    <label className="filter-label">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={search.get(key) || ""}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">{label}</option>
        {values.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  const orderRows = (orders: any[]) =>
    orders.map((o) => [
      <Link className="row-primary" href={base + "/orders/" + o.id}>
        {o.id}
      </Link>,
      o.customerName,
      o.items.map((i: any) => i.itemDescription.split(" · ")[0]).join(", "),
      money(o.total),
      <Badge value={o.paymentStatus} />,
      <Badge value={o.pickupStatus} />,
      date(o.createdAt),
      <Link aria-label={"Open order " + o.id} href={base + "/orders/" + o.id}>
        ›
      </Link>,
    ]);
  const summary = d?.summary;
  return (
    <>
      <nav className="admin-breadcrumb">
        Admin /{" "}
        <Link href={base + (section === "dashboard" ? "" : "/" + section)}>
          {labels[section]}
        </Link>
        {detail && " / " + (newForm ? "Create" : "Details")}
      </nav>
      {section === "dashboard" ? (
        <Dashboard />
      ) : (
        <>
          <div className="admin-title">
            <div>
              <h1>
                {newForm
                  ? section === "products"
                    ? "Add product"
                    : "Create batch order"
                  : detail
                    ? section === "payments"
                      ? "Payment review"
                      : labels[section] + " details"
                    : labels[section]}
              </h1>
              <p>{descriptions[section]}</p>
            </div>
            {!detail && ["products", "batches"].includes(section) && (
              <Link
                className="button-primary"
                href={base + "/" + section + "/new"}
              >
                +{" "}
                {section === "products" ? "Add product" : "Create batch order"}
              </Link>
            )}
          </div>
          {section === "settings" ? (
            <PaymentSettings />
          ) : section === "products" && detail ? (
            <ProductEditor id={newForm ? undefined : id} />
          ) : section === "batches" && detail ? (
            <BatchEditor id={newForm ? undefined : id} />
          ) : (
            <State loading={loading} error={error} retry={reload}>
              {detail ? (
                <>
                  {section === "orders" && d?.order && (
                    <OrderCard
                      order={d.order}
                      api={api}
                      methods={[]}
                      admin
                      onChange={reload}
                      report={report}
                    />
                  )}
                  {section === "payments" && d?.order && (
                    <OrderCard
                      order={d.order}
                      submissionId={id}
                      api={api}
                      methods={[]}
                      admin
                      onChange={reload}
                      report={report}
                    />
                  )}
                  {section === "customers" && d?.customer && (
                    <>
                      <div className="panel form-section customer-profile">
                        <Avatar name={d.customer.name} />
                        <h2>{d.customer.name}</h2>
                        <p>{d.customer.email}</p>
                        <p>Joined {date(d.customer.createdAt)}</p>
                      </div>
                      <Stats
                        items={[
                          { label: "Orders", value: d.customer.orders },
                          {
                            label: "Confirmed orders",
                            value: d.customer.paidOrders,
                          },
                          {
                            label: "Verified spending",
                            value: money(d.customer.totalSpent),
                          },
                          {
                            label: "Last order",
                            value: d.customer.lastOrder
                              ? date(d.customer.lastOrder)
                              : "—",
                          },
                        ]}
                      />
                      <State loading={col} error={coe}>
                        <div className="panel">
                          <Table
                            headers={[
                              "Order",
                              "Customer",
                              "Items",
                              "Total",
                              "Payment",
                              "Pickup",
                              "Date",
                              "",
                            ]}
                            rows={orderRows(customerOrders?.orders || [])}
                          />
                          <Pager
                            value={customerOrders?.pagination}
                            onPage={(p) => change("page", String(p))}
                          />
                        </div>
                      </State>
                    </>
                  )}
                </>
              ) : (
                <>
                  {summary && (
                    <Stats
                      items={
                        section === "products"
                          ? [
                              { label: "All products", value: summary.total },
                              { label: "Live", value: summary.published },
                              { label: "Drafts", value: summary.drafts },
                              {
                                label: "Batch closing soon",
                                value: summary.closingSoon,
                              },
                            ]
                          : section === "orders"
                            ? [
                                { label: "All orders", value: summary.total },
                                {
                                  label: "Awaiting verification",
                                  value: summary.pending,
                                },
                                {
                                  label: "Processing",
                                  value: summary.processing,
                                },
                                {
                                  label: "Ready for pickup",
                                  value: summary.ready,
                                },
                              ]
                            : section === "payments"
                              ? [
                                  { label: "Pending", value: summary.pending },
                                  {
                                    label: "Approved",
                                    value: summary.approved,
                                  },
                                  {
                                    label: "Rejected",
                                    value: summary.rejected,
                                  },
                                ]
                              : section === "batches"
                                ? [
                                    { label: "Open", value: summary.open },
                                    {
                                      label: "Closing soon",
                                      value: summary.closingSoon,
                                    },
                                    {
                                      label: "Completed",
                                      value: summary.completed,
                                    },
                                  ]
                                : [
                                    {
                                      label: "Total customers",
                                      value: summary.total,
                                    },
                                    {
                                      label: "New this month",
                                      value: summary.newThisMonth,
                                    },
                                    {
                                      label: "Repeat customers",
                                      value: summary.repeat,
                                    },
                                    {
                                      label: "Average confirmed order",
                                      value: money(summary.averageOrder),
                                    },
                                  ]
                      }
                    />
                  )}
                  {section === "payments" && (
                    <div className="info-note">
                      Match the amount, account name, and transaction date
                      against the official account before approving.
                    </div>
                  )}
                  {section === "batches" &&
                    d?.batches.find((b: any) => b.status === "OPEN") &&
                    (() => {
                      const b = d.batches.find((b: any) => b.status === "OPEN");
                      return (
                        <div className="batch-overview">
                          <section className="panel form-section">
                            <div className="section-title">
                              <h2>
                                {b.product.name} · {b.name}
                              </h2>
                              <Badge value={b.status} />
                            </div>
                            <p className="muted">
                              Order window closes {date(b.closesAt)}
                            </p>
                            <div className="batch-metrics">
                              <div>
                                <small>ORDERS</small>
                                <strong>{b.stats.orders}</strong>
                              </div>
                              <div>
                                <small>DEADLINE</small>
                                <span>{date(b.closesAt)}</span>
                              </div>
                              <div>
                                <small>PRODUCTION</small>
                                <span>{b.productionWeeks} weeks</span>
                              </div>
                            </div>
                            <div className="button-row">
                              <Link
                                className="button-secondary"
                                href={"/batch-orders/" + b.id}
                              >
                                View storefront
                              </Link>
                              <Link
                                className="button-secondary"
                                href={base + "/batches/" + b.id}
                              >
                                Edit batch
                              </Link>
                            </div>
                          </section>
                          <section className="panel form-section">
                            <h2>Announcement preview</h2>
                            <p className="announcement-preview">
                              {b.announcement || "No announcement yet."}
                            </p>
                            <Link
                              className="green small"
                              href={base + "/batches/" + b.id}
                            >
                              Edit announcement ↗
                            </Link>
                          </section>
                        </div>
                      );
                    })()}
                  <div className="admin-filters">
                    <form
                      className="compact-search"
                      key={pathname}
                      onSubmit={(e) => {
                        e.preventDefault();
                        change(
                          "q",
                          String(new FormData(e.currentTarget).get("q") || ""),
                        );
                      }}
                    >
                      <Icon name="search" size={16} />
                      <input
                        name="q"
                        aria-label="Search records"
                        placeholder={
                          section === "customers"
                            ? "Search by name or email"
                            : section === "products"
                              ? "Search products"
                              : "Search order, customer or batch"
                        }
                        defaultValue={search.get("q") || ""}
                      />
                      <button className="sr-only">Search</button>
                    </form>
                    {section === "products" && (
                      <>
                        {select("type", "All types", [
                          ["CONTINUOUS", "Merchandise"],
                          ["BATCH", "Batch order"],
                        ])}
                        {select("status", "Any status", [
                          ["PUBLISHED", "Live"],
                          ["DRAFT", "Draft"],
                          ["ARCHIVED", "Archived"],
                        ])}
                        {select(
                          "category",
                          "All categories",
                          (d?.categories || []).map((c: string) => [c, c]),
                        )}
                        {select("sort", "Featured first", [
                          ["newest", "Newest"],
                          ["name", "Name"],
                          ["price_asc", "Price: low to high"],
                          ["price_desc", "Price: high to low"],
                        ])}
                        {select("stock", "All stock", [
                          ["low", "Low stock"],
                          ["sold_out", "Sold out"],
                        ])}
                      </>
                    )}
                    {section === "orders" && (
                      <>
                        {select("payment", "Any payment", [
                          ["PENDING", "Awaiting payment"],
                          ["PARTIALLY_PAID", "Deposit paid"],
                          ["PAID", "Paid"],
                          ["EXPIRED", "Expired"],
                          ["CANCELLED", "Cancelled"],
                        ])}
                        {select("pickup", "Any pickup", [
                          ["PENDING", "Pending"],
                          ["PROCESSING", "Processing"],
                          ["READY_FOR_PICKUP", "Ready for pickup"],
                          ["COMPLETED", "Collected"],
                          ["CANCELLED", "Cancelled"],
                        ])}
                        {select("awaiting", "All proofs", [
                          ["true", "Awaiting verification"],
                        ])}
                      </>
                    )}
                    {section === "payments" && (
                      <>
                        {select("status", "All submissions", [
                          ["SUBMITTED", "Pending"],
                          ["VERIFIED", "Approved"],
                          ["REJECTED", "Rejected"],
                        ])}
                        {select("phase", "All installments", [
                          ["INITIAL", "Initial"],
                          ["BALANCE", "Balance"],
                        ])}
                      </>
                    )}
                    {section === "customers" &&
                      select("segment", "All customers", [
                        ["repeat", "Repeat buyers"],
                        ["batch", "Batch buyers"],
                      ])}
                    {section === "batches" &&
                      select(
                        "status",
                        "All statuses",
                        [
                          "DRAFT",
                          "OPEN",
                          "CLOSED",
                          "IN_PRODUCTION",
                          "READY",
                          "COMPLETED",
                          "CANCELLED",
                        ].map((s) => [s, s.replaceAll("_", " ")]),
                      )}
                    <DateFilters
                      from={search.get("from") || d?.range?.from || ""}
                      to={search.get("to") || d?.range?.to || ""}
                      onChange={change}
                    />
                    {["products", "customers"].includes(section) && (
                      <a
                        className="button-secondary export-button"
                        href={`/api/admin/${section}/export?${search}`}
                      >
                        <Icon name="upload" size={15} />
                        Export CSV
                      </a>
                    )}
                  </div>
                  <section className="panel data-panel">
                    {section === "products" && (
                      <Table
                        headers={[
                          "Product",
                          "Type",
                          "Price",
                          "Inventory / deadline",
                          "Status",
                          "Updated",
                          "",
                        ]}
                        rows={(d?.products || []).map((p: any) => [
                          <Link
                            className="product-cell"
                            href={base + "/products/" + p.id}
                          >
                            {p.imageKey ? (
                              <img src={p.imageKey} alt="" />
                            ) : (
                              <span className="product-initials">
                                {p.name.slice(0, 3).toUpperCase()}
                              </span>
                            )}
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {p.category || "Uncategorized"} ·{" "}
                                {p.variants.length} variants
                                {p.featured ? " · Featured" : ""}
                              </small>
                            </div>
                          </Link>,
                          p.sellingType === "BATCH"
                            ? "Batch order"
                            : "Merchandise",
                          p.fromPrice ? money(p.fromPrice) : "—",
                          p.sellingType === "BATCH"
                            ? p.batches.find((b: any) => b.status === "OPEN")
                              ? date(
                                  p.batches.find(
                                    (b: any) => b.status === "OPEN",
                                  ).closesAt,
                                )
                              : "No open batch"
                            : p.availableStock === 0
                              ? "Sold out"
                              : `${p.availableStock} available`,
                          <Badge value={p.status} />,
                          date(p.updatedAt),
                          <Link
                            aria-label={"Edit " + p.name}
                            href={base + "/products/" + p.id}
                          >
                            ···
                          </Link>,
                        ])}
                      />
                    )}
                    {section === "orders" && (
                      <Table
                        headers={[
                          "Order",
                          "Customer",
                          "Items",
                          "Total",
                          "Payment",
                          "Pickup",
                          "Date",
                          "",
                        ]}
                        rows={orderRows(d?.orders || [])}
                      />
                    )}
                    {section === "payments" && (
                      <Table
                        headers={[
                          "Order",
                          "Customer",
                          "Method / phase",
                          "Amount",
                          "Submitted",
                          "Status",
                          "Review",
                        ]}
                        rows={(d?.submissions || []).map((s: any) => [
                          <Link href={base + "/orders/" + s.orderId}>
                            {s.orderId}
                          </Link>,
                          s.order.customerName,
                          <span>
                            {s.methodSnapshot.name}
                            <small>
                              {s.phase === "INITIAL"
                                ? "Initial payment"
                                : "Balance payment"}
                            </small>
                          </span>,
                          money(s.amount),
                          date(s.submittedAt),
                          <Badge value={s.status} />,
                          <Link
                            className={
                              s.status === "SUBMITTED"
                                ? "button-primary"
                                : "button-secondary"
                            }
                            href={base + "/payments/" + s.id}
                          >
                            {s.status === "SUBMITTED" ? "Review" : "View"}
                          </Link>,
                        ])}
                      />
                    )}
                    {section === "batches" && (
                      <Table
                        headers={[
                          "Product",
                          "Batch",
                          "Orders",
                          "Order value",
                          "Deadline",
                          "Status",
                          "Updated",
                          "",
                        ]}
                        rows={(d?.batches || []).map((b: any) => [
                          b.product.name,
                          <Link
                            className="row-primary"
                            href={base + "/batches/" + b.id}
                          >
                            {b.name}
                          </Link>,
                          b.stats.orders,
                          money(b.stats.value),
                          date(b.closesAt),
                          <Badge value={b.status} />,
                          date(b.updatedAt),
                          <Link href={base + "/batches/" + b.id}>›</Link>,
                        ])}
                      />
                    )}
                    {section === "customers" && (
                      <Table
                        headers={[
                          "Customer",
                          "Contact",
                          "Orders",
                          "Verified spending",
                          "Last order",
                          "Joined",
                          "",
                        ]}
                        rows={(d?.customers || []).map((c: any) => [
                          <Link
                            className="customer-cell"
                            href={base + "/customers/" + c.id}
                          >
                            <Avatar name={c.name} />
                            <strong>{c.name}</strong>
                          </Link>,
                          c.email,
                          c.orders,
                          money(c.totalSpent),
                          c.lastOrder ? date(c.lastOrder) : "—",
                          date(c.createdAt),
                          <Link href={base + "/customers/" + c.id}>›</Link>,
                        ])}
                      />
                    )}
                    <Pager
                      value={d?.pagination}
                      onPage={(page) => change("page", String(page))}
                    />
                  </section>
                </>
              )}
            </State>
          )}
        </>
      )}
    </>
  );
}
