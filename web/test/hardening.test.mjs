import test from "node:test";
import assert from "node:assert/strict";
import { openBatches, isBatchOpen } from "../src/features/store/batch-window.ts";
import { RequestError, fetchJson } from "../src/features/store/request-errors.ts";

test("orderable batches exclude expired, future, closed and invalid windows without mutating their order",()=>{
 const now=Date.parse("2026-11-03T00:00:00Z");
 const row=(id,status,opensAt,closesAt)=>({id,status,opensAt,closesAt});
 const rows=[row("expired","OPEN","2026-01-01","2026-11-02"),row("late","OPEN","2026-11-02","2026-11-09"),row("soon","OPEN","2026-11-02","2026-11-04"),row("future","OPEN","2026-11-05","2026-11-06"),row("closed","CLOSED","2026-11-01","2026-11-10"),row("invalid","OPEN","invalid","invalid")];
 assert.deepEqual(openBatches(rows,now).map(x=>x.id),["soon","late"]);
 assert.equal(rows[0].id,"expired");
 assert.equal(isBatchOpen(rows[2],Date.parse(rows[2].closesAt)),false);
 assert.equal(isBatchOpen(rows[2],Date.parse(rows[2].opensAt)),true);
});
test("request errors preserve usable validation fields and safe status guidance",()=>{
 const error=new RequestError(400,{error:"Invalid input",details:[{path:"variants.0.price",message:"Enter a positive price"},null,{path:1,message:"Ignore"}]});
 assert.deepEqual(error.details,[{path:"variants.0.price",message:"Enter a positive price"}]);
 assert.equal(error.status,400);assert.match(error.message,/fields/);
 assert.match(new RequestError(429,null,"60").message,/60 seconds/);
 assert.match(new RequestError(401,null).message,/Sign in/);
 assert.match(new RequestError(401,{error:"Authentication required"}).message,/Sign in/);
 assert.match(new RequestError(401,{error:"Invalid credentials"}).message,/Invalid credentials/);
 assert.match(new RequestError(403,null).message,/access/);
 assert.match(new RequestError(500,{error:"sensitive database detail"}).message,/try again/i);
 assert.doesNotMatch(new RequestError(500,{error:"sensitive database detail"}).message,/database/);
});
test("transport handles unreadable responses, offline, cancellation, rate limits and empty success",async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response("Too many requests",{status:429,headers:{"Retry-After":"15"}});
 await assert.rejects(()=>fetchJson("/api/test"),/15 seconds/);
 globalThis.fetch=async()=>new Response("not json",{status:200});
 await assert.rejects(()=>fetchJson("/api/test"),/unreadable/);
 globalThis.fetch=async()=>{throw new TypeError("Failed to fetch");};
 await assert.rejects(()=>fetchJson("/api/test"),/Check your connection/);
 globalThis.fetch=async(_url,{signal})=>{signal.throwIfAborted();return new Response(null,{status:204});};
 assert.equal(await fetchJson("/api/test"),null);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>fetchJson("/api/test",{signal:controller.signal}),error=>error.name==="AbortError");
});
