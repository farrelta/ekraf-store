"use client";
import {
  createContext, useContext, useEffect, useId, useMemo, useRef,
  type ReactNode, type RefObject,
} from "react";
import { RequestError } from "./request-errors";

const Feedback = createContext<{ id: string; fields: Record<string, string> } | null>(null);

export function FieldError({ name }: { name: string }) {
  const feedback = useContext(Feedback);
  const message = feedback?.fields[name];
  return message ? <small className="field-error" id={`${feedback!.id}-field-${name}`}>{message}</small> : null;
}

export function FormFeedback({ error, formRef, children }: {
  error: unknown;
  formRef: RefObject<HTMLFormElement | null>;
  children: ReactNode;
}) {
  const id = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const fields = useMemo(() => {
    const result: Record<string, string> = {};
    if (error instanceof RequestError) {
      for (const issue of error.details) {
        let name = issue.path.startsWith("variants.") ? issue.path.split(".").at(-1)! : issue.path;
        if (name === "productionWeeks") name = "weeks";
        if (name === "category") {
          name = formRef.current?.elements.namedItem("customCategory") ? "customCategory" : "categoryChoice";
        }
        result[name || "form"] = issue.message;
      }
    }
    return result;
  }, [error, formRef]);

  useEffect(() => {
    if (!error) return;
    const cleanups: (() => void)[] = [];
    let first: HTMLElement | null = null;
    for (const name of Object.keys(fields)) {
      const control = formRef.current?.elements.namedItem(name);
      if (!(control instanceof HTMLElement)) continue;
      const previousInvalid = control.getAttribute("aria-invalid");
      const previousDescription = control.getAttribute("aria-describedby");
      const messageId = document.getElementById(`${id}-field-${name}`)
        ? `${id}-field-${name}` : `${id}-summary-${name}`;
      control.setAttribute("aria-invalid", "true");
      control.setAttribute("aria-describedby", [previousDescription, messageId].filter(Boolean).join(" "));
      cleanups.push(() => {
        if (previousInvalid === null) control.removeAttribute("aria-invalid");
        else control.setAttribute("aria-invalid", previousInvalid);
        if (previousDescription === null) control.removeAttribute("aria-describedby");
        else control.setAttribute("aria-describedby", previousDescription);
      });
      if (!first && !control.matches(":disabled")) first = control;
    }
    (first || summaryRef.current)?.focus();
    return () => cleanups.forEach(clean => clean());
  }, [error, fields, formRef, id]);

  return <Feedback.Provider value={{ id, fields }}>
    {!!error && <div className="form-error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
      <p>{error instanceof Error ? error.message : "Unable to save. Please try again."}</p>
      {Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([name, message]) => {
        const control = formRef.current?.elements.namedItem(name);
        const label = name.replace(/([A-Z])/g, " $1").replaceAll(".", " ");
        return <li key={name} id={`${id}-summary-${name}`}>
          {control && "focus" in control
            ? <button type="button" onClick={() => (control as HTMLElement).focus()}>{label}: {message}</button>
            : message}
        </li>;
      })}</ul>}
    </div>}
    {children}
  </Feedback.Provider>;
}
