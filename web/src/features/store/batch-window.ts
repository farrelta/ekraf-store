type Window = { status:string; opensAt:string; closesAt:string };
export function isBatchOpen(batch:Window, now=Date.now()) {
  return batch.status === "OPEN" && Date.parse(batch.opensAt) <= now && Date.parse(batch.closesAt) > now;
}
export function openBatches<T extends Window>(batches:readonly T[],now=Date.now()):T[] {
  return batches.filter(batch=>isBatchOpen(batch,now)).sort((a,b)=>Date.parse(a.closesAt)-Date.parse(b.closesAt));
}
