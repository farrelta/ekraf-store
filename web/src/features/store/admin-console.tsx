"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { useStore } from "./store-provider";
import { FormFeedback, FieldError } from "./form-feedback";
import { Icon, Notice, State, TestEnvironmentBanner, PasswordInput, SessionFeedback } from "./ui";
const sections = [
  ["", "Dashboard", "dashboard"],
  ["orders", "Orders", "orders"],
  ["payments", "Payment Verification", "payment"],
  ["products", "Products", "box"],
  ["batches", "Batch Orders", "box"],
  ["customers", "Customers", "users"],
  ["announcements", "Announcements", "orders"],
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
    [loginError,setLoginError]=useState<unknown>(null);
  const loginRef=useRef<HTMLFormElement>(null), loginInFlight=useRef(false);
  const bottomNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const revealActive = () => {
      if (media.matches) bottomNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    };
    revealActive();
    media.addEventListener("change", revealActive);
    return () => media.removeEventListener("change", revealActive);
  }, [pathname, user?.role]);
  const signOut = () => void api("/api/auth/logout", { method: "POST" }).then(refreshAuth).catch(e => report(e.message));
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(loginInFlight.current)return;
    loginInFlight.current=true;
    setLoginError(null);
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
      setLoginError(e);
    } finally {
      loginInFlight.current=false;
      setBusy(false);
    }
  }
  const isActive = (path: string) => pathname === base + (path ? "/" + path : "") || (!!path && pathname.startsWith(base + "/" + path + "/"));
  const nav = () => sections.map(([path, label, icon]) => (
      <Link
        key={path}
        className={isActive(path) ? "active" : ""}
        aria-current={isActive(path) ? "page" : undefined}
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
          EKRAF<span>BEM KM MIPA UGM</span>
        </Link>
        <small className="admin-label">ADMIN</small>
        <div className="header-actions">
          {user?.role === "ADMIN" && (
            <>
              <button
                className="small"
                onClick={signOut}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <Notice />
      <SessionFeedback />
      {!ready ? (
        <State loading />
      ) : user?.role !== "ADMIN" ? (
        <main className="admin-login panel">
          <TestEnvironmentBanner />
          <small>EKRAF ADMINISTRATION</small>
          <h1>Admin sign in</h1>
          <p className="muted">
            Use your administrator account to manage the store.
          </p>
          <form onSubmit={login} ref={loginRef} aria-busy={busy}><FormFeedback error={loginError} formRef={loginRef}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                maxLength={254}
                required
              /><FieldError name="email"/>
            </label>
            <label>
              Password
              <PasswordInput
                name="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            <FieldError name="password"/></label>
            <button
              className="button-primary full-width"
              disabled={busy || !csrf}
            >
              Sign in to admin
            </button>
          </FormFeedback></form>
        </main>
      ) : (
        <>
          {section && (
            <header className="mobile-routebar">
              <Link href={record ? `${base}/${section}` : base}>‹ Back</Link>
              <strong>{mobileTitle}</strong>
              <button type="button" onClick={signOut}>Sign out</button>
            </header>
          )}
          <aside className="admin-sidebar">
            <nav aria-label="Administration">{nav()}</nav>
            <small>EKRAF Store Admin · {new Date().getFullYear()}</small>
          </aside>
          <main className="admin-main"><TestEnvironmentBanner />{children}</main>
          <nav
            className="mobile-tabs admin-bottom"
            aria-label="Admin navigation"
            ref={bottomNavRef}
          >
            {nav()}
          </nav>
        </>
      )}
    </div>
  );
}
