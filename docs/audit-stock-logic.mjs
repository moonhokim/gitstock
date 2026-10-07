import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const data=JSON.parse(readFileSync(new URL('../stock-signal-site/data.json',import.meta.url),'utf8'));
assert.equal(data.schemaVersion,4,'Run the v4 build first');
assert.equal(data.stocks.length,data.coverage.analyzed);
for(const a of data.trend)for(const s of a.sigs){
  assert.equal(s.validated,true);assert.ok(s.train.n>=20);assert.ok(s.st[s.bh].n>=10);
  assert.ok(s.st[s.bh].ev>0);assert.notEqual(s.st[s.bh].payoff,99);
  assert.equal(a.stale,false);
}
console.log(JSON.stringify({schemaVersion:data.schemaVersion,coverage:data.coverage,market:Object.fromEntries(Object.entries(data.market).map(([k,v])=>[k,{have:v.have,asOf:v.asOf}])),currentCandidates:data.trend.filter(a=>a.rs>=70&&a.sigs.some(s=>s.status==='in')).length,failures:data.failures,buildSeconds:data.buildSeconds},null,2));
