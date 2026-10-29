"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminPanel } from "./admin-panel";
import type { Api, User } from "./types";

export default function AdminConsole() {
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const report = useCallback((message: string) => setNotice(message), []);
  const api: Api = useCallback(async (url, options = {}) => {
    const headers = new Headers(options.headers);
    if (typeof options.body === "string") headers.set("Content-Type", "application/json");
    if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrf);
    const response = await fetch(url, { ...options, headers, credentials: "include", cache: "no-store" });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }, [csrf]);
  useEffect(() => {
    let active = true;
    void Promise.all([fetch("/api/csrf", { credentials: "include", cache: "no-store" }), fetch("/api/auth/me", { credentials: "include", cache: "no-store" })]).then(async ([c,m]) => {
      if (!c.ok || !m.ok) throw new Error("Could not load the admin session");
      const [token, account] = await Promise.all([c.json(),m.json()]);
      if (active) { setCsrf(token.token); setUser(account.user?.role === "ADMIN" ? account.user : null); setReady(true); }
    }).catch(e => { if (active) report(e.message); });
    return () => { active = false; };
  }, [report]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  const refreshShop = useCallback(async () => {}, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true);
    try {
      const result = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      const token = await api("/api/csrf"); setCsrf(token.token); setUser(result.user); form.reset();
    } catch (e) { report((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="app-shell"><header className="topbar"><div className="brand">EKRAF<small>ADMINISTRATION</small></div>{user && <button className="quiet" onClick={() => void api("/api/auth/logout", { method: "POST" }).then(async () => { setUser(null); const token = await api("/api/csrf"); setCsrf(token.token); }).catch(e => report(e.message))}>Sign out</button>}</header><main>
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    {!ready ? <section className="staff-page">Loading admin session…</section> : user ? <AdminPanel api={api} report={report} refreshShop={refreshShop}/> : <section className="staff-page"><h1>Admin sign in</h1><form className="product-form auth-form" onSubmit={login}><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="button-primary" disabled={busy || !csrf}>Sign in to admin</button></form></section>}
  </main></div>;
}
