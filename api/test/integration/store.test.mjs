import test from "node:test";
import sharp from "sharp";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../dist/generated/prisma/client.js";
import { expireOrders } from "../../dist/store-service.js";

const target = process.env.TEST_DATABASE_URL;
test(
  "minimal EKRAF store integration",
  { skip: !target, timeout: 90000 },
  async (t) => {
    const url = new URL(target);
    assert(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_test"),
      "Use a dedicated local database ending in _test",
    );
    const pool = new Pool({ connectionString: target });
    const db = new PrismaClient({ adapter: new PrismaPg(pool) });
    let server;
    t.after(async () => {
      server?.kill();
      await db.$disconnect();
      await pool.end();
    });
    assert.equal(
      await db.user.count(),
      0,
      "Integration database must be empty",
    );
    const port = 3917;
    server = spawn(process.execPath, ["dist/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: target,
        API_PORT: String(port),
        NODE_ENV: "test",
        SESSION_SECRET: "integration-session-secret-at-least-32-characters",
        ALLOW_ADMIN_BOOTSTRAP: "false",
        RECEIPT_STORAGE_DIR: "storage/integration-receipts",
        MEDIA_STORAGE_DIR: "storage/integration-media",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    server.stdout.on("data", (data) => {
      logs += data;
    });
    server.stderr.on("data", (data) => {
      logs += data;
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/api/health`)).ok) break;
      } catch {}
      if (i === 99) throw Error(logs);
      await delay(100);
    }
    class Client {
      cookie = "";
      csrf = "";
      async call(route, method = "GET", data, headers = {}) {
        const init = {
          method,
          headers: {
            cookie: this.cookie,
            ...(method === "GET" ? {} : { "x-csrf-token": this.csrf }),
            ...headers,
          },
        };
        if (data !== undefined) {
          if (Buffer.isBuffer(data)) init.body = data;
          else {
            init.body = JSON.stringify(data);
            init.headers["content-type"] = "application/json";
          }
        }
        const r = await fetch(`http://localhost:${port}/api${route}`, init);
        const cookies = r.headers.getSetCookie();
        if (cookies.length)
          this.cookie = cookies.map((s) => s.split(";")[0]).join("; ");
        const body = r.headers.get("content-type")?.includes("application/json")
          ? await r.json()
          : await r.arrayBuffer();
        return { status: r.status, body };
      }
      async session() {
        const r = await this.call("/csrf");
        this.csrf = r.body.token;
      }
      async register(label) {
        await this.session();
        const r = await this.call("/auth/register", "POST", {
          name: label,
          phone: "+6281234567890",
          email: `${label}@example.test`,
          password: "test-password-12345",
          role: "ADMIN",
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.user.role, "CUSTOMER");
        await this.session();
        return r.body.user;
      }
    }
    const admin = new Client(),
      alice = new Client(),
      bob = new Client();
    const adminUser = await admin.register("admin");
    await db.user.update({
      where: { id: adminUser.id },
      data: { role: "ADMIN" },
    });
    await alice.register("alice");
    await bob.register("bob");
    const post = async (client, route, data, expected = 201) => {
      const r = await client.call(route, "POST", data);
      assert.equal(r.status, expected, JSON.stringify(r.body));
      return r.body;
    };
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=",
      "base64",
    );
    let product, batchProduct, method, order, submission;
    const createOrder = (
      client,
      variantId,
      quantity = 1,
      batchId = null,
      embroideryName,
    ) =>
      client.call(
        "/orders",
        "POST",
        {
          items: [
            {
              variantId,
              quantity,
              batchId,
              ...(embroideryName ? { embroideryName } : {}),
            },
          ],
          customerName: "Student Buyer",
          customerPhone: "081234567890",
        },
        { "idempotency-key": randomUUID() },
      );
    const proof = (client, orderId) =>
      client.call(`/orders/${orderId}/proof`, "POST", image, {
        "content-type": "image/png",
        "x-payment-method": method.id,
      });
    await t.test("registration and saved contact details", async () => {
      const account = (await alice.call("/auth/me")).body.user;
      assert.equal(account.phone, "+6281234567890");
      const anonymous = new Client();
      await anonymous.session();
      assert.equal((await anonymous.call("/auth/me", "PATCH", { phone: "+628111111111" })).status, 401);
      for (const phone of [undefined, "not-a-phone"]) {
        const response = await anonymous.call("/auth/register", "POST", { name: "Invalid contact", email: "invalid@example.test", password: "test-password-12345", phone });
        assert.equal(response.status, 400);
      }
      assert.equal((await alice.call("/auth/me", "PATCH", { phone: "abc" })).status, 400);
      const updated = await alice.call("/auth/me", "PATCH", { phone: "+628111111111", role: "ADMIN", userId: adminUser.id });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.user.phone, "+628111111111");
      assert.equal(updated.body.user.role, "CUSTOMER");
      assert.equal((await bob.call("/auth/me")).body.user.phone, "+6281234567890");
      assert.equal((await admin.call("/auth/me")).body.user.phone, "+6281234567890");
      const login = new Client(); await login.session();
      const response = await login.call("/auth/login", "POST", { email: "alice@example.test", password: "test-password-12345" });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.phone, "+628111111111");
      assert.equal((await login.call("/auth/me")).body.user.phone, "+628111111111");
      assert.equal((await login.call("/orders", "POST", {})).status, 403); // new login needs a fresh CSRF token
      await anonymous.session();
      assert.equal((await anonymous.call("/orders", "POST", {})).status, 401);
    });
    await t.test("customers edit only their own account and confirm email changes", async () => {
      const original = (await bob.call("/auth/me")).body.user;
      assert.equal((await bob.call("/auth/me", "PATCH", { email: "new-bob@example.test" })).status, 400);
      assert.equal((await bob.call("/auth/me", "PATCH", { email: "new-bob@example.test", currentPassword: "incorrect" })).status, 400);
      const response = await bob.call("/auth/me", "PATCH", {
        name: "Updated Bob", email: " NEW-BOB@example.test ", phone: "+628777777777", currentPassword: "test-password-12345",
        id: adminUser.id, role: "ADMIN",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.email, "new-bob@example.test");
      assert.equal(response.body.user.name, "Updated Bob");
      assert.equal(response.body.user.phone, "+628777777777");
      assert.equal(response.body.user.id, original.id);
      assert.equal(response.body.user.role, "CUSTOMER");
      assert.equal(response.body.user.passwordHash, undefined);
      assert.equal((await admin.call("/auth/me")).body.user.email, "admin@example.test");
      assert.equal((await bob.call("/auth/me", "PATCH", { email: "admin@example.test", currentPassword: "test-password-12345" })).status, 409);
      assert.equal((await bob.call("/auth/me", "PATCH", { name: " " })).status, 400);
      const login = new Client(); await login.session();
      assert.equal((await login.call("/auth/login", "POST", { email: "new-bob@example.test", password: "test-password-12345" })).status, 200);
      const restored = await bob.call("/auth/me", "PATCH", { name: original.name, email: original.email, phone: original.phone, currentPassword: "test-password-12345" });
      assert.equal(restored.status, 200);
    });
    await t.test("two roles and admin-only settings", async () => {
      assert.equal((await alice.call("/admin/products")).status, 403);
      assert.equal(
        (
          await alice.call("/admin/login", "POST", {
            email: "alice@example.test",
            password: "test-password-12345",
          })
        ).status,
        401,
      );
      assert.equal(
        (await alice.call("/admin/payment-methods", "POST", {})).status,
        403,
      );
      const roles = await pool.query(
        "SELECT unnest(enum_range(NULL::roles))::text AS value",
      );
      assert.deepEqual(
        roles.rows.map((r) => r.value),
        ["CUSTOMER", "ADMIN"],
      );
      method = (
        await post(admin, "/admin/payment-methods", {
          name: "Organization test bank",
          type: "BANK_TRANSFER",
          bankName: "Test Bank",
          accountName: "EKRAF",
          accountNumber: "12345",
        })
      ).method;
      assert.equal(
        (
          await admin.call("/admin/payment-methods", "POST", {
            name: "Invalid QR",
            type: "QRIS",
          })
        ).status,
        400,
      );
    });
    await t.test(
      "catalog options are admin-only and generated SKUs preserve options and history",
      async () => {
        assert.equal(
          (await new Client().call("/admin/catalog-options")).status,
          401,
        );
        assert.equal((await alice.call("/admin/catalog-options")).status, 403);
        const options = await admin.call("/admin/catalog-options");
        assert.equal(options.status, 200);
        assert(options.body.categories.includes("Other"));
        assert(options.body.sizes.includes("XXXL"));
        const p = (
          await post(admin, "/admin/products", {
            name: "Generated SKU Product",
            category: "T-shirt",
            sellingType: "CONTINUOUS",
            variants: [{ price: "85000", color: "   ", size: "" }],
          })
        ).product;
        assert.match(p.variants[0].sku, /^EKR-[0-9A-F]{12}$/);
        assert.equal(p.variants[0].size, "STANDARD");
        assert.equal(p.variants[0].color, "STANDARD");
        const v = (
          await post(admin, `/admin/products/${p.id}/variants`, {
            price: "85000",
            size: " m ",
            color: " forest   green ",
          })
        ).variant;
        assert.match(v.sku, /^EKR-[0-9A-F]{12}$/);
        assert.notEqual(v.sku, p.variants[0].sku);
        const loaded = (await admin.call("/admin/products")).body.products.find(
          (x) => x.id === p.id,
        );
        const saved = loaded.variants.find((x) => x.id === v.id);
        assert.equal(saved.size, "M");
        assert.equal(saved.color, "FOREST GREEN");
        assert.equal(
          (
            await admin.call(`/admin/products/${p.id}/variants`, "POST", {
              price: "85000",
              size: "M",
              color: "Forest Green",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await admin.call("/admin/products", "POST", {
              name: "Invalid batch",
              sellingType: "BATCH",
              variants: [{ price: "265000" }],
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await admin.call("/admin/products", "POST", {
              name: "Invalid batch size",
              sellingType: "BATCH",
              variants: [{ price: "265000", size: "anything" }],
            })
          ).status,
          400,
        );
        await admin.call(`/admin/products/${p.id}`, "PATCH", {
          name: "Renamed",
          category: "Community Kits",
        });
        const edited = (await admin.call("/admin/products")).body.products.find(
          (x) => x.id === p.id,
        );
        assert.equal(edited.category, "Community Kits");
        assert.equal(edited.variants.find((x) => x.id === v.id).sku, v.sku);
        const legacy = (
          await post(admin, `/admin/products/${p.id}/variants`, {
            sku: "EXISTING-EXTERNAL",
            price: "85000",
            size: "42",
            color: "Custom Shade",
          })
        ).variant;
        assert.equal(legacy.sku, "EXISTING-EXTERNAL");
      },
    );
    await t.test(
      "stock, SKU uniqueness and concurrent oversell prevention",
      async () => {
        product = (
          await post(admin, "/admin/products", {
            name: "Merchandise",
            sellingType: "CONTINUOUS",
            status: "PUBLISHED",
            variants: [{ sku: "TEE-ONE", price: "85000", onHand: 2 }],
          })
        ).product;
        assert.equal(product.variants[0].size, "STANDARD");
        assert.equal(
          (
            await admin.call(`/admin/products/${product.id}/variants`, "POST", {
              sku: "TEE-DUP",
              price: "85000",
            })
          ).status,
          409,
        );
        const results = await Promise.all([
          createOrder(alice, product.variants[0].id, 2),
          createOrder(bob, product.variants[0].id, 2),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const winner = results.findIndex((r) => r.status === 201);
        const buyer = winner === 0 ? alice : bob;
        const held = results[winner].body.order;
        assert.equal(held.total, "170000.00");
        assert.equal(
          (await buyer.call(`/orders/${held.id}/cancel`, "POST")).status,
          200,
        );
        assert.equal(
          (
            await db.productVariant.findUnique({
              where: { id: product.variants[0].id },
            })
          ).reserved,
          0,
        );
        const key = randomUUID();
        const data = {
          items: [{ variantId: product.variants[0].id, quantity: 1 }],
          customerName: "Alice Student",
          customerPhone: "0812345678",
        };
        const first = await alice.call("/orders", "POST", data, {
          "idempotency-key": key,
        });
        const retry = await alice.call("/orders", "POST", data, {
          "idempotency-key": key,
        });
        assert.equal(first.body.order.id, retry.body.order.id);
        order = first.body.order;
      },
    );
    await t.test(
      "receipt privacy, rejection, resubmission, approval and immutable history",
      async () => {
        assert.equal(
          (
            await alice.call(
              `/orders/${order.id}/proof`,
              "POST",
              Buffer.from("not an image"),
              { "content-type": "image/png", "x-payment-method": method.id },
            )
          ).status,
          400,
        );
        const r = await proof(alice, order.id);
        assert.equal(r.status, 202, JSON.stringify(r.body));
        submission = r.body.submission;
        assert.equal(
          (await bob.call(`/payment-submissions/${submission.id}/proof`))
            .status,
          404,
        );
        assert.equal(
          (await admin.call(`/payment-submissions/${submission.id}/proof`))
            .status,
          200,
        );
        assert.equal((await proof(alice, order.id)).status, 409);
        assert.equal(
          (
            await admin.call(
              `/admin/payment-submissions/${submission.id}/review`,
              "POST",
              { action: "REJECTED" },
            )
          ).status,
          400,
        );
        await post(
          admin,
          `/admin/payment-submissions/${submission.id}/review`,
          { action: "REJECTED", reason: "Wrong receipt" },
          200,
        );
        assert.equal(
          (await db.order.findUnique({ where: { id: order.id } }))
            .paymentStatus,
          "PENDING",
        );
        const second = await proof(alice, order.id);
        assert.equal(second.status, 202);
        const decisions = await Promise.all([
          admin.call(
            `/admin/payment-submissions/${second.body.submission.id}/review`,
            "POST",
            { action: "VERIFIED", reference: "BANK-001" },
          ),
          admin.call(
            `/admin/payment-submissions/${second.body.submission.id}/review`,
            "POST",
            { action: "VERIFIED", reference: "BANK-001" },
          ),
        ]);
        assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
        const v = await db.productVariant.findUnique({
          where: { id: product.variants[0].id },
        });
        assert.equal(v.onHand, 1);
        assert.equal(v.reserved, 0);
        await assert.rejects(
          pool.query(
            "UPDATE payment_submissions SET review_reason='changed' WHERE id=$1",
            [second.body.submission.id],
          ),
        );
        await assert.rejects(
          pool.query("DELETE FROM inventory_movements WHERE variant_id=$1", [
            v.id,
          ]),
        );
        await admin.call(
          `/admin/order-items/${order.items[0].id}/pickup`,
          "PATCH",
          { status: "READY_FOR_PICKUP" },
        );
        await admin.call(
          `/admin/order-items/${order.items[0].id}/pickup`,
          "PATCH",
          { status: "COMPLETED" },
        );
        assert.equal(
          (await db.productVariant.findUnique({ where: { id: v.id } })).onHand,
          1,
        );
      },
    );
    await t.test(
      "duplicate verified reference rolls back; timely proof holds expired order",
      async () => {
        const r = await createOrder(alice, product.variants[0].id);
        assert.equal(r.status, 201);
        const id = r.body.order.id;
        const s = await proof(alice, id);
        assert.equal(s.status, 202);
        assert.equal(
          (
            await admin.call(
              `/admin/payment-submissions/${s.body.submission.id}/review`,
              "POST",
              { action: "VERIFIED", reference: "BANK-001" },
            )
          ).status,
          409,
        );
        await delay(30);
        await pool.query(
          "UPDATE orders SET created_at=now()-interval '3 days',expires_at=now()-interval '1 millisecond' WHERE id=$1",
          [id],
        );
        await expireOrders(db);
        assert.equal(
          (await db.order.findUnique({ where: { id } })).paymentStatus,
          "PENDING",
        );
        await post(
          admin,
          `/admin/payment-submissions/${s.body.submission.id}/review`,
          { action: "REJECTED", reason: "Receipt belongs to another order" },
          200,
        );
        assert.equal(
          (await db.order.findUnique({ where: { id } })).paymentStatus,
          "EXPIRED",
        );
        assert.equal(
          (
            await db.productVariant.findUnique({
              where: { id: product.variants[0].id },
            })
          ).reserved,
          0,
        );
      },
    );
    await t.test("older batch products, expired batch closure and transition metadata", async () => {
      const created = await post(admin, "/admin/products", { name: "Older picker fixture", sellingType: "BATCH", status: "DRAFT", variants: [{ size: "M", color: "Black", type: "Physics", price: "85000.50" }] });
      const p = created.product;
      await db.product.update({ where: { id: p.id }, data: { createdAt: new Date("2020-01-01T00:00:00Z") } });
      const filtered = await admin.call("/admin/products?type=BATCH&q=Older%20picker%20fixture");
      assert.equal(filtered.body.products[0].id, p.id);
      const currentMonth = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7) + "-01";
      const dateFiltered = await admin.call(`/admin/products?type=BATCH&q=Older%20picker%20fixture&from=${currentMonth}`);
      assert.equal(dateFiltered.body.products.length, 0);
      const picker = await admin.call("/admin/products?scope=catalog&type=BATCH&q=Older%20picker%20fixture");
      assert.equal(picker.body.products[0].id, p.id);
      assert.equal((await alice.call("/admin/products?scope=catalog&type=BATCH")).status, 403);
      assert.equal((await admin.call(`/admin/variants/${p.variants[0].id}`, "PATCH", { price: "85000.75" })).status, 200);
      const window = { productId: p.id, name: "Expired fixture", status: "OPEN", opensAt: new Date(Date.now()-60000).toISOString(), closesAt: new Date(Date.now()+60000).toISOString() };
      assert.equal((await admin.call("/admin/batches", "POST", window)).status, 409);
      assert.equal((await admin.call("/admin/products/"+p.id, "PATCH", { status: "PUBLISHED" })).status, 200);
      const createdBatch = await post(admin, "/admin/batches", { productId: p.id, name: "Expired fixture", status: "OPEN", opensAt: new Date(Date.now()-60000).toISOString(), closesAt: new Date(Date.now()+60000).toISOString() });
      const expired = await db.batch.update({ where: { id: createdBatch.batch.id }, data: { opensAt: new Date("2020-01-01T00:00:00Z"), closesAt: new Date("2020-02-01T00:00:00Z") } });
      const sameDates = { opensAt: expired.opensAt.toISOString(), closesAt: expired.closesAt.toISOString() };
      assert.equal((await admin.call(`/admin/batches/${expired.id}`, "PATCH", { ...sameDates, status: "OPEN", announcement: "Ordering has ended" })).status, 200);
      assert.equal((await admin.call(`/admin/batches/${expired.id}`, "PATCH", { status: "OPEN", closesAt: "2020-03-01T00:00:00Z" })).status, 400);
      const detail = await admin.call(`/admin/batches/${expired.id}`);
      assert.deepEqual(detail.body.batch.actions.map(a => a.status), ["CLOSED", "CANCELLED"]);
      assert.equal((await admin.call(`/admin/batches/${expired.id}`, "PATCH", { ...sameDates, status: "CLOSED" })).status, 200);
      assert.equal((await admin.call(`/admin/batches/${expired.id}`, "PATCH", { status: "READY" })).status, 409);
      assert.equal((await admin.call(`/admin/batches/${expired.id}`, "PATCH", { status: "IN_PRODUCTION" })).status, 200);
      await db.batch.delete({ where: { id: expired.id } });
      await db.productVariant.deleteMany({ where: { productId: p.id } });
      await db.product.delete({ where: { id: p.id } });
    });
    await t.test(
      "batch sizes, separate names, window validation, receipts and pickup allocation",
      async () => {
        batchProduct = (
          await post(admin, "/admin/products", {
            name: "Faculty Jacket",
            sellingType: "BATCH",
            status: "PUBLISHED",
            variants: [
              { sku: "JKT-M", size: "M", color: "Green", price: "265000" },
              { sku: "JKT-L", size: "L", color: "Green", price: "275000" },
            ],
          })
        ).product;
        const payload = {
          productId: batchProduct.id,
          name: "Batch 01",
          status: "OPEN",
          opensAt: new Date(Date.now() - 10000).toISOString(),
          closesAt: new Date(Date.now() + 86400000).toISOString(),
        };
        const batch = (await post(admin, "/admin/batches", payload)).batch;
        await post(admin, "/admin/batches", { ...payload, name: "Batch 02" });
        assert.equal(
          (await createOrder(alice, batchProduct.variants[0].id, 1, batch.id))
            .status,
          400,
        );
        const r = await alice.call(
          "/orders",
          "POST",
          {
            customerName: "Alice Student",
            customerPhone: "0812345678",
            items: [
              {
                variantId: batchProduct.variants[0].id,
                batchId: batch.id,
                quantity: 1,
                embroideryName: "NADIA",
              },
              {
                variantId: batchProduct.variants[0].id,
                batchId: batch.id,
                quantity: 1,
                embroideryName: "NAYA",
              },
            ],
          },
          { "idempotency-key": randomUUID() },
        );
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const id = r.body.order.id;
        assert.equal(r.body.order.items.length, 2);
        assert.equal(
          (
            await db.productVariant.findUnique({
              where: { id: batchProduct.variants[0].id },
            })
          ).reserved,
          0,
        );
        const s = await proof(alice, id);
        await post(
          admin,
          `/admin/payment-submissions/${s.body.submission.id}/review`,
          { action: "VERIFIED", reference: "BANK-BATCH-01" },
          200,
        );
        assert(
          (await db.orderItem.findMany({ where: { orderId: id } })).every(
            (i) => i.pickupStatus === "PROCESSING",
          ),
        );
        await admin.call(`/admin/batches/${batch.id}`, "PATCH", {
          status: "CLOSED",
        });
        assert.equal(
          (
            await createOrder(
              alice,
              batchProduct.variants[0].id,
              1,
              batch.id,
              "NAME",
            )
          ).status,
          409,
        );
        await post(
          admin,
          `/admin/batches/${batch.id}/receive`,
          {
            items: [{ variantId: batchProduct.variants[0].id, quantity: 2 }],
            reason: "Production delivery",
          },
          200,
        );
        assert(
          (await db.orderItem.findMany({ where: { orderId: id } })).every(
            (i) => i.pickupStatus === "READY_FOR_PICKUP",
          ),
        );
        for (const item of r.body.order.items)
          assert.equal(
            (
              await admin.call(
                `/admin/order-items/${item.id}/pickup`,
                "PATCH",
                { status: "COMPLETED" },
              )
            ).status,
            200,
          );
        const v = await db.productVariant.findUnique({
          where: { id: batchProduct.variants[0].id },
        });
        assert.equal(v.onHand, 0);
        assert.equal(v.reserved, 0);
        const mixed = await alice.call(
          "/orders",
          "POST",
          {
            customerName: "Alice Student",
            customerPhone: "0812345678",
            items: [
              {
                variantId: product.variants[0].id,
                batchId: batch.id,
                quantity: 1,
              },
            ],
          },
          { "idempotency-key": randomUUID() },
        );
        assert.notEqual(mixed.status, 201);
      },
    );
    await t.test(
      "mixed checkout, 50% batch deposit, separate pickup and balance verification",
      async () => {
        const merch = (
          await post(admin, "/admin/products", {
            name: "Mixed Tee",
            sellingType: "CONTINUOUS",
            status: "PUBLISHED",
            variants: [{ sku: "MIX-TEE", price: "85000", onHand: 4 }],
          })
        ).product;
        const jacket = (
          await post(admin, "/admin/products", {
            name: "Mixed Jacket",
            sellingType: "BATCH",
            status: "PUBLISHED",
            variants: [{ sku: "MIX-JKT", size: "M", price: "265000" }],
          })
        ).product;
        const batch = (
          await post(admin, "/admin/batches", {
            productId: jacket.id,
            name: "Mixed batch",
            status: "OPEN",
            opensAt: new Date(Date.now() - 1000).toISOString(),
            closesAt: new Date(Date.now() + 86400000).toISOString(),
          })
        ).batch;
        const r = await alice.call(
          "/orders",
          "POST",
          {
            customerName: "Alice Student",
            customerPhone: "081234567890",
            paymentPlan: "BATCH_DEPOSIT",
            items: [
              { variantId: merch.variants[0].id, quantity: 1 },
              {
                variantId: jacket.variants[0].id,
                batchId: batch.id,
                quantity: 1,
                embroideryName: "NADIA",
              },
            ],
          },
          { "idempotency-key": randomUUID() },
        );
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const o = r.body.order;
        assert.equal(o.total, "350000.00");
        assert.equal(o.amountDue, "217500.00");
        assert.equal(o.initialAmount, "217500.00");
        assert(
          Math.abs(new Date(o.expiresAt) - new Date(o.createdAt) - 86400000) <
            1000,
        );
        const initial = await proof(alice, o.id);
        assert.equal(initial.status, 202);
        await post(
          admin,
          `/admin/payment-submissions/${initial.body.submission.id}/review`,
          { action: "VERIFIED", reference: "MIX-DP" },
          200,
        );
        let current = (await alice.call("/orders")).body.orders.find(
          (x) => x.id === o.id,
        );
        assert.equal(current.paymentStatus, "PARTIALLY_PAID");
        assert.equal(current.amountDue, "132500.00");
        const merchandise = current.items.find((i) => !i.batchId),
          batchItem = current.items.find((i) => i.batchId);
        assert.equal(
          (
            await admin.call(
              `/admin/order-items/${merchandise.id}/pickup`,
              "PATCH",
              { status: "READY_FOR_PICKUP" },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call(
              `/admin/order-items/${merchandise.id}/pickup`,
              "PATCH",
              { status: "COMPLETED" },
            )
          ).status,
          200,
        );
        await admin.call(`/admin/batches/${batch.id}`, "PATCH", {
          status: "CLOSED",
        });
        await post(
          admin,
          `/admin/batches/${batch.id}/receive`,
          {
            items: [{ variantId: jacket.variants[0].id, quantity: 1 }],
            reason: "Jacket delivered",
          },
          200,
        );
        assert.equal(
          (
            await admin.call(
              `/admin/order-items/${batchItem.id}/pickup`,
              "PATCH",
              { status: "COMPLETED" },
            )
          ).status,
          409,
        );
        // Initial deadline does not expire an accepted deposit or block balance payment.
        await pool.query(
          "UPDATE orders SET created_at=now()-interval '3 days',expires_at=now()-interval '1 second' WHERE id=$1",
          [o.id],
        );
        await expireOrders(db);
        assert.equal(
          (await db.order.findUnique({ where: { id: o.id } })).paymentStatus,
          "PARTIALLY_PAID",
        );
        const balance = await proof(alice, o.id);
        assert.equal(balance.status, 202);
        const record = await db.paymentSubmission.findUnique({
          where: { id: balance.body.submission.id },
        });
        assert.equal(record.phase, "BALANCE");
        assert.equal(record.amount.toFixed(2), "132500.00");
        await post(
          admin,
          `/admin/payment-submissions/${record.id}/review`,
          { action: "VERIFIED", reference: "MIX-BALANCE" },
          200,
        );
        current = (await alice.call("/orders")).body.orders.find(
          (x) => x.id === o.id,
        );
        assert.equal(current.paymentStatus, "PAID");
        assert.equal(current.paidAmount, "350000.00");
        assert.equal(current.remainingBalance, "0.00");
        assert.equal(
          (
            await db.productVariant.findUnique({
              where: { id: merch.variants[0].id },
            })
          ).onHand,
          3,
          "Balance approval must not consume merchandise twice",
        );
        assert.equal(
          (
            await admin.call(
              `/admin/order-items/${batchItem.id}/pickup`,
              "PATCH",
              { status: "COMPLETED" },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await db.productVariant.findUnique({
              where: { id: jacket.variants[0].id },
            })
          ).onHand,
          0,
        );
      },
    );
    await t.test(
      "catalog changes preserve order and payment snapshots",
      async () => {
        await admin.call(`/admin/products/${product.id}`, "PATCH", {
          name: "Renamed product",
          status: "ARCHIVED",
        });
        await admin.call(`/admin/variants/${product.variants[0].id}`, "PATCH", {
          price: "99000",
        });
        await admin.call(`/admin/payment-methods/${method.id}`, "PATCH", {
          enabled: false,
        });
        const historical = (await alice.call("/orders")).body.orders.find(
          (o) => o.id === order.id,
        );
        assert.equal(historical.total, "85000.00");
        assert.match(historical.items[0].itemDescription, /Merchandise/);
        assert.equal(
          historical.paymentSubmissions.find((s) => s.status === "VERIFIED")
            .methodSnapshot.accountNumber,
          "12345",
        );
        assert(
          !(await alice.call("/products")).body.products.some(
            (p) => p.id === product.id,
          ),
        );
      },
    );
    await t.test(
      "reporting, pagination, exports, private data and Jakarta boundaries",
      async () => {
        for (const path of [
          "/admin/dashboard",
          "/admin/customers",
          "/admin/batches",
          "/admin/payment-submissions",
          "/admin/customers/export",
          "/admin/products/export",
        ]) {
          assert.equal((await alice.call(path)).status, 403, path);
          assert.equal((await new Client().call(path)).status, 401, path);
        }
        const list = await admin.call("/admin/products?pageSize=1");
        assert.equal(list.status, 200, JSON.stringify(list.body));
        assert.equal(list.body.products.length, 1);
        assert(list.body.pagination.total > 1);
        assert.equal(list.body.summary.total, list.body.pagination.total);
        const none = await admin.call("/admin/products?q=does-not-exist");
        assert.equal(none.body.pagination.total, 0);
        assert.equal(none.body.summary.total, list.body.summary.total);
        assert.equal(
          (await admin.call("/admin/products?pageSize=101")).status,
          400,
        );
        const p = (
          await post(admin, "/admin/products", {
            name: '=HYPERLINK("unsafe")',
            category: "Accessories",
            featured: true,
            sellingType: "CONTINUOUS",
            status: "PUBLISHED",
            variants: [{ price: "9", onHand: 0 }],
          })
        ).product;
        const p2 = (
          await post(admin, "/admin/products", {
            name: "Reporting product",
            sellingType: "CONTINUOUS",
            status: "PUBLISHED",
            variants: [{ price: "100", onHand: 3 }],
          })
        ).product;
        const sorted = await alice.call("/products?sort=price_asc");
        assert.equal(sorted.body.products[0].id, p.id);
        assert.equal(
          (await alice.call("/products?sort=featured")).body.products[0].id,
          p.id,
        );
        assert(
          (
            await admin.call("/admin/products?stock=sold_out")
          ).body.products.some((x) => x.id === p.id),
        );
        assert(
          (await admin.call("/admin/products?stock=low")).body.products.some(
            (x) => x.id === p2.id,
          ),
        );
        const exported = await admin.call("/admin/products/export?pageSize=1");
        const csv = new TextDecoder().decode(exported.body);
        assert(csv.includes("'="));
        assert(csv.includes("Reporting product"));
        assert.equal(
          (await alice.call("/products/" + p.id)).body.product.id,
          p.id,
        );
        assert.equal((await alice.call("/products/" + product.id)).status, 404);
        const customers = await admin.call("/admin/customers?pageSize=1");
        assert.equal(customers.status, 200, JSON.stringify(customers.body));
        assert.equal(customers.body.customers.length, 1);
        assert.equal(customers.body.pagination.total, 2);
        assert(!JSON.stringify(customers.body).includes("password"));
        const aliceId = (
          await db.user.findUnique({ where: { email: "alice@example.test" } })
        ).id;
        const customer = (await admin.call("/admin/customers/" + aliceId)).body
          .customer;
        const verified = await db.paymentSubmission.aggregate({
          where: { status: "VERIFIED", order: { userId: aliceId } },
          _sum: { amount: true },
        });
        assert.equal(Number(customer.totalSpent), Number(verified._sum.amount));
        assert.equal((await alice.call("/orders/" + order.id)).status, 200);
        assert.equal((await bob.call("/orders/" + order.id)).status, 404);
        const queue = await admin.call("/admin/payment-submissions?pageSize=1");
        assert.equal(queue.status, 200);
        assert(queue.body.pagination.total > 1);
        assert(!JSON.stringify(queue.body).includes("proofKey"));
        const sample = await db.paymentSubmission.findFirst({
          where: { status: "VERIFIED" },
        });
        const boundary = async (timestamp) => {
          const o = await db.order.create({
            data: {
              userId: aliceId,
              idempotencyKey: randomUUID(),
              customerName: "Boundary fixture",
              customerPhone: "0812345678",
              paymentStatus: "PAID",
              initialAmount: "9",
              expiresAt: new Date(Date.now() + 86400000),
              items: {
                create: {
                  variantId: p.variants[0].id,
                  itemDescription: "Reporting fixture",
                  quantity: 1,
                  unitPrice: "9",
                  pickupStatus: "COMPLETED",
                },
              },
            },
          });
          return db.paymentSubmission.create({
            data: {
              orderId: o.id,
              paymentMethodId: method.id,
              methodSnapshot: sample.methodSnapshot,
              amount: "9",
              proofKey: sample.proofKey,
              status: "VERIFIED",
              reviewedBy: adminUser.id,
              reviewedAt: new Date(timestamp),
              submittedAt: new Date(timestamp),
              transactionReference: randomUUID(),
            },
          });
        };
        const s = await boundary("2026-10-01T16:59:59.999Z");
        const dashboard = await admin.call(
          "/admin/dashboard?from=2026-10-01&to=2026-10-01",
        );
        assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
        const expected = await db.paymentSubmission.aggregate({
          where: {
            status: "VERIFIED",
            reviewedAt: {
              gte: new Date("2026-09-30T17:00:00Z"),
              lt: new Date("2026-10-01T17:00:00Z"),
            },
          },
          _sum: { amount: true },
        });
        assert.equal(
          Number(dashboard.body.received),
          Number(expected._sum.amount),
        );
        assert.equal(dashboard.body.series.length, 1);
        assert.equal(
          Number(dashboard.body.series[0].amount),
          Number(dashboard.body.received),
        );
        await boundary("2026-10-01T17:00:00Z");
        const after = await admin.call(
          "/admin/dashboard?from=2026-10-01&to=2026-10-01",
        );
        assert.equal(
          Number(after.body.received),
          Number(dashboard.body.received),
        );
        const all = await admin.call("/admin/dashboard");
        assert.equal(all.status, 200);
        const actual = await db.paymentSubmission.aggregate({
          where: {
            status: "VERIFIED",
            reviewedAt: {
              gte: new Date(all.body.range.from + "T00:00:00+07:00"),
              lt: new Date(
                new Date(all.body.range.to + "T00:00:00+07:00").getTime() +
                  86400000,
              ),
            },
          },
          _sum: { amount: true },
        });
        assert.equal(Number(all.body.received), Number(actual._sum.amount));
        assert.equal(
          all.body.series.reduce((n, x) => n + Number(x.amount), 0),
          Number(all.body.received),
        );
        const neutral = await admin.call(
          "/admin/dashboard?from=2001-01-01&to=2001-01-01",
        );
        assert.equal(neutral.body.changePercent, null);
        assert.equal(neutral.body.received, "0");
        assert.equal(
          (await admin.call("/admin/dashboard?from=2026-10-20&to=2026-10-01"))
            .status,
          400,
        );
        const batches = await admin.call("/admin/batches?pageSize=1");
        assert.equal(batches.status, 200);
        assert.equal(batches.body.batches.length, 1);
        const b = await post(admin, "/admin/batches", {
          productId: batchProduct.id,
          name: "Date validation",
          opensAt: new Date().toISOString(),
          closesAt: new Date(Date.now() + 86400000).toISOString(),
        });
        assert.equal(
          (
            await admin.call("/admin/batches/" + b.batch.id, "PATCH", {
              closesAt: new Date(Date.now() - 86400000).toISOString(),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.call("/admin/batches/" + b.batch.id, "PATCH", {
              closesAt: new Date(Date.now() + 2 * 86400000).toISOString(),
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call("/admin/batches/" + b.batch.id, "PATCH", {
              status: "OPEN",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call("/admin/batches/" + b.batch.id, "PATCH", {
              status: "CLOSED",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call("/admin/batches/" + b.batch.id, "PATCH", {
              closesAt: new Date(Date.now() + 3 * 86400000).toISOString(),
            })
          ).status,
          409,
        );
      },
    );
    await t.test('permanent deletion is admin-only and preserves referenced products', async()=>{
      const draft=(await post(admin,'/admin/products',{name:'Disposable draft',sellingType:'CONTINUOUS',variants:[{price:'1000'}]})).product;
      const path='/admin/products/'+draft.id;
      const guest=new Client();await guest.session();assert.equal((await guest.call(path,'DELETE')).status,401);
      assert.equal((await alice.call(path,'DELETE')).status,403);
      assert.equal((await admin.call(path,'DELETE')).status,204);
      assert.equal(await db.productVariant.count({where:{productId:draft.id}}),0);
      assert.equal((await admin.call(path,'DELETE')).status,404);
      for(const status of ['PUBLISHED','ARCHIVED']){
        const p=(await post(admin,'/admin/products',{name:'Retained '+status,status,sellingType:'CONTINUOUS',variants:[{price:'1000'}]})).product;
        assert.equal((await admin.call('/admin/products/'+p.id,'DELETE')).status,204);
      }
      const stock=(await post(admin,'/admin/products',{name:'Stock history draft',sellingType:'CONTINUOUS',variants:[{price:'1000',onHand:1}]})).product;
      await post(admin,'/admin/variants/'+stock.variants[0].id+'/stock',{onHand:0,reason:'Test adjustment'},200);
      assert.equal((await admin.call('/admin/products/'+stock.id,'DELETE')).status,204);
      await admin.call('/admin/products/'+batchProduct.id,'PATCH',{status:'DRAFT'});
      assert.equal((await admin.call('/admin/products/'+batchProduct.id,'DELETE')).status,409);
      await admin.call('/admin/products/'+product.id,'PATCH',{status:'DRAFT'});
      assert.equal((await admin.call('/admin/products/'+product.id,'DELETE')).status,409);
    });
    await t.test('product deletion cancels unpaid mixed orders, retains snapshots and blocks pending proofs', async()=>{
      const p=(await post(admin,'/admin/products',{name:'Delete pending',status:'PUBLISHED',sellingType:'CONTINUOUS',variants:[{price:'1000',onHand:2}]})).product;
      const purchase=await createOrder(alice,p.variants[0].id);assert.equal(purchase.status,201);
      const deletionMethod=(await post(admin,'/admin/payment-methods',{name:'Deletion QRIS',type:'QRIS',qrImageKey:'https://example.test/qr.png'})).method;
      const submitted=await alice.call(`/orders/${purchase.body.order.id}/proof`,'POST',image,{'content-type':'image/png','x-payment-method':deletionMethod.id});assert.equal(submitted.status,202);
      assert.equal((await admin.call('/admin/products/'+p.id,'DELETE')).status,409);
      assert.match((await admin.call('/admin/products/'+p.id)).body.product.deletionBlockedReason,/pending/i);
      assert.equal((await admin.call('/admin/payment-submissions/'+submitted.body.submission.id+'/review','POST',{action:'REJECTED',reason:'Test proof rejected'})).status,200);
      assert.equal((await admin.call('/admin/products/'+p.id,'DELETE')).status,204);
      const retained=await db.order.findUniqueOrThrow({where:{id:purchase.body.order.id},include:{items:true,paymentSubmissions:true}});
      assert.equal(retained.paymentStatus,'CANCELLED');assert.equal(retained.items[0].variantId,null);assert.equal(retained.items[0].unitPrice.toFixed(2),'1000.00');assert.match(retained.items[0].itemDescription,/Delete pending/);assert.equal(retained.paymentSubmissions[0].status,'REJECTED');
      assert.equal((await alice.call('/orders/'+retained.id)).body.order.total,'1000.00');
      const other=(await post(admin,'/admin/products',{name:'Retained mixed stock',sellingType:'CONTINUOUS',status:'PUBLISHED',variants:[{price:'1000',onHand:1}]})).product;
      const batchP=(await post(admin,'/admin/products',{name:'Delete unpaid jacket',sellingType:'BATCH',status:'PUBLISHED',variants:[{size:'M',price:'2000'}]})).product;
      const window=(await post(admin,'/admin/batches',{productId:batchP.id,name:'Deletion batch',status:'OPEN',opensAt:new Date(Date.now()-60000).toISOString(),closesAt:new Date(Date.now()+86400000).toISOString(),productionWeeks:2})).batch;
      const mixed=await alice.call('/orders','POST',{items:[{variantId:other.variants[0].id,quantity:1},{variantId:batchP.variants[0].id,batchId:window.id,quantity:1,embroideryName:'Ada'}],customerName:'Student Buyer',customerPhone:'081234567890'},{'idempotency-key':randomUUID()});assert.equal(mixed.status,201);
      assert.equal((await admin.call('/admin/batches/'+window.id,'PATCH',{status:'CLOSED'})).status,200);
      assert.equal((await admin.call('/admin/batches/'+window.id+'/receive','POST',{items:[{variantId:batchP.variants[0].id,quantity:2}],reason:'Deletion test receipt'})).status,200);
      assert.equal((await admin.call('/admin/products/'+batchP.id,'DELETE')).status,204);
      const receipt=await db.inventoryMovement.findFirstOrThrow({where:{variantSku:batchP.variants[0].sku,type:'RECEIPT'}});assert.equal(receipt.batchId,null);assert.equal(receipt.variantId,null);assert.equal(receipt.onHandDelta,2);
      const order=await db.order.findUniqueOrThrow({where:{id:mixed.body.order.id},include:{items:true}});assert.equal(order.paymentStatus,'CANCELLED');assert(order.items.every(i=>i.pickupStatus==='CANCELLED'));assert.equal(order.items.find(i=>i.embroideryName==='Ada').variantId,null);assert.equal(order.items.find(i=>i.embroideryName==='Ada').batchId,null);
      assert.equal((await db.productVariant.findUniqueOrThrow({where:{id:other.variants[0].id}})).reserved,0);
      const history=await db.inventoryMovement.findFirstOrThrow({where:{variantSku:p.variants[0].sku}});assert.equal(history.variantId,null);await assert.rejects(()=>db.inventoryMovement.update({where:{id:history.id},data:{reason:'tamper'}}));
    });
    await t.test('variant deletion protects history and the last variant',async()=>{
      const p=(await post(admin,'/admin/products',{name:'Variant deletion',sellingType:'CONTINUOUS',variants:[{size:'M',price:'1000'},{size:'L',price:'1000'}]})).product;
      const path='/admin/variants/'+p.variants[0].id;
      assert.equal((await alice.call(path,'DELETE')).status,403);
      const guest=new Client();await guest.session();assert.equal((await guest.call(path,'DELETE')).status,401);
      assert.equal((await admin.call(path,'DELETE')).status,204);
      assert.equal((await admin.call(path,'DELETE')).status,404);
      assert.equal((await admin.call('/admin/variants/'+p.variants[1].id,'DELETE')).status,409);
      const stock=(await post(admin,'/admin/products/'+p.id+'/variants',{size:'XL',price:'1000',onHand:1})).variant;
      assert.equal((await admin.call('/admin/variants/'+stock.id,'DELETE')).status,204);
      const preserved=await db.inventoryMovement.findFirst({where:{variantSku:stock.sku}});assert.equal(preserved.variantId,null);assert.equal(preserved.onHandDelta,1);
      await assert.rejects(()=>db.inventoryMovement.update({where:{id:preserved.id},data:{reason:'Tampering'}}));
      await assert.rejects(()=>db.inventoryMovement.delete({where:{id:preserved.id}}));
      const race=(await post(admin,'/admin/products',{name:'Concurrent variant deletion',sellingType:'CONTINUOUS',variants:[{size:'M',price:'1000'},{size:'L',price:'1000'}]})).product;
      const results=await Promise.all(race.variants.map(v=>admin.call('/admin/variants/'+v.id,'DELETE')));
      assert.deepEqual(results.map(r=>r.status).sort(),[204,409]);
      assert.equal(await db.productVariant.count({where:{productId:race.id}}),1);
    });
    await t.test('separate optional type, color and size combinations',async()=>{
      const p=(await post(admin,'/admin/products',{name:'Physics bag',optionLabel:'Type',sellingType:'CONTINUOUS',status:'PUBLISHED',variants:[{color:'Black',type:'Physics',price:'15000',onHand:2},{color:'Black',type:'Computer Science',price:'15000'}]})).product;
      assert.equal(p.variants[0].size,'STANDARD');assert.equal(p.optionLabel,undefined);
      assert.equal((await alice.call('/products/'+p.id)).body.product.variants[0].type,p.variants[0].type);
      assert.equal((await admin.call('/admin/products/'+p.id+'/variants','POST',{color:' black ',type:' physics ',price:'15000'})).status,409);
      const blank=(await post(admin,'/admin/products/'+p.id+'/variants',{price:'1000'})).variant;
      assert.equal(blank.color,'STANDARD');assert.equal(blank.size,'STANDARD');assert.equal(blank.type,'STANDARD');
      const onlyType=(await post(admin,'/admin/products/'+p.id+'/variants',{type:'Chemistry',price:'1000'})).variant;
      assert.equal(onlyType.color,'STANDARD');assert.equal(onlyType.type,'CHEMISTRY');
      const o=await createOrder(alice,p.variants.find(v=>v.type==='PHYSICS').id);assert.equal(o.status,201);assert.match(o.body.order.items[0].itemDescription,/BLACK \/ PHYSICS/);
    });
    await t.test('edit unused variant options without changing SKU or stock',async()=>{
      const p=(await post(admin,'/admin/products',{name:'Editable options',sellingType:'CONTINUOUS',status:'PUBLISHED',variants:[{color:'Black',price:'1000',onHand:3},{color:'White',price:'1000'}]})).product;
      const v=p.variants.find(x=>x.color==='BLACK'), path='/admin/variants/'+v.id;
      assert.equal((await alice.call(path,'PATCH',{color:'Red'})).status,403);
      let r=await admin.call(path,'PATCH',{size:' m ',color:' navy ',type:' physics '});assert.equal(r.status,200);assert.equal(r.body.variant.sku,v.sku);assert.equal(r.body.variant.onHand,3);assert.equal(r.body.variant.size,'M');assert.equal(r.body.variant.type,'PHYSICS');
      assert.equal((await admin.call(path,'PATCH',{size:'',color:'White',type:''})).status,409);
      const order=await createOrder(alice,v.id);assert.equal(order.status,201);
      const before=order.body.order.items[0].itemDescription;
      assert.equal((await admin.call(path,'PATCH',{color:'Red'})).status,409);
      assert.equal((await admin.call(path,'PATCH',{size:'M',color:'NAVY',type:'PHYSICS',price:'1200'})).status,200);
      const loaded=(await admin.call('/admin/products/'+p.id)).body.product;assert.equal(loaded.variants.find(x=>x.id===v.id).hasOrderHistory,true);
      await alice.call('/orders/'+order.body.order.id+'/cancel','POST');assert.equal((await admin.call(path,'PATCH',{type:'Chemistry'})).status,409);
      assert.equal((await alice.call('/orders/'+order.body.order.id)).body.order.items[0].itemDescription,before);
      assert.equal((await admin.call('/admin/variants/'+batchProduct.variants[0].id,'PATCH',{size:''})).status,409);
    });
    await t.test('independent announcements, schedules and admin authorization',async()=>{
      const payload={title:'Campus pickup',body:'Collect at TEST location, 10:00–12:00.',published:true};
      assert.equal((await alice.call('/admin/announcements','POST',payload)).status,403);
      const a=(await post(admin,'/admin/announcements',payload)).announcement;
      assert((await alice.call('/announcements')).body.announcements.some(x=>x.id===a.id));
      await admin.call('/admin/announcements/'+a.id,'PATCH',{...payload,body:'Updated pickup time'});
      assert.equal((await alice.call('/announcements')).body.announcements.find(x=>x.id===a.id).body,'Updated pickup time');
      const future=(await post(admin,'/admin/announcements',{...payload,startsAt:new Date(Date.now()+3600000).toISOString()})).announcement;
      assert(!(await alice.call('/announcements')).body.announcements.some(x=>x.id===future.id));
      const expired=(await post(admin,'/admin/announcements',{...payload,endsAt:new Date(Date.now()-1000).toISOString()})).announcement;
      assert(!(await alice.call('/announcements')).body.announcements.some(x=>x.id===expired.id));
      assert.equal((await admin.call('/admin/announcements','POST',{...payload,startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date().toISOString()})).status,400);
      await admin.call('/admin/announcements/'+a.id,'PATCH',{...payload,published:false});
      assert(!(await alice.call('/announcements')).body.announcements.some(x=>x.id===a.id));
      assert.equal((await admin.call('/admin/announcements/'+a.id,'DELETE')).status,204);
    });
    await t.test('non-personalized batch products, multiple open batches and reference-free approval',async()=>{
      const p=(await post(admin,'/admin/products',{name:'Plain batch shirt',sellingType:'BATCH',embroideryRequired:false,status:'PUBLISHED',variants:[{price:'12345.67'}]})).product;
      assert.equal(p.embroideryRequired,false);
      assert.equal((await admin.call("/admin/products/"+p.id,"PATCH",{name:"Plain batch shirt renamed"})).body.product.embroideryRequired,false);
      assert.equal((await admin.call('/admin/products','POST',{name:'Invalid batch stock',sellingType:'BATCH',variants:[{size:'M',price:'1000',onHand:1}]})).status,400);
      const window={productId:p.id,status:'OPEN',opensAt:new Date(Date.now()-1000).toISOString(),closesAt:new Date(Date.now()+86400000).toISOString()};
      const first=(await post(admin,'/admin/batches',{...window,name:'First'})).batch;
      const second=(await post(admin,'/admin/batches',{...window,name:'Second'})).batch;
      const detail=(await alice.call('/products/'+p.id)).body.product;
      assert.equal(detail.batches.length,2);
      const batches=(await admin.call('/admin/batches?pageSize=100')).body.batches;
      assert.equal(batches.find(b=>b.id===first.id).product.fromPrice,'12345.67');
      const o=await createOrder(alice,p.variants[0].id,1,second.id);assert.equal(o.status,201);assert.equal(o.body.order.items[0].embroideryName,null);assert.equal(o.body.order.items[0].batchId,second.id);
      await db.paymentMethod.update({where:{id:method.id},data:{enabled:true}});
      const uploaded=await proof(alice,o.body.order.id);assert.equal(uploaded.status,202,JSON.stringify(uploaded.body));
      const submission=uploaded.body.submission;
      const approved=await admin.call('/admin/payment-submissions/'+submission.id+'/review','POST',{action:'VERIFIED'});assert.equal(approved.status,200,JSON.stringify(approved.body));
      assert.equal((await alice.call('/orders/'+o.body.order.id)).body.order.paymentStatus,'PAID');
      assert.equal((await admin.call('/admin/batches/'+second.id,'PATCH',{status:'CLOSED'})).status,200);
      assert.equal((await admin.call('/admin/batches/'+second.id,'PATCH',{status:'IN_PRODUCTION'})).status,200);
      assert.equal((await createOrder(alice,p.variants[0].id,1,first.id)).status,201);
    });
    await t.test("admin uploads, public immutable media, product galleries and QRIS snapshots", async () => {
      const binary = await sharp({ create: { width: 120, height: 100, channels: 3, background: "#00552e" } }).png().toBuffer();
      const headers = { "content-type": "image/png", "x-image-purpose": "product" };
      assert.equal((await alice.call("/admin/images", "POST", binary, headers)).status, 403);
      assert.equal((await admin.call("/admin/images", "POST", Buffer.from("not a valid image file"), headers)).status, 400);
      assert.equal((await admin.call("/admin/images", "POST", binary, { ...headers, "x-csrf-token": "wrong" })).status, 403);
      assert.equal((await admin.call("/admin/images", "POST", Buffer.alloc(10 * 1024 * 1024 + 1), headers)).status, 413);
      const first = await admin.call("/admin/images", "POST", binary, headers);
      assert.equal(first.status, 201, JSON.stringify(first.body));
      const second = await admin.call("/admin/images", "POST", binary, headers);
      const urls = [first.body.image.url, second.body.image.url];
      assert.match(urls[0], /^\/api\/media\/product-[0-9a-f-]+\.webp$/);
      const media = await fetch(`http://localhost:${port}${urls[0]}`);
      assert.equal(media.status, 200);assert.match(media.headers.get("content-type"), /image\/webp/);assert.match(media.headers.get("cache-control"), /immutable/);
      assert.equal((await sharp(Buffer.from(await media.arrayBuffer())).metadata()).format, "webp");
      assert.equal((await fetch(`http://localhost:${port}/api/media/not-an-upload.png`)).status, 404);
      const p = (await post(admin, "/admin/products", { name: "Gallery fixture", sellingType: "CONTINUOUS", status: "PUBLISHED", imageKeys: urls, variants: [{ price: "12000", onHand: 1 }] })).product;
      assert.deepEqual(p.imageKeys, urls);assert.equal(p.imageKey, urls[0]);
      const edited = await admin.call("/admin/products/"+p.id, "PATCH", { imageKeys: urls.toReversed() });
      assert.equal(edited.body.product.imageKey, urls[1]);assert.deepEqual(edited.body.product.imageKeys, urls.toReversed());
      assert.deepEqual((await alice.call("/products/"+p.id)).body.product.imageKeys, urls.toReversed());
      assert.equal((await admin.call("/admin/products/"+p.id,"PATCH",{imageKeys:Array(9).fill(urls[0])})).status,400);
      assert.equal((await admin.call("/admin/products/"+p.id,"PATCH",{imageKeys:["/api/media/product-00000000-0000-0000-0000-000000000000.webp"]})).status,400);
      const qr = await admin.call("/admin/images", "POST", binary, { ...headers, "x-image-purpose": "qris" });assert.equal(qr.status,201);
      const qrUrl=qr.body.image.url;assert.match(qrUrl,/qris-.*\.png$/);
      const method=(await post(admin,"/admin/payment-methods",{name:"Uploaded QRIS",type:"QRIS",qrImageKey:qrUrl})).method;
      assert.equal(method.qrImageKey,qrUrl);
      const purchase=await createOrder(alice,p.variants[0].id);assert.equal(purchase.status,201);
      const sent=await alice.call(`/orders/${purchase.body.order.id}/proof`,"POST",binary,{"content-type":"image/png","x-payment-method":method.id});assert.equal(sent.status,202);
      assert.equal((await admin.call("/admin/payment-methods/"+method.id,"PATCH",{enabled:false})).status,200);
      const snapshot=await db.paymentSubmission.findUniqueOrThrow({where:{id:sent.body.submission.id}});assert.equal(snapshot.methodSnapshot.qrImageKey,qrUrl);
      assert.equal((await fetch(`http://localhost:${port}${qrUrl}`)).status,200);

      assert.equal((await admin.call("/admin/products/"+p.id,"PATCH",{imageKeys:[qrUrl]})).status,400);
      assert.equal((await admin.call("/admin/payment-methods","POST",{name:"Wrong asset",type:"QRIS",qrImageKey:urls[0]})).status,400);
      const cleared=await admin.call("/admin/products/"+p.id,"PATCH",{imageKeys:[]});assert.equal(cleared.body.product.imageKey,null);assert.deepEqual(cleared.body.product.imageKeys,[]);
      // Removal from a gallery never removes a file another record or historical snapshot may reference.
      assert.equal((await fetch(`http://localhost:${port}${urls[0]}`)).status,200);
      const legacy=await admin.call("/admin/products/"+p.id,"PATCH",{imageKey:"https://example.test/legacy.jpg"});assert.deepEqual(legacy.body.product.imageKeys,["https://example.test/legacy.jpg"]);
    });
  },
);
