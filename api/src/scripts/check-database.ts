import dotenv from "dotenv";
import { Pool } from "pg";
dotenv.config({ path: "../.env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const expectedTables = ["users", "products", "product_variants", "batches", "orders", "order_items", "payment_methods", "payment_submissions", "inventory_movements", "session"];
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const present = new Set(tables.rows.map(row => row.table_name));
    const missing = expectedTables.filter(table => !present.has(table));
    const migrations = present.has("_prisma_migrations") ? (await client.query(`SELECT migration_name, finished_at IS NOT NULL AS completed, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at`)).rows : [];
    console.log(JSON.stringify({ missingTables: missing, migrations }, null, 2));
    if (missing.length || migrations.some(row => !row.completed && !row.rolled_back)) process.exitCode = 1;
    else {
      const checks = await client.query(`
        SELECT 'variant_inventory' AS check_name, COUNT(*)::int AS violations FROM product_variants WHERE on_hand < 0 OR reserved < 0 OR reserved > on_hand
        UNION ALL
        SELECT 'order_product_mode', COUNT(*)::int FROM order_items i JOIN orders o ON o.id=i.order_id JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN batches b ON b.id=o.batch_id
        WHERE (o.batch_id IS NULL AND p.selling_type <> 'CONTINUOUS') OR (o.batch_id IS NOT NULL AND (p.selling_type <> 'BATCH' OR b.product_id <> p.id))
        UNION ALL
        SELECT 'embroidery_name', COUNT(*)::int FROM order_items i JOIN orders o ON o.id=i.order_id WHERE (o.batch_id IS NOT NULL AND COALESCE(length(trim(i.embroidery_name)),0)=0) OR (o.batch_id IS NULL AND i.embroidery_name IS NOT NULL)
        UNION ALL
        SELECT 'inventory_ledger', COUNT(*)::int FROM product_variants v LEFT JOIN (SELECT variant_id,SUM(on_hand_delta) AS physical,SUM(reserved_delta) AS held FROM inventory_movements GROUP BY variant_id) m ON m.variant_id=v.id WHERE v.on_hand <> COALESCE(m.physical,0) OR v.reserved <> COALESCE(m.held,0)
        UNION ALL
        SELECT 'verified_order', COUNT(*)::int FROM orders o WHERE (payment_status='PAID') <> EXISTS(SELECT 1 FROM payment_submissions s WHERE s.order_id=o.id AND s.status='VERIFIED')
        UNION ALL
        SELECT 'roles', COUNT(*)::int FROM users WHERE role::text NOT IN ('ADMIN','CUSTOMER')
      `);
      console.log(JSON.stringify({ integrityChecks: checks.rows }, null, 2));
      if (checks.rows.some(row => row.violations > 0)) process.exitCode = 1;
    }
    await client.query("ROLLBACK");
  } finally { client.release(); }
} catch (error) {
  console.error("Database check failed", { code: (error as { code?: string }).code ?? "UNKNOWN" }); process.exitCode = 1;
} finally { await pool.end(); }
