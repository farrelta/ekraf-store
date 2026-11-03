export type ValidationIssue = { path: string; message: string };
export class RequestError extends Error {
  status: number;
  details: ValidationIssue[];
  constructor(status: number, data: unknown, retryAfter?: string | null) {
    const body = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const details = status < 500 && Array.isArray(body.details) ? body.details.filter((issue): issue is ValidationIssue => !!issue && typeof issue.path === "string" && typeof issue.message === "string") : [];
    const defaults: Record<number,string> = {
      401: "Your session has ended. Sign in again, then retry.",
      403: "You cannot perform this action. Check your access or refresh your session.",
      404: "This record is no longer available. Return to the list and refresh it.",
      409: "This record changed or conflicts with existing data. Refresh its details before retrying.",
      429: "Too many requests. Wait a moment before trying again.",
    };
    let message = typeof body.error === "string" ? body.error : defaults[status] || "Unable to complete the request. Please try again.";
    if (status === 401 && ["Authentication required", "Unauthorized", "Not authenticated"].includes(message)) message = defaults[401]!;
    if (status === 403 && ["Forbidden", "Admin access required"].includes(message)) message = defaults[403]!;
    if (status >= 500) message = "The store could not complete your request. Please try again shortly.";
    if (details.length) message = "Check the fields below and try again.";
    if (status === 429) {
      const seconds = Number(retryAfter);
      message = Number.isFinite(seconds) && seconds > 0 ? `Too many requests. Try again in ${Math.ceil(seconds)} seconds.` : defaults[429]!;
    }
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.details = details;
  }
}

export async function fetchJson(url:string,options:RequestInit={}) {
  const controller=new AbortController();
  const abort=()=>controller.abort(options.signal?.reason);
  if(options.signal?.aborted)abort();
  options.signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),typeof options.body === "string" || !options.body ? 30000 : 120000);
  try {
    const response=await fetch(url,{...options,signal:controller.signal,credentials:"include",cache:"no-store"});
    const data=response.status===204 ? null : await response.json().catch(()=>null);
    if(!response.ok)throw new RequestError(response.status,data,response.headers.get("Retry-After"));
    if(response.status!==204&&data===null)throw new Error("The store returned an unreadable response. Please try again.");
    return data;
  } catch(error) {
    if(error instanceof RequestError || options.signal?.aborted)throw error;
    if(controller.signal.aborted)throw new Error("The request timed out. Check your connection and try again. Your entries are still here.");
    if(error instanceof TypeError)throw new Error("Could not reach the store. Check your connection and try again. Your entries are still here.");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort",abort);
  }
}
