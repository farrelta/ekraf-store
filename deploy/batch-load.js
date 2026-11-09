import http from "k6/http";
import { fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const base = (__ENV.BASE_URL || "").replace(/\/$/, "");
const rate = Number(__ENV.CHECKOUTS_PER_SECOND);
const method = __ENV.PAYMENT_METHOD_ID;
const batch = __ENV.BATCH_ID;
const variant = __ENV.VARIANT_ID;
const receipt = open(__ENV.RECEIPT_PNG || "./test-receipt.png", "b");
const failures = new Rate("unexpected_failures");
const duplicates = new Counter("duplicate_orders");
const checkoutTime = new Trend("checkout_time", true);

if (__ENV.CONFIRM_STAGING !== "yes" || !/^https:\/\//.test(base) ||
    !Number.isInteger(rate) || rate < 1 || !batch || !variant || !method) {
  throw new Error("Set CONFIRM_STAGING=yes, HTTPS BASE_URL, CHECKOUTS_PER_SECOND, BATCH_ID, VARIANT_ID and PAYMENT_METHOD_ID for an isolated staging store");
}

export const options = {
  scenarios: {
    batch: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration: __ENV.DURATION || "60s",
      preAllocatedVUs: Math.max(10, rate * 3),
      maxVUs: Math.max(20, rate * 8),
    },
  },
  thresholds: {
    checkout_time: ["p(95)<2000"],
    unexpected_failures: ["rate<0.01"],
    duplicate_orders: ["count==0"],
    dropped_iterations: ["count==0"],
  },
  discardResponseBodies: true,
  noCookiesReset: false,
};

const jsonResponse = { responseType: "text" };
const url = (path) => base + "/api" + path;

export function setup() {
  const accounts = JSON.parse(__ENV.TEST_ACCOUNTS || "[]");
  if (!Array.isArray(accounts) || !accounts.length || accounts.length > 5 ||
      accounts.some(a => !a.email?.endsWith("@example.test") || !a.password)) {
    fail("Provide 1–5 seeded @example.test accounts via TEST_ACCOUNTS");
  }
  const data = http.get(url("/batches/" + batch), jsonResponse);
  if (data.status !== 200) fail("Staging batch not found");
  const selected = data.json("batch");
  if (selected?.status !== "OPEN" || !selected.product?.variants.some(v => v.id === variant)) {
    fail("Select an open batch and one of its active variants");
  }
  const sessions = accounts.map(({ email, password }) => {
    http.cookieJar().clear(base);
    const csrf = http.get(url("/csrf"), jsonResponse);
    if (csrf.status !== 200) fail("CSRF setup failed");
    const login = http.post(url("/auth/login"), JSON.stringify({ email, password }), {
      ...jsonResponse,
      headers: { "Content-Type": "application/json", Origin: base, "X-CSRF-Token": csrf.json("token") },
    });
    if (login.status !== 200 || login.json("user.role") !== "CUSTOMER") fail("Staging customer login failed");
    const afterLogin = http.get(url("/csrf"), jsonResponse);
    if (afterLogin.status !== 200) fail("Authenticated CSRF setup failed");
    const cookies = Object.fromEntries(Object.entries(http.cookieJar().cookiesForURL(base)).map(([key, values]) => [key, values[0]]));
    return { cookies, csrf: afterLogin.json("token"), user: login.json("user") };
  });
  return { sessions, embroideryRequired: selected.product.embroideryRequired };
}

export default function ({ sessions, embroideryRequired }) {
  const { cookies, csrf, user } = sessions[(__VU - 1) % sessions.length];
  const browsing = http.batch([["GET", base + "/"], ["GET", url("/batches/" + batch)]]);
  const payload = JSON.stringify({
    customerName: user.name, customerPhone: user.phone,
    items: [{ batchId: batch, variantId: variant, quantity: 1, ...(embroideryRequired ? { embroideryName: "Load Test" } : {}) }],
  });
  const headers = { "Content-Type": "application/json", Origin: base, "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() };
  const params = { ...jsonResponse, cookies, headers };
  // Every tenth buyer retries with the same key while the first request is in flight.
  const responses = __ITER % 10 === 0
    ? http.batch([["POST", url("/orders"), payload, params], ["POST", url("/orders"), payload, params]])
    : [http.post(url("/orders"), payload, params)];
  checkoutTime.add(responses[0].timings.duration);
  const ids = responses.map(r => [200, 201].includes(r.status) ? r.json("order.id") : null);
  const duplicate = new Set(ids.filter(Boolean)).size > 1;
  duplicates.add(duplicate ? 1 : 0);
  let bad = duplicate || browsing.some(r => r.status !== 200) || ids.some(id => !id);
  if (ids[0]) {
    const proof = http.post(url("/orders/" + ids[0] + "/proof"), receipt, {
      cookies,
      headers: { "Content-Type": "image/png", Origin: base, "X-CSRF-Token": csrf, "X-Payment-Method": method },
    });
    bad = bad || proof.status !== 202;
  }
  failures.add(bad);
}
