"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useStore } from "./store-provider";
import { FormFeedback, FieldError } from "./form-feedback";
import { State, StoreLayout } from "./ui";
import type { User } from "./types";

function AccountForm({ user }: { user: User }) {
  const { api, refreshAuth, report } = useStore();
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const formRef=useRef<HTMLFormElement>(null), inFlight=useRef(false);
  const [saved, setSaved] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== user.email;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(inFlight.current)return;
    inFlight.current=true;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(null); setSaved(false);
    try {
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({
        name: data.get("name"), email, phone: data.get("phone"),
        ...(emailChanged ? { currentPassword: data.get("currentPassword") } : {}),
      }) });
      await refreshAuth();
      const password = form.querySelector<HTMLInputElement>('[name="currentPassword"]');
      if (password) password.value = "";
      setSaved(true); report("Account details saved.");
    } catch (error) { setError(error); }
    finally { inFlight.current=false; setBusy(false); }
  }
  return <form className="account-form" onSubmit={save} ref={formRef} aria-busy={busy}><FormFeedback error={error} formRef={formRef}>
    <fieldset disabled={busy}>
      <label>Name<input name="name" autoComplete="name" defaultValue={user.name} minLength={2} maxLength={100} required /><FieldError name="name"/></label>
      <label>Email<input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /><FieldError name="email"/></label>
      <label>WhatsApp / phone number<input name="phone" type="tel" autoComplete="tel" pattern="[+]?[0-9][0-9 \(\)\-]{5,29}" defaultValue={user.phone || ""} minLength={6} maxLength={30} required aria-describedby="account-phone-help" /><FieldError name="phone"/></label>
      <p id="account-phone-help" className="muted">Used for future orders and campus pickup arrangements.</p>
      {emailChanged && <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} aria-describedby="email-change-help" /><FieldError name="currentPassword"/></label>}
      {emailChanged && <p id="email-change-help" className="muted">Confirm your password to change your sign-in email.</p>}
      {saved && <p role="status">Your account details have been saved.</p>}
      <button className="button-primary full-width" disabled={busy}>{busy ? "Saving…" : "Save account details"}</button>
    </fieldset>
  </FormFeedback></form>;
}

export function AccountPage() {
  const { user, ready, api, refreshAuth, report } = useStore();
  return <StoreLayout>
    <section className="account-page panel">
      <h1>My account</h1>
      <State loading={!ready}>
        {user ? <>
          <p className="muted">Update your details for future checkouts. Existing orders keep their original contact information.</p>
          <AccountForm key={`${user.id}:${user.name}:${user.email}:${user.phone}`} user={user} />
          <div className="account-actions"><Link className="text-link" href="/orders">My Orders</Link>
            <button className="text-link" onClick={() => void api("/api/auth/logout", { method: "POST" }).then(refreshAuth).catch(error => report(error.message))}>Sign out</button>
          </div>
        </> : <><p>Sign in to view and edit your account.</p><Link className="button-primary" href="/sign-in?next=/account">Sign in</Link></>}
      </State>
    </section>
  </StoreLayout>;
}
