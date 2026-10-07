import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Read-only audit: do not invoke the production main or overwrite data.json.
const source = readFileSync(new URL('../stock-signal-site/scripts/build.mjs', import.meta.url), 'utf8');
const marker = '//============ 메인';
assert(source.includes(marker), 'Production main marker changed; review extraction');
const helpers = source.split(marker)[0].replace(/^import .*?;\r?\n/gm, '');
const context = { Date, console };
vm.createContext(context);
vm.runInContext(helpers + '\nglobalThis.audit={KR,JP,aggregate};', context);
const { KR, JP, aggregate } = context.audit;
const data = JSON.parse(readFileSync(new URL('../stock-signal-site/data.json', import.meta.url), 'utf8'));
const country = {};
for (const c of ['kr', 'us', 'jp']) {
  const target = c === 'kr' ? Object.keys(KR).length : c === 'jp' ? Object.keys(JP).length : data.coverage.universe - Object.keys(KR).length - Object.keys(JP).length;
  const analyzed = data.stocks.filter(a => a.country === c).length;
  country[c] = { target, analyzed, missing: target - analyzed, defaultCandidates: data.trend.filter(a => a.country === c && a.rs >= 70 && a.sigs.some(s => s.status === 'in')).length, indexAvailable: data.market[c].have };
}
assert.equal(Object.values(country).reduce((sum, c) => sum + c.analyzed, 0), data.coverage.analyzed);
const allWin = aggregate([0, 1, 2], [100, 101, 102, 103, 104, 105], [0, 1, 2, 3, 4, 5], 5)[2];
assert.equal(allWin.winRate, 1);
assert.equal(allWin.payoff, 99);
assert.equal(allWin.ev, 99);
const signals = data.trend.flatMap(a => a.sigs);
console.log(JSON.stringify({ builtAt: data.builtAt, signdate: data.signdate, coverage: data.coverage, country, trendStocks: data.trend.length, signals: signals.length, inZoneSignals: signals.filter(s => s.status === 'in').length, season: data.season.length, sources: [...new Set(Object.values(data.sources))], allWinExample: allWin }, null, 2));
