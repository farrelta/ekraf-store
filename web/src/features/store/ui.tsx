"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useStore } from "./store-provider";
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></>,
    email: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/></>,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2 11h11l2-8H6M9 20h.01M17 20h.01" />
      </>
    ),
    arrow: <path d="m9 5-7 7 7 7M2 12h20" />,
    box: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M7.5 4.5l9 5" />
      </>
    ),
    orders: (
      <>
        <path d="M6 3h12v19l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6" />
      </>
    ),
    dashboard: (
      <>
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2" />
      </>
    ),
    bell: (
      <>
        <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    check: <path d="m4 12 5 5L20 6" />,
    upload: <path d="M12 16V2m-5 5 5-5 5 5M4 14v7h16v-7" />,
    external: <path d="M7 17 19 5M7 5h12v12" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    payment: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.box}
    </svg>
  );
}
export function Notice() {
  const { notice, report } = useStore();
  return notice ? (
    <div className="notice" role="status" aria-live="polite">
      <span>{notice}</span>
      <button aria-label="Dismiss notification" onClick={() => report("")}>
        ×
      </button>
    </div>
  ) : null;
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function State({
  loading,
  error,
  empty,
  children,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  children?: ReactNode;
  retry?: () => void;
}) {
  if (loading)
    return (
      <div className="empty" role="status">
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="empty" role="alert">
        <p>{error}</p>
        {retry && (
          <button className="button-secondary" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  if (empty) return <div className="empty">No results yet.</div>;
  return <>{children}</>;
}
export function Pager({
  value,
  onPage,
}: {
  value?: { page: number; pageSize: number; total: number; pageCount: number };
  onPage: (page: number) => void;
}) {
  if (!value) return null;
  const { page, pageSize, total, pageCount } = value;
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0 results"}
      </span>
      <div>
        <button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        <span>
          {page} / {Math.max(1, pageCount)}
        </span>
        <button
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
export function Stats({
  items,
}: {
  items: { label: string; value: ReactNode; note?: ReactNode }[];
}) {
  return (
    <div className="stat-grid">
      {items.map((i) => (
        <div className="stat-card" key={i.label}>
          <span>{i.label}</span>
          <strong>{i.value}</strong>
          {i.note && <small>{i.note}</small>}
        </div>
      ))}
    </div>
  );
}
export function StoreLayout({
  children,
  title,
  simple = false,
}: {
  children: ReactNode;
  title?: string;
  simple?: boolean;
}) {
  const { cart, user, ready, api, refreshAuth, report } = useStore();
  const pathname = usePathname(),
    router = useRouter();
  return (
    <div className={`store-shell ${simple ? "simple-page" : ""}`}>
      <header className="store-header">
        <div className="store-container header-inner">
          <div className="mobile-back">
            {pathname !== "/" && (
              <button aria-label="Go back" onClick={() => router.back()}>
                <Icon name="arrow" />
              </button>
            )}
          </div>
          <Link className="wordmark" href="/">
            EKRAF<span>BEM KM MIPA UGM</span>
          </Link>
          <nav className="desktop-nav">
            <Link className={pathname === "/" ? "active" : ""} href="/">
              Shop
            </Link>
            <Link
              className={pathname === "/about" ? "active" : ""}
              href="/about"
            >
              About us
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              className="cart-icon"
              href="/cart"
              aria-label={`Bag, ${cart.reduce((n, l) => n + l.quantity, 0)} items`}
            >
              <Icon name="cart" />
              {cart.length > 0 && (
                <span>{cart.reduce((n, l) => n + l.quantity, 0)}</span>
              )}
            </Link>
            <Link className="button-secondary desktop-only" href="/orders">
              My Orders
            </Link>
            {ready && user ? (
              <button
                className="desktop-only small"
                onClick={() =>
                  void api("/api/auth/logout", { method: "POST" })
                    .then(refreshAuth)
                    .catch((e) => report(e.message))
                }
              >
                Sign out
              </button>
            ) : (
              <Link className="desktop-only small" href="/sign-in">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <Notice />
      <main>
        {title && (
          <div className="store-container page-heading">
            <h1>{title}</h1>
          </div>
        )}
        {children}
      </main>
      <div className="campus-doodle" aria-hidden="true" />
      <footer className="store-footer">
        <div className="store-container footer-inner">
          <Link className="wordmark" href="/">
            EKRAF
          </Link>
          <span>Official store of EKRAF BEM MIPA UGM</span>
          <nav>
            <Link href="/">Shop</Link>
            <Link href="/about">About</Link>
          </nav>
          <small>© {new Date().getFullYear()} EKRAF BEM MIPA UGM</small>
        </div>
      </footer>
      {!simple && (
        <nav className="mobile-tabs" aria-label="Store navigation">
          {[
            ["/", "Shop", "box"],
            ["/cart", "Cart", "cart"],
            ["/orders", "My Orders", "users"],
          ].map(([href, label, icon]) => (
            <Link
              key={href}
              className={
                pathname === href || (href !== "/" && pathname.startsWith(href))
                  ? "active"
                  : ""
              }
              href={href}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
export function DateFilters({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (key: "from" | "to", value: string) => void;
}) {
  return (
    <div className="date-filters">
      <label>
        From
        <input
          type="date"
          value={from}
          onChange={(e) => onChange("from", e.target.value)}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={to}
          onChange={(e) => onChange("to", e.target.value)}
        />
      </label>
    </div>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(/\s+/)
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
