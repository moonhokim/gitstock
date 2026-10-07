import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KR, JP, USX, GICS, countryOf } from './universe.mjs';
import { collectMany, requestText, DAY } from './history.mjs';
import { analyzeStock, regime, seasonal, COSTS } from './signals.mjs';

const SELFTEST = process.argv.includes('--selftest');
const arg = name => process.argv.find(x => x.startsWith(name + '='))?.slice(name.length + 1);
const outputPath = arg('--output') || fileURLToPath(new URL(SELFTEST ? '../selftest-data.json' : '../data.json', import.meta.url));
const cacheDir = fileURLToPath(new URL('../.cache', import.meta.url));
const now = Date.now(), started = performance.now(), warnings = [];

function parseCsvLine(line) {
  const fields = []; let text = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { if (quoted && line[i+1] === '"') { text += '"'; i++; } else quoted = !quoted; }
    else if (line[i] === ',' && !quoted) { fields.push(text); text = ''; }
    else text += line[i];
  }
  fields.push(text); return fields;
}
async function loadSP500() {
  const path = `${cacheDir}/universe.json`;
  try {
    const text = await requestText('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv');
    const rows = text.trim().split(/\r?\n/).map(parseCsvLine), head = rows.shift().map(s => s.toLowerCase());
    const symbol = head.indexOf('symbol'), name = head.findIndex(s => s === 'security' || s === 'name'), sector = head.findIndex(s => s.includes('sector'));
    if (symbol < 0 || name < 0 || sector < 0 || rows.length < 400) throw new Error('INVALID_UNIVERSE');
    const result = {};
    for (const row of rows) if (row[symbol]) result[row[symbol].replaceAll('.', '-').toLowerCase()+'.us'] = [row[name], GICS[row[sector]] || '기타', 'stock'];
    mkdirSync(cacheDir, { recursive: true }); writeFileSync(path, JSON.stringify(result));return result;
  } catch (error) {
    try { const saved = JSON.parse(readFileSync(path, 'utf8')); warnings.push('S&P500 목록 수집 실패: 마지막 저장 목록 사용'); return saved; } catch {}
    throw new Error(`S&P500 목록 수집 실패: ${error.message}`);
  }
}
let universe = {};
for (const list of [KR, JP, USX]) for (const [symbol, meta] of Object.entries(list)) universe[symbol] = [meta[0], meta[1], meta[2] || 'stock'];
if (!SELFTEST) Object.assign(universe, await loadSP500());
const symbols = Object.keys(universe), indices = { kr: '^kospi', us: '^spx', jp: '^nkx' };
console.log(`유니버스 ${symbols.length} · 일봉 명시 요청 · 동시 수집 8`);
let collected;
if (SELFTEST) {
  const mock = symbol => { let p = 100, seed = symbol.length; const data=[], end=Math.floor(now/DAY)*DAY-DAY;
    for(let i=0;i<3600;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const o=p*(1+(seed/2**32-.5)*.005);p=o*(1+.0004+Math.sin(i*.7)*.015);data.push({t:end-(3599-i)*DAY,c:p,o,h:Math.max(o,p)*1.01,l:Math.min(o,p)*.99,v:1000000,rawClose:p,factor:1});}
    return { data,src:'Synthetic',symbol,fetchedAt:new Date(now).toISOString(),adjustment:'Synthetic test only',attempts:[] }; };
  collected=Object.fromEntries([...Object.values(indices),...symbols].map(s=>[s,mock(s)]));
} else collected=await collectMany([...Object.values(indices),...symbols],{cacheDir,now});
const quality={},sources={},failures=[];
for(const [symbol,result] of Object.entries(collected)){
  const bars=result.data||[],last=bars.at(-1),stale=!last||now-last.t>5*DAY||result.cached===true;
  quality[symbol]={asOf:last?new Date(last.t).toISOString().slice(0,10):null,observations:bars.length,stale,cached:!!result.cached,source:result.src||null,providerSymbol:result.symbol||null,currency:result.currency||null,exchange:result.exchange||null,adjustment:result.adjustment||null,attempts:result.attempts||[]};
  if(result.src)sources[symbol]=result.src;
  if(!last||stale||(!symbol.startsWith('^')&&bars.length<305))failures.push({sym:symbol,reason:!last?'collection-failed':stale?'stale-or-cache-only':'insufficient-history',attempts:result.attempts||[]});
}
const analyzed=symbols.filter(s=>!quality[s]?.stale).map(s=>{
  const a=analyzeStock(s,universe[s],collected[s].data);if(!a)return null;
  const factor=collected[s].data.at(-1).factor||1;
  // Adjusted returns, but displayed zones/charts use latest raw-quote price units.
  const display=v=>Number((v/factor).toPrecision(7));
  a.price=display(a.price);a.closes=a.closes.map(display);
  a.sigs=a.sigs.filter(s=>s.status==='in'||s.status==='wait').map(s=>({...s,zoneLo:display(s.zoneLo),zoneHi:display(s.zoneHi),...(s.arr?{arr:s.arr.map(v=>v===null?null:display(v))}:{}),trainScore:s.train.ev,validated:true}));
  return {...a,asOf:quality[s].asOf,stale:false};
}).filter(Boolean);
for(const country of ['kr','us','jp']){
  const g=analyzed.filter(a=>a.country===country).sort((a,b)=>a.rsRaw-b.rsRaw);g.forEach((a,i)=>a.rs=g.length>1?Math.round(1+i/(g.length-1)*98):50);
}
const market={};
for(const [country,symbol] of Object.entries(indices)){
  const g=analyzed.filter(a=>a.country===country),bars=collected[symbol]?.data||[];
  market[country]={...(!quality[symbol].stale?regime(bars):{ok:false,have:false}),asOf:quality[symbol].asOf,count:g.length,above200:g.length?g.filter(a=>a.above200).length/g.length:0,above50:g.length?g.filter(a=>a.above50).length/g.length:0,newHigh:g.filter(a=>a.newHigh).length,newLow:g.filter(a=>a.newLow).length,spark:quality[symbol].stale?[]:bars.slice(-20).map(b=>b.c)};
  if(!market[country].have)warnings.push(`${country.toUpperCase()} 지수 판단 불가: 수집 실패 또는 오래된 자료`);
}
const sectors=[];
for(const country of ['kr','us','jp']){
  const by={};for(const a of analyzed.filter(a=>a.country===country))(by[a.sector] ||= []).push(a);
  for(const [name,arr] of Object.entries(by))if(arr.length>=3){const avgRS=Math.round(arr.reduce((s,a)=>s+a.rs,0)/arr.length);sectors.push({country,name,count:arr.length,avgRS,pctAbove200:arr.filter(a=>a.above200).length/arr.length,score:avgRS});}
}
sectors.sort((a,b)=>b.avgRS-a.avgRS);
const season=analyzed.map(a=>seasonal(a.sym,universe[a.sym],collected[a.sym].data,now)).filter(Boolean).filter(s=>s.wr>=.8&&s.avg>0).sort((a,b)=>b.wr-a.wr).map(({score,...s})=>s);
const byCountry=Object.fromEntries(['kr','us','jp'].map(c=>[c,{universe:symbols.filter(s=>countryOf(s)===c).length,analyzed:analyzed.filter(a=>a.country===c).length}]));
if(failures.length)warnings.push(`${failures.filter(x=>!x.sym.startsWith('^')).length}종목 분석 제외: 실패·오래된 자료·305일 미만 (quality/failures에 상세 기록)`);
warnings.push('승률은 신호별 시간순 검증기간 통계이며 RS·시장 필터를 포함한 전체 전략의 실전 승률이 아닙니다.');
const out={schemaVersion:4,strategyVersion:'4.0.0',signdate:analyzed.map(a=>a.asOf).sort().at(-1)||null,builtAt:new Date(now).toISOString(),coverage:{universe:symbols.length,analyzed:analyzed.length,byCountry},market,sectors,stocks:analyzed.map(a=>({sym:a.sym,name:a.name,sector:a.sector,country:a.country,rs:a.rs,above200:a.above200,sig:a.sigs.some(s=>s.status==='in'),asOf:a.asOf,stale:false})),sources,quality,failures,warnings,trend:analyzed.filter(a=>a.sigs.length).map(({rsRaw,above50,newHigh,newLow,...a})=>a),season,methodology:{entry:'signal close then next session open',split:'70% training / 30% chronological holdout; training exits before boundary',costs:COSTS,costsAreAssumptions:true,rsAndMarketNotBacktested:true,seasonal:'fixed 10 bars / 10 completed years; exploratory',historyStart:'2011-01-01',priceBasis:'Adjusted OHLC; display rescaled to latest raw quote',selectionBiasRemains:true},buildSeconds:Math.round((performance.now()-started)/1000),selftest:SELFTEST};
if(!SELFTEST&&(analyzed.length/symbols.length<.7||Object.values(byCountry).some(c=>c.analyzed/c.universe<.7)||Object.values(market).some(m=>!m.have))){
  writeFileSync(fileURLToPath(new URL('../build-report.json',import.meta.url)),JSON.stringify({builtAt:out.builtAt,coverage:out.coverage,failures,warnings}));
  throw new Error(`분석 성공률 ${(100*analyzed.length/symbols.length).toFixed(1)}%: 국가별 70% 또는 지수 완전성 기준 미달, 이전 정상 data.json 유지`);
}
writeFileSync(outputPath+'.tmp',JSON.stringify(out));renameSync(outputPath+'.tmp',outputPath);
console.log(`완료 ${analyzed.length}/${symbols.length} · 추세 ${out.trend.length} · 계절성 ${season.length} · ${out.buildSeconds}초 · ${outputPath}`);
