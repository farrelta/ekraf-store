"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Api, Product, User } from "./types";
export type CartLine = {
  id: string;
  variantId: string;
  batchId: string | null;
  quantity: number;
  embroideryName?: string;
};
type Store = {
  api: Api;
  user: User | null;
  ready: boolean;
  csrf: string;
  refreshAuth: () => Promise<void>;
  notice: string;
  report: (message: string) => void;
  cart: CartLine[];
  add: (line: Omit<CartLine, "id">) => void;
  remove: (id: string) => void;
  quantity: (id: string, value: number) => void;
  checkoutKey: () => string;
  completeCheckout: () => void;
  invalidateCheckout: () => void;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [csrf, setCsrf] = useState(""),
    [cart, setCart] = useState<CartLine[]>([]),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState(""),
    [storageReady, setStorageReady] = useState(false);
  const report = useCallback((message: string) => setNotice(message), []);
  const api: Api = useCallback(
    async (url, options = {}) => {
      const headers = new Headers(options.headers);
      if (typeof options.body === "string")
        headers.set("Content-Type", "application/json");
      if (options.method && !["GET", "HEAD"].includes(options.method))
        headers.set("X-CSRF-Token", csrf);
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
        cache: "no-store",
      });
      const data =
        response.status === 204
          ? null
          : await response.json().catch(() => ({}));
      if (!response.ok)
        throw Object.assign(
          new Error(
            data.error || "Unable to complete the request. Please try again.",
          ),
          { status: response.status },
        );
      return data;
    },
    [csrf],
  );
  const refreshAuth = useCallback(async () => {
    const responses = await Promise.all([
      fetch("/api/csrf", { credentials: "include", cache: "no-store" }),
      fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
    ]);
    if (responses.some((r) => !r.ok))
      throw new Error("Could not load your session. Refresh to retry.");
    const [c, m] = await Promise.all(responses.map((r) => r.json()));
    setCsrf(c.token);
    setUser(m.user);
    setReady(true);
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ekraf:cart:v3") || "[]");
      if (Array.isArray(saved))
        setCart(
          saved.filter(
            (x) =>
              x &&
              typeof x.id === "string" &&
              typeof x.variantId === "string" &&
              (x.batchId === null || typeof x.batchId === "string") &&
              Number.isInteger(x.quantity) &&
              x.quantity > 0 &&
              x.quantity <= 100 &&
              (x.embroideryName === undefined ||
                typeof x.embroideryName === "string"),
          ),
        );
      const k = JSON.parse(localStorage.getItem("ekraf:checkout:v3") || "{}");
      if (k && typeof k === "object" && !Array.isArray(k))
        setKeys(
          Object.fromEntries(
            Object.entries(k).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" &&
                /^[a-f0-9-]{36}$/i.test(entry[1]),
            ),
          ),
        );
    } catch {}
    setStorageReady(true);
    void refreshAuth().catch((e) => {
      report(e.message);
      setReady(true);
    });
  }, [refreshAuth, report]);
  useEffect(() => {
    if (storageReady)
      try {
        localStorage.setItem("ekraf:cart:v3", JSON.stringify(cart));
        localStorage.setItem("ekraf:checkout:v3", JSON.stringify(keys));
      } catch {}
  }, [cart, keys, storageReady]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const invalidateCheckout = useCallback(() => setKeys({}), []);
  const add = useCallback(
    (line: Omit<CartLine, "id">) => {
      setCart((old) => [...old, { ...line, id: crypto.randomUUID() }]);
      setKeys({});
      report("Added to your bag.");
    },
    [report],
  );
  const remove = useCallback((id: string) => {
    setCart((old) => old.filter((x) => x.id !== id));
    setKeys({});
  }, []);
  const quantity = useCallback((id: string, value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 100) return;
    setCart((old) =>
      old.map((x) => (x.id === id ? { ...x, quantity: value } : x)),
    );
    setKeys({});
  }, []);
  const checkoutKey = () => {
    const key = keys.checkout || crypto.randomUUID();
    const next = { checkout: key };
    setKeys(next);
    try {
      localStorage.setItem("ekraf:checkout:v3", JSON.stringify(next));
    } catch {}
    return key;
  };
  const completeCheckout = () => {
    setCart([]);
    setKeys({});
    try {
      localStorage.setItem("ekraf:cart:v3", "[]");
      localStorage.setItem("ekraf:checkout:v3", "{}");
    } catch {}
  };
  return (
    <Context.Provider
      value={{
        api,
        user,
        ready,
        csrf,
        refreshAuth,
        notice,
        report,
        cart,
        add,
        remove,
        quantity,
        checkoutKey,
        completeCheckout,
        invalidateCheckout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("StoreProvider is required");
  return value;
}
export function useData<T = any>(url: string | null) {
  const { api } = useStore();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(async () => {
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api(url, { signal: controller.signal })
      .then((value) => {
        if (active) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, api, version]);
  return { data, error, loading, reload };
}
