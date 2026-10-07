import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYahoo, normalizeBars, collectHistory, yahooSymbol, DAY } from './history.mjs';

function fixture(granularity='1d') {
  return JSON.stringify({chart:{result:[{meta:{dataGranularity:granularity,currency:'USD',symbol:'AAPL'},timestamp:[1500000000,1500086400],indicators:{quote:[{open:[100,110],close:[110,120],high:[115,125],low:[95,105],volume:[5,6]}],adjclose:[{adjclose:[55,60]}]}}]}});
}
test('reject monthly or quarterly payloads even if requested daily',()=>{
  assert.throws(()=>parseYahoo(fixture('1mo')),/NOT_DAILY/);
  assert.throws(()=>parseYahoo(fixture('3mo')),/NOT_DAILY/);
});
test('adjust OHLC consistently, retain raw close and unadjusted volume',()=>{
  const result=parseYahoo(fixture());
  assert.equal(result.data[0].o,50);assert.equal(result.data[0].h,57.5);
  assert.equal(result.data[0].l,47.5);assert.equal(result.data[0].c,55);
  assert.equal(result.data[0].rawClose,110);assert.equal(result.data[0].v,5);
});
test('sort and deduplicate valid bars and reject invalid OHLC',()=>{
  const a={t:1500000000*1000,o:10,h:12,l:9,c:11};
  const bars=normalizeBars([{...a,t:a.t+DAY},a,{...a,c:10},{...a,t:a.t+2*DAY,c:99}]);
  assert.equal(bars.length,2);assert.equal(bars[0].c,10);assert.ok(bars[0].t<bars[1].t);
});
test('explicit epoch range avoids range=max resampling',async()=>{
  let url;
  const r=await collectHistory('aapl.us',{now:1600000000000,fetcher:async input=>{url=input;return {ok:true,text:async()=>fixture()};}});
  assert.ok(r.data.length);assert.match(url,/period1=/);assert.match(url,/period2=/);
  assert.match(url,/interval=1d/);assert.doesNotMatch(url,/range=max/);
});
test('route known KOSDAQ symbols correctly',()=>{
  assert.equal(yahooSymbol('247540.kr'),'247540.KQ');assert.equal(yahooSymbol('005930.kr'),'005930.KS');
});
