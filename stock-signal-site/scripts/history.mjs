import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const DAY = 86400000;
export const START = Date.UTC(2011, 0, 1);
const UA = { 'User-Agent': 'Mozilla/5.0 stock-signal/4' };
const KQ = new Set(['058470','240810','357780','039030','036930','095340','247540','086520','278280','348370','196170','328130','145020','214150','145720','293490','263750','041510','035900']);
export function yahooSymbol(sym) {
  if (sym.startsWith('^')) return { '^kospi': '^KS11', '^spx': '^GSPC', '^nkx': '^N225' }[sym];
  if (sym.endsWith('.kr')) { const code = sym.slice(0, -3); return code + (KQ.has(code) ? '.KQ' : '.KS'); }
  if (sym.endsWith('.jp')) return sym.slice(0, -3) + '.T';
  return sym.replace(/\.us$/, '').toUpperCase();
}

export async function requestText(url, { fetcher = fetch, timeout = 6000, attempts = 2 } = {}) {
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // Signal stays active during body consumption, not only response headers.
      const response = await fetcher(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
      if (!response.ok) {
        failure = new Error(`HTTP_${response.status}`);
        if (![429, 500, 502, 503, 504].includes(response.status)) throw failure;
      } else return await response.text();
    } catch (error) { failure = error; }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw failure || new Error('EMPTY_RESPONSE');
}

export function normalizeBars(bars, now = Date.now()) {
  const days = new Map();
  for (const bar of bars) {
    if (!Number.isFinite(bar.t) || bar.t > now || ![bar.o, bar.c, bar.h, bar.l].every(x => Number.isFinite(x) && x > 0)) continue;
    if (bar.h < Math.max(bar.o, bar.c) || bar.l > Math.min(bar.o, bar.c) || bar.h < bar.l) continue;
    const t = Math.floor(bar.t / DAY) * DAY;
    days.set(t, { ...bar, t });
  }
  return [...days.values()].sort((a, b) => a.t - b.t);
}

export function parseYahoo(text, now = Date.now()) {
  const payload = JSON.parse(text);
  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) throw new Error(payload.chart?.error?.code || 'INVALID_CHART');
  if (result.meta?.dataGranularity !== '1d') throw new Error('NOT_DAILY');
  const quote = result.indicators?.quote?.[0];
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose;
  if (!quote || !adjusted) throw new Error('NO_ADJUSTED_CLOSE');
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const t = result.timestamp[i] * 1000;
    // A daily bar is not actionable until the venue's regular session has ended.
    const session = result.meta?.currentTradingPeriod?.regular;
    if (session && t >= session.start * 1000 && now < session.end * 1000 + 15 * 60000) continue;
    const raw = quote.close[i], adjustedClose = adjusted[i];
    if (!(raw > 0) || !(adjustedClose > 0)) continue;
    const factor = adjustedClose / raw;
    bars.push({ t, o: quote.open[i] * factor, h: quote.high[i] * factor, l: quote.low[i] * factor, c: adjustedClose, v: quote.volume[i] || 0, rawClose: raw, factor });
  }
  const data = normalizeBars(bars, now);
  if (!data.length) throw new Error('NO_VALID_BARS');
  return { data, currency: result.meta.currency, exchange: result.meta.exchangeName, symbol: result.meta.symbol, adjustment: 'Yahoo adjclose ratio (OHLC consistent; volume unadjusted)' };
}

export async function collectHistory(sym, { cacheDir, now = Date.now(), fetcher = fetch } = {}) {
  const path = cacheDir ? `${cacheDir}/${encodeURIComponent(sym)}.json` : null;
  let cached;
  try { cached = JSON.parse(readFileSync(path, 'utf8')); } catch {}
  let ticker = cached?.symbol || yahooSymbol(sym);
  // Refresh a year of adjusted prices to detect split/dividend revisions; initial load starts in 2011.
  const start = cached?.data?.length ? Math.max(START, now - 370 * DAY) : START;
  const tickers = [ticker];
  if (sym.endsWith('.kr')) tickers.push(ticker.endsWith('.KS') ? ticker.replace('.KS', '.KQ') : ticker.replace('.KQ', '.KS'));
  const attempts = [];
  for (const symbol of tickers) {
    try {
      const query = `period1=${Math.floor(start / 1000)}&period2=${Math.floor(now / 1000)}&interval=1d`;
      const parsed = parseYahoo(await requestText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, { fetcher }), now);
      let data = parsed.data;
      if (cached?.data?.length) {
        if (parsed.symbol !== cached.symbol || parsed.currency !== cached.currency || parsed.exchange !== cached.exchange) throw new Error('CACHE_IDENTITY_MISMATCH');
        const previous = new Map(cached.data.map(bar => [bar.t, bar]));
        const overlap = data.find(bar => previous.has(bar.t));
        if (!overlap) throw new Error('CACHE_NO_OVERLAP');
        const factor = overlap.c / previous.get(overlap.t).c;
        const older = cached.data.filter(bar => bar.t < data[0].t).map(bar => ({ ...bar, o: bar.o * factor, h: bar.h * factor, l: bar.l * factor, c: bar.c * factor, factor: bar.factor * factor }));
        data = normalizeBars([...older, ...data], now);
      }
      const saved = { ...parsed, data, fetchedAt: new Date(now).toISOString() };
      if (path) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(path, JSON.stringify(saved)); }
      return { ...saved, src: 'Yahoo', cached: false, attempts };
    } catch (error) { attempts.push({ symbol, error: error.message }); }
  }
  // Cache can support display, but must never silently appear freshly collected.
  if (cached?.data?.length) return { ...cached, src: 'Yahoo cache', cached: true, attempts };
  return { data: null, attempts, error: attempts.at(-1)?.error || 'COLLECTION_FAILED' };
}

export async function collectMany(symbols, options = {}) {
  const results = {};
  let cursor = 0, done = 0;
  const workers = options.workers || 8;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      results[symbol] = await collectHistory(symbol, options);
      if (++done % 50 === 0) console.log(`  수집 ${done}/${symbols.length}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }));
  return results;
}
