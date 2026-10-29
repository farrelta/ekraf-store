import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogOptions, createWithSkus, generateSku, optionSchema } from '../dist/catalog.js';
const conflict = target => Object.assign(new Error('Duplicate value'), {code:'P2002',meta:{target}});

test('SKU format, defaults and option normalization',()=>{
  const values=Array.from({length:100},generateSku);
  assert.equal(new Set(values).size,100);
  assert(values.every(s=>/^EKR-[0-9A-F]{12}$/.test(s)));
  assert.equal(optionSchema.parse('  forest   green  '),'FOREST GREEN');
  assert.equal(optionSchema.parse(''),'STANDARD');
  assert.equal(optionSchema.parse(undefined),'STANDARD');
  assert.deepEqual(catalogOptions.categories,['T-shirt','Faculty Jacket','Work Shirt','Hoodie','Tote Bag','Accessories','Other']);
});
test('generated SKU collision retries the whole creation and preserves explicit SKUs',async()=>{
  let calls=0, sequence=0;
  const db={productVariant:{findFirst:async()=>({id:'existing'})}};
  const result=await createWithSkus(db,[{}, {sku:'EXTERNAL-001'}],async assigned=>{
    calls++;assert.equal(assigned[1].sku,'EXTERNAL-001');if(calls===1)throw conflict(['sku']);return assigned;
  },()=>`GENERATED-${++sequence}`);
  assert.equal(calls,2);assert.equal(result[0].sku,'GENERATED-2');
});
test('retry limit is three additional attempts',async()=>{
  let calls=0;
  const db={productVariant:{findFirst:async()=>({id:'collision'})}};
  await assert.rejects(createWithSkus(db,[{}],async()=>{calls++;throw conflict(['sku']);}));
  assert.equal(calls,4);
});
test('explicit SKU, size/color and non-collision errors are never retried',async()=>{
  for(const [input,error]of [[[{sku:'MANUAL'}],conflict(['sku'])],[[{}],conflict(['product_id','size','color'])],[[{}],conflict(['sku'])],[[{}],new Error('Connection lost')]]){
    let calls=0;
    const db={productVariant:{findFirst:async()=>null}};
    await assert.rejects(createWithSkus(db,input,async()=>{calls++;throw error;}));
    assert.equal(calls,1);
  }
});
