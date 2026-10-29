"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState, type ReactNode, type FormEvent } from "react";
import { useStore } from "./store-provider";
import { Avatar, Icon, Notice, State } from "./ui";
const sections = [
  ["", "Dashboard", "dashboard"],
  ["orders", "Orders", "orders"],
  ["payments", "Payment Verification", "payment"],
  ["products", "Products", "box"],
  ["batches", "Batch Orders", "box"],
  ["customers", "Customers", "users"],
  ["settings", "Payment Settings", "settings"],
];
export default function AdminConsole({ children }: { children: ReactNode }) {
  const { user, ready, csrf, api, refreshAuth, report } = useStore(),
    params = useParams(),
    pathname = usePathname();
  const base = "/" + params.adminPath;
  const [section, record] = pathname.slice(base.length + 1).split("/");
  const mobileTitle =
    record === "new"
      ? section === "products"
        ? "Add product"
        : "Create batch order"
      : section === "payments" && record
        ? "Payment review"
        : (sections.find(([path]) => path === section)?.[1] ?? "Dashboard");
  const [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      await refreshAuth();
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nav = (mobile = false) =>
    (mobile
      ? sections.filter((s) =>
          ["", "orders", "products", "customers"].includes(s[0]),
        )
      : sections
    ).map(([path, label, icon]) => (
      <Link
        onClick={() => setMenu(false)}
        key={path}
        className={
          pathname === base + (path ? "/" + path : "") ||
          (!!path && pathname.startsWith(base + "/" + path + "/"))
            ? "active"
            : ""
        }
        href={base + (path ? "/" + path : "")}
      >
        <Icon name={icon} />
        <span>{label}</span>
      </Link>
    ));
  return (
    <div className={`admin-shell ${record ? "admin-detail" : ""}`}>
      <header className="admin-header">
        <Link className="wordmark" href={base}>
          EKRAF<span>BEM MIPA UGM</span>
        </Link>
        <small className="admin-label">ADMIN</small>
        <div className="header-actions">
          {user?.role === "ADMIN" && (
            <>
              <button
                className="admin-menu"
                aria-label="Admin menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="menu" />
              </button>
              <button
                className="small"
                onClick={() =>
                  void api("/api/auth/logout", { method: "POST" })
                    .then(refreshAuth)
                    .catch((e) => report(e.message))
                }
              >
                Sign out
              </button>
              <Avatar name={user.name} />
            </>
          )}
        </div>
      </header>
      <Notice />
      {!ready ? (
        <State loading />
      ) : user?.role !== "ADMIN" ? (
        <main className="admin-login panel">
          <small>EKRAF ADMINISTRATION</small>
          <h1>Admin sign in</h1>
          <p className="muted">
            Use your administrator account to manage the store.
          </p>
          <form onSubmit={login}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button
              className="button-primary full-width"
              disabled={busy || !csrf}
            >
              Sign in to admin
            </button>
          </form>
        </main>
      ) : (
        <>
          {section && (
            <header className="mobile-routebar">
              <Link href={record ? `${base}/${section}` : base}>‹ Back</Link>
              <strong>{mobileTitle}</strong>
              <button
                aria-label="Admin menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="menu" />
              </button>
            </header>
          )}
          <aside className={`admin-sidebar ${menu ? "is-open" : ""}`}>
            <nav aria-label="Administration">{nav()}</nav>
            <small>EKRAF Store Admin · {new Date().getFullYear()}</small>
          </aside>
          <main className="admin-main">{children}</main>
          <nav
            className="mobile-tabs admin-bottom"
            aria-label="Admin navigation"
          >
            {nav(true)}
          </nav>
        </>
      )}
    </div>
  );
}
