import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../dist/generated/prisma/client.js';
import { expireOrders } from '../../dist/store-service.js';

const target = process.env.TEST_DATABASE_URL;
test('minimal EKRAF store integration', { skip: !target, timeout: 90000 }, async t => {
  const url = new URL(target);
  assert(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.endsWith('_test'), 'Use a dedicated local database ending in _test');
  const pool = new Pool({ connectionString: target });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  let server;
  t.after(async()=>{ server?.kill(); await db.$disconnect(); await pool.end(); });
  assert.equal(await db.user.count(),0,'Integration database must be empty');
  const port = 3917;
  server = spawn(process.execPath,['dist/index.js'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: target, API_PORT: String(port), NODE_ENV: 'test', SESSION_SECRET: 'integration-session-secret-at-least-32-characters', ALLOW_ADMIN_BOOTSTRAP: 'false', RECEIPT_STORAGE_DIR: 'storage/integration-receipts' }, stdio: ['ignore','pipe','pipe'] });
  let logs=''; server.stdout.on('data',data=>{logs+=data;}); server.stderr.on('data',data=>{logs+=data;});
  for(let i=0;i<100;i++) { try { if((await fetch(`http://localhost:${port}/api/health`)).ok)break; } catch {} if(i===99)throw Error(logs); await delay(100); }
  class Client {
    cookie=''; csrf='';
    async call(route, method='GET', data, headers={}) {
      const init={ method, headers: { cookie:this.cookie, ...(method==='GET'?{}:{'x-csrf-token':this.csrf}), ...headers } };
      if(data!==undefined) { if(Buffer.isBuffer(data))init.body=data; else { init.body=JSON.stringify(data);init.headers['content-type']='application/json'; } }
      const r=await fetch(`http://localhost:${port}/api${route}`,init);
      const cookies=r.headers.getSetCookie(); if(cookies.length)this.cookie=cookies.map(s=>s.split(';')[0]).join('; ');
      const body=r.headers.get('content-type')?.includes('application/json')?await r.json():await r.arrayBuffer();
      return { status:r.status,body };
    }
    async session(){const r=await this.call('/csrf');this.csrf=r.body.token;}
    async register(label){await this.session();const r=await this.call('/auth/register','POST',{name:label,email:`${label}@example.test`,password:'test-password-12345',role:'ADMIN'});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.user.role,'CUSTOMER');await this.session();return r.body.user;}
  }
  const admin=new Client(), alice=new Client(), bob=new Client();
  const adminUser=await admin.register('admin');
  await db.user.update({where:{id:adminUser.id},data:{role:'ADMIN'}});
  await alice.register('alice'); await bob.register('bob');
  const post=async(client,route,data,expected=201)=>{const r=await client.call(route,'POST',data);assert.equal(r.status,expected,JSON.stringify(r.body));return r.body;};
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=','base64');
  let product,batchProduct,method,order,submission;
  const createOrder=(client,variantId,quantity=1,batchId=null,embroideryName)=>client.call('/orders','POST',{items:[{variantId,quantity,...(embroideryName?{embroideryName}:{})}],batchId,customerName:'Student Buyer',customerPhone:'081234567890'},{'idempotency-key':randomUUID()});
  const proof=(client,orderId)=>client.call(`/orders/${orderId}/proof`,'POST',image,{'content-type':'image/png','x-payment-method':method.id});
  await t.test('two roles and admin-only settings',async()=>{
    assert.equal((await alice.call('/admin/products')).status,403);
    assert.equal((await alice.call('/admin/payment-methods','POST',{})).status,403);
    const roles=await pool.query("SELECT unnest(enum_range(NULL::roles))::text AS value");
    assert.deepEqual(roles.rows.map(r=>r.value),['CUSTOMER','ADMIN']);
    method=(await post(admin,'/admin/payment-methods',{name:'Organization test bank',type:'BANK_TRANSFER',bankName:'Test Bank',accountName:'EKRAF',accountNumber:'12345'})).method;
    assert.equal((await admin.call('/admin/payment-methods','POST',{name:'Invalid QR',type:'QRIS'})).status,400);
  });
  await t.test('stock, SKU uniqueness and concurrent oversell prevention',async()=>{
    product=(await post(admin,'/admin/products',{name:'Merchandise',sellingType:'CONTINUOUS',status:'PUBLISHED',variants:[{sku:'TEE-ONE',price:'85000',onHand:2}]})).product;
    assert.equal(product.variants[0].size,'STANDARD');
    assert.equal((await admin.call(`/admin/products/${product.id}/variants`,'POST',{sku:'TEE-DUP',price:'85000'})).status,409);
    const results=await Promise.all([createOrder(alice,product.variants[0].id,2),createOrder(bob,product.variants[0].id,2)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    const winner=results.findIndex(r=>r.status===201); const buyer=winner===0?alice:bob;
    const held=results[winner].body.order;assert.equal(held.total,'170000.00');
    assert.equal((await buyer.call(`/orders/${held.id}/cancel`,'POST')).status,200);
    assert.equal((await db.productVariant.findUnique({where:{id:product.variants[0].id}})).reserved,0);
    const key=randomUUID(); const data={items:[{variantId:product.variants[0].id,quantity:1}],customerName:'Alice Student',customerPhone:'0812345678'};
    const first=await alice.call('/orders','POST',data,{'idempotency-key':key});
    const retry=await alice.call('/orders','POST',data,{'idempotency-key':key});
    assert.equal(first.body.order.id,retry.body.order.id);order=first.body.order;
  });
  await t.test('receipt privacy, rejection, resubmission, approval and immutable history',async()=>{
    assert.equal((await alice.call(`/orders/${order.id}/proof`,'POST',Buffer.from('not an image'),{'content-type':'image/png','x-payment-method':method.id})).status,400);
    const r=await proof(alice,order.id);assert.equal(r.status,202,JSON.stringify(r.body));submission=r.body.submission;
    assert.equal((await bob.call(`/payment-submissions/${submission.id}/proof`)).status,404);
    assert.equal((await admin.call(`/payment-submissions/${submission.id}/proof`)).status,200);
    assert.equal((await proof(alice,order.id)).status,409);
    assert.equal((await admin.call(`/admin/payment-submissions/${submission.id}/review`,'POST',{action:'REJECTED'})).status,400);
    await post(admin,`/admin/payment-submissions/${submission.id}/review`,{action:'REJECTED',reason:'Wrong receipt'},200);
    assert.equal((await db.order.findUnique({where:{id:order.id}})).paymentStatus,'PENDING');
    const second=await proof(alice,order.id);assert.equal(second.status,202);
    const decisions=await Promise.all([admin.call(`/admin/payment-submissions/${second.body.submission.id}/review`,'POST',{action:'VERIFIED',reference:'BANK-001'}),admin.call(`/admin/payment-submissions/${second.body.submission.id}/review`,'POST',{action:'VERIFIED',reference:'BANK-001'})]);
    assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
    const v=await db.productVariant.findUnique({where:{id:product.variants[0].id}});assert.equal(v.onHand,1);assert.equal(v.reserved,0);
    await assert.rejects(pool.query("UPDATE payment_submissions SET review_reason='changed' WHERE id=$1",[second.body.submission.id]));
    await assert.rejects(pool.query('DELETE FROM inventory_movements WHERE variant_id=$1',[v.id]));
    await admin.call(`/admin/orders/${order.id}/pickup`,'PATCH',{status:'READY_FOR_PICKUP'});
    await admin.call(`/admin/orders/${order.id}/pickup`,'PATCH',{status:'COMPLETED'});
    assert.equal((await db.productVariant.findUnique({where:{id:v.id}})).onHand,1);
  });
  await t.test('duplicate verified reference rolls back; timely proof holds expired order',async()=>{
    const r=await createOrder(alice,product.variants[0].id);assert.equal(r.status,201);const id=r.body.order.id;
    const s=await proof(alice,id);assert.equal(s.status,202);
    assert.equal((await admin.call(`/admin/payment-submissions/${s.body.submission.id}/review`,'POST',{action:'VERIFIED',reference:'BANK-001'})).status,409);
    await delay(30);
    await pool.query("UPDATE orders SET created_at=now()-interval '3 days',expires_at=now()-interval '1 millisecond' WHERE id=$1",[id]);
    await expireOrders(db);assert.equal((await db.order.findUnique({where:{id}})).paymentStatus,'PENDING');
    await post(admin,`/admin/payment-submissions/${s.body.submission.id}/review`,{action:'REJECTED',reason:'Receipt belongs to another order'},200);
    assert.equal((await db.order.findUnique({where:{id}})).paymentStatus,'EXPIRED');
    assert.equal((await db.productVariant.findUnique({where:{id:product.variants[0].id}})).reserved,0);
  });
  await t.test('batch sizes, separate names, window validation, receipts and pickup allocation',async()=>{
    batchProduct=(await post(admin,'/admin/products',{name:'Faculty Jacket',sellingType:'BATCH',status:'PUBLISHED',variants:[{sku:'JKT-M',size:'M',color:'Green',price:'265000'},{sku:'JKT-L',size:'L',color:'Green',price:'275000'}]})).product;
    const payload={productId:batchProduct.id,name:'Batch 01',status:'OPEN',opensAt:new Date(Date.now()-10000).toISOString(),closesAt:new Date(Date.now()+86400000).toISOString()};
    const batch=(await post(admin,'/admin/batches',payload)).batch;
    await post(admin,'/admin/batches',{...payload,name:'Batch 02'});
    assert.equal((await createOrder(alice,batchProduct.variants[0].id,1,batch.id)).status,400);
    const r=await alice.call('/orders','POST',{batchId:batch.id,customerName:'Alice Student',customerPhone:'0812345678',items:[{variantId:batchProduct.variants[0].id,quantity:1,embroideryName:'NADIA'},{variantId:batchProduct.variants[0].id,quantity:1,embroideryName:'NAYA'}]},{'idempotency-key':randomUUID()});
    assert.equal(r.status,201,JSON.stringify(r.body));const id=r.body.order.id;assert.equal(r.body.order.items.length,2);
    assert.equal((await db.productVariant.findUnique({where:{id:batchProduct.variants[0].id}})).reserved,0);
    const s=await proof(alice,id);await post(admin,`/admin/payment-submissions/${s.body.submission.id}/review`,{action:'VERIFIED',reference:'BANK-BATCH-01'},200);
    assert.equal((await db.order.findUnique({where:{id}})).pickupStatus,'PROCESSING');
    await admin.call(`/admin/batches/${batch.id}`,'PATCH',{status:'CLOSED'});
    assert.equal((await createOrder(alice,batchProduct.variants[0].id,1,batch.id,'NAME')).status,409);
    await post(admin,`/admin/batches/${batch.id}/receive`,{items:[{variantId:batchProduct.variants[0].id,quantity:2}],reason:'Production delivery'},200);
    assert.equal((await db.order.findUnique({where:{id}})).pickupStatus,'READY_FOR_PICKUP');
    await admin.call(`/admin/orders/${id}/pickup`,'PATCH',{status:'COMPLETED'});
    const v=await db.productVariant.findUnique({where:{id:batchProduct.variants[0].id}});assert.equal(v.onHand,0);assert.equal(v.reserved,0);
    const mixed=await alice.call('/orders','POST',{batchId:batch.id,customerName:'Alice Student',customerPhone:'0812345678',items:[{variantId:product.variants[0].id,quantity:1}]},{'idempotency-key':randomUUID()});assert.notEqual(mixed.status,201);
  });
  await t.test('catalog changes preserve order and payment snapshots',async()=>{
    await admin.call(`/admin/products/${product.id}`,'PATCH',{name:'Renamed product',status:'ARCHIVED'});
    await admin.call(`/admin/variants/${product.variants[0].id}`,'PATCH',{price:'99000'});
    await admin.call(`/admin/payment-methods/${method.id}`,'PATCH',{enabled:false});
    const historical=(await alice.call('/orders')).body.orders.find(o=>o.id===order.id);
    assert.equal(historical.total,'85000.00');assert.match(historical.items[0].itemDescription,/Merchandise/);
    assert.equal(historical.paymentSubmissions.find(s=>s.status==='VERIFIED').methodSnapshot.accountNumber,'12345');
    assert(!(await alice.call('/products')).body.products.some(p=>p.id===product.id));
  });
});
