import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../api/dist/generated/prisma/client.js";
import { move } from "../api/dist/store-service.js";
import { generateSku } from "../api/dist/catalog.js";
import argon2 from "argon2";
import concurrently from "concurrently";

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), "..");
process.chdir(root);
const directory = path.join(root, "api/storage/e2e");
const envFile = path.join(root, ".env.e2e");
const pidFile = path.join(directory, "server.json");
const databaseName = "ekraf_manual_e2e_test";
const origin = "http://127.0.0.1:5187";
const privatePath = "ekraf-test-admin-panel";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=", "base64");
function environment() {
  if (!existsSync(envFile)) throw new Error("Run npm run e2e:prepare first.");
  const env = parseEnv(readFileSync(envFile, "utf8"));
  const url = new URL(env.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/" + databaseName)
    throw new Error("Refusing to use a database outside the dedicated local test environment.");
  return { ...process.env, ...env, NODE_ENV: "development" };
}
function connection(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  return { pool, db: new PrismaClient({ adapter: new PrismaPg(pool) }) };
}
function addresses(env) {
  console.log(`Customer: ${origin}`);
  console.log(`Admin: ${origin}/${env.ADMIN_PANEL_PATH}`);
  console.log(`Admin login: ${env.E2E_ADMIN_EMAIL}`);
  console.log(`Customer login: ${env.E2E_CUSTOMER_EMAIL}`);
  console.log(`Other customer: customer2@example.test; legacy account: legacy@example.test`);
  console.log(`Test-only password for these accounts: ${env.E2E_PASSWORD}`);
  console.log("Payments are simulated. Never send real money. See docs/E2E-TESTING.md.");
}
async function prepare() {
  const source = parseEnv(readFileSync(path.join(root, ".env"), "utf8"));
  const target = new URL(source.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname === "/" + databaseName)
    throw new Error("The normal database must be a different local database.");
  mkdirSync(directory, { recursive: true });
  const adminPool = new Pool({ connectionString: source.DATABASE_URL });
  try {
    const result = await adminPool.query("SELECT 1 FROM pg_database WHERE datname=$1", [databaseName]);
    if (result.rowCount && !existsSync(envFile)) throw new Error("Test database already exists without its environment file; refusing to adopt it.");
    if (!result.rowCount) await adminPool.query('CREATE DATABASE "ekraf_manual_e2e_test"');
  } finally { await adminPool.end(); }
  if (!existsSync(envFile)) {
    target.pathname = "/" + databaseName;
    const env = {
      DATABASE_URL: target.toString(), SESSION_SECRET: randomBytes(32).toString("hex"), SESSION_COOKIE_NAME: "ekraf.e2e.sid",
      API_HOST: "127.0.0.1", API_PORT: "3919", FRONTEND_ORIGIN: origin, API_INTERNAL_ORIGIN: "http://127.0.0.1:3919",
      ADMIN_PANEL_PATH: privatePath, RECEIPT_STORAGE_DIR: path.join(directory, "receipts").replaceAll("\\", "/"),
      NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_E2E_MODE: "true", ALLOWED_DEV_ORIGINS: "127.0.0.1",
      ALLOW_ADMIN_BOOTSTRAP: "false", ADMIN_BOOTSTRAP_TOKEN: "", NODE_ENV: "development",
      E2E_ADMIN_EMAIL: "admin@example.test", E2E_CUSTOMER_EMAIL: "customer@example.test", E2E_PASSWORD: "Test-"+randomBytes(12).toString("hex")+"!9aA",
    };
    writeFileSync(envFile, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n")+"\n", { mode: 0o600 });
  }
  const env = environment();
  execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: path.join(root,"api"), env, stdio: "inherit" });
  mkdirSync(env.RECEIPT_STORAGE_DIR, { recursive: true });
  writeFileSync(path.join(directory, "sample-proof.png"), png);
  const assets = path.join(root, "web/public/test-fixtures");
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, "non-payable-qris.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="white"/><rect x="12" y="12" width="376" height="376" fill="none" stroke="#00552e" stroke-width="4"/><text x="200" y="160" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#00552e">TEST QRIS</text><text x="200" y="215" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#a02020">NOT PAYABLE</text><text x="200" y="265" text-anchor="middle" font-family="sans-serif" font-size="16">Use the sample proof without paying</text></svg>');
  const { pool, db } = connection(env.DATABASE_URL);
  try {
    if (await db.user.count()) {
      console.log("Existing test data retained; prepare never resets your test orders.");
    } else {
      const passwordHash = await argon2.hash(env.E2E_PASSWORD, { type: argon2.argon2id });
      await db.$transaction(async tx => {
        const admin = await tx.user.create({ data: { name:"TEST Admin", email:env.E2E_ADMIN_EMAIL, phone:"080000000001", role:"ADMIN", passwordHash } });
        const customer = await tx.user.create({ data: { name:"TEST Customer", email:env.E2E_CUSTOMER_EMAIL, phone:"080000000002", passwordHash } });
        await tx.user.create({ data: { name:"TEST Other Customer", email:"customer2@example.test", phone:"080000000003", passwordHash } });
        await tx.user.create({ data: { name:"TEST Legacy Customer", email:"legacy@example.test", passwordHash } });
        async function product(name, category, sellingType, variants, status="PUBLISHED") {
          const p = await tx.product.create({ data:{ name,category,sellingType,status,description:"TEST DATA — for local full-flow checks only.",featured:true } });
          const result=[];
          for (const input of variants) {
            const { stock=0,...options }=input;
            const v=await tx.productVariant.create({data:{productId:p.id,sku:generateSku(),size:"STANDARD",color:"STANDARD",type:"STANDARD",...options}});
            if(stock)await move(tx,{variantId:v.id,actorId:admin.id,type:"ADJUSTMENT",onHandDelta:stock,reservedDelta:0,reason:"TEST initial stock"});
            result.push(v);
          }
          return { ...p, variants: result };
        }
        await product("TEST Everyday Tee","T-shirt","CONTINUOUS",[
          {size:"M",color:"BLACK",price:"85000",stock:10},{size:"L",color:"BLACK",price:"85000",stock:8},{size:"M",color:"WHITE",price:"85000",stock:5},
        ]);
        const keychain=await product("TEST Department Keychain","Accessories","CONTINUOUS",[
          {type:"PHYSICS",price:"12001.01",stock:5},{type:"COMPUTER SCIENCE",price:"12001.01",stock:3},{type:"CHEMISTRY",price:"12001.01",stock:0},
        ]);
        await product("TEST Tote Bag","Tote Bag","CONTINUOUS",[{color:"BLACK",price:"55000",stock:3},{color:"WHITE",price:"55000",stock:2}]);
        await product("TEST Sticker","Accessories","CONTINUOUS",[{price:"10000",stock:10}]);
        const jacket=await product("TEST Faculty Jacket","Faculty Jacket","BATCH",[{size:"S",price:"265000"},{size:"M",price:"265000"},{size:"L",price:"275000"}]);
        await product("TEST Unused Draft","Accessories","CONTINUOUS",[{price:"10000"}],"DRAFT");
        const now=Date.now(),day=86400000;
        await tx.batch.create({data:{productId:jacket.id,name:"TEST Open Batch",status:"OPEN",opensAt:new Date(now-3600000),closesAt:new Date(now+7*day),productionWeeks:4,announcement:"TEST batch open — simulated checkout, no real payment."}});
        await tx.batch.create({data:{productId:jacket.id,name:"TEST Next Batch",status:"DRAFT",opensAt:new Date(now+day),closesAt:new Date(now+14*day),productionWeeks:4}});
        await tx.batch.create({data:{productId:jacket.id,name:"TEST Expired Window",status:"OPEN",opensAt:new Date(now-7*day),closesAt:new Date(now-day),productionWeeks:4}});
        await tx.paymentMethod.create({data:{name:"TEST Bank — DO NOT PAY",type:"BANK_TRANSFER",bankName:"TEST BANK",accountName:"TEST ONLY — NO TRANSFER",accountNumber:"0000000000",instructions:"Simulated payment only. Do not transfer money. Upload api/storage/e2e/sample-proof.png, then verify it in the test admin panel."}});
        await tx.paymentMethod.create({data:{name:"TEST QRIS — NOT PAYABLE",type:"QRIS",qrImageKey:"/test-fixtures/non-payable-qris.svg",instructions:"This is not a payment QR. Upload the sample proof without sending money."}});
        const v=keychain.variants[0];
        const overdue=await tx.order.create({data:{userId:customer.id,customerName:customer.name,customerPhone:customer.phone,initialAmount:v.price,idempotencyKey:randomUUID(),createdAt:new Date(now-25*3600000),expiresAt:new Date(now-3600000),items:{create:{variantId:v.id,itemDescription:"TEST overdue keychain — expiry worker fixture",unitPrice:v.price,quantity:1}}},include:{items:true}});
        await move(tx,{variantId:v.id,orderId:overdue.id,orderItemId:overdue.items[0].id,type:"RESERVATION",onHandDelta:0,reservedDelta:1,reason:"TEST overdue reservation — released by expiry worker"});
      }, { timeout:15000 });
      console.log("Seeded 4 accounts, 6 products, 3 batches, 2 non-payable methods, and 1 overdue-order fixture.");
    }
  } finally { await db.$disconnect(); await pool.end(); }
  addresses(env);
}
async function check() {
  const env = environment();
  const health = await fetch(origin+"/api/health");
  if (!health.ok) throw new Error("Test API/database health check failed.");
  const html = await (await fetch(origin)).text();
  if (!html.includes("TEST STORE")) throw new Error("Test banner is missing; check the test frontend configuration.");
  async function login(endpoint, email) {
    const csrfResponse = await fetch(origin+"/api/csrf");
    const initialCookie = csrfResponse.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
    if (!initialCookie.startsWith("ekraf.e2e.sid=")) throw new Error("Test session cookie isolation failed.");
    const { token } = await csrfResponse.json();
    const response = await fetch(origin+endpoint, { method:"POST", headers:{"Content-Type":"application/json",Origin:origin,Cookie:initialCookie,"X-CSRF-Token":token},body:JSON.stringify({email,password:env.E2E_PASSWORD}) });
    if (!response.ok) throw new Error("Test account sign-in failed for "+email);
    return response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  }
  const admin = await login("/api/admin/login",env.E2E_ADMIN_EMAIL);
  const customer = await login("/api/auth/login",env.E2E_CUSTOMER_EMAIL);
  const catalog = await fetch(origin+"/api/admin/products",{headers:{Cookie:admin}});
  if (!catalog.ok) throw new Error("Admin cannot access the test catalog.");
  if ((await fetch(origin+"/api/admin/products",{headers:{Cookie:customer}})).status!==403) throw new Error("Customer admin-isolation check failed.");
  const proof=path.join(directory,"sample-proof.png");
  if(!existsSync(proof))throw new Error("Sample proof is missing.");
  console.log("Ready: test banner, isolated cookie, database, admin/customer sign-in, catalog, and customer access restrictions verified.");
}
async function freePort(port) {
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",()=>reject(new Error(`Port ${port} is already in use; existing processes were left untouched.`)));server.listen(port,"127.0.0.1",()=>server.close(resolve));});
}
function alive(pid) { try{process.kill(pid,0);return true;}catch{return false;} }
async function dev() {
  const env=environment();
  await Promise.all([freePort(3919),freePort(5187)]);
  const { result }=concurrently([
    {name:"test-api",command:"node ../node_modules/tsx/dist/cli.mjs watch src/index.ts",cwd:path.join(root,"api"),env},
    {name:"test-web",command:"node ../node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 5187",cwd:path.join(root,"web"),env},
  ],{killOthersOn:["failure","success"],prefix:"name"});
  addresses(env);await result;
}
async function start() {
  const env=environment();
  if(existsSync(pidFile)){const state=JSON.parse(readFileSync(pidFile,"utf8"));if(alive(state.pid)){console.log("Test environment already running.");addresses(env);return;}}
  await Promise.all([freePort(3919),freePort(5187)]);
  const log=openSync(path.join(directory,"server.log"),"a");
  const child=spawn(process.execPath,[script,"dev"],{cwd:root,detached:true,windowsHide:true,stdio:["ignore",log,log]});
  child.unref();closeSync(log);writeFileSync(pidFile,JSON.stringify({pid:child.pid,script}));
  for(let attempt=0;attempt<90;attempt++){
    if(!alive(child.pid))throw new Error("Test server stopped. Read api/storage/e2e/server.log.");
    try{const [api,web]=await Promise.all([fetch("http://127.0.0.1:3919/api/health",{signal:AbortSignal.timeout(2000)}),fetch(origin,{signal:AbortSignal.timeout(5000)})]);if(api.ok&&web.ok){addresses(env);return;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error("Startup timed out. Check api/storage/e2e/server.log; npm run e2e:stop stops only this test environment.");
}
function stop() {
  if(!existsSync(pidFile)){console.log("No managed test environment is running.");return;}
  const {pid}=JSON.parse(readFileSync(pidFile,"utf8"));
  if(alive(pid)){
    const command=process.platform==="win32" ? execFileSync("powershell.exe",["-NoProfile","-Command",`(Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}').CommandLine`],{encoding:"utf8"}) : execFileSync("ps",["-p",String(pid),"-o","args="],{encoding:"utf8"});
    if(!command.toLowerCase().includes(script.toLowerCase())||!command.includes("dev"))throw new Error("Recorded PID belongs to another process; refusing to stop it.");
    if(process.platform==="win32")execFileSync("taskkill",["/PID",String(pid),"/T","/F"],{stdio:"pipe"});else process.kill(-pid,"SIGTERM");
  }
  unlinkSync(pidFile);console.log("Test servers stopped. Test data retained.");
}
try {
  switch(process.argv[2]){
    case "prepare": await prepare();break;
    case "start": await start();break;
    case "dev": await dev();break;
    case "stop": stop();break;
    case "info": addresses(environment());break;
    case "check": await check();break;
    default: throw new Error("Use prepare, start, dev, stop, info, or check.");
  }
} catch(error) { console.error(error instanceof Error ? error.message : "Test environment failed.");process.exitCode=1; }
