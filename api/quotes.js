/**
 * GET /api/quotes?symbols=RELIANCE,TCS
 *
 * Server-side proxy for NSE India quotes (NIFTY 50 constituent snapshot).
 * NSE has no public/authenticated API for third parties; this endpoint reads the
 * same public website JSON the nseindia.com site itself uses, with a short cache
 * so we stay polite. If NSE is unreachable or blocks the request (common from
 * cloud IPs), we return 503 and the browser falls back to its simulated feed.
 *
 * Quotes are delayed/indicative and are used for a paper-trading demo only.
 */

const NSE_HOME = 'https://www.nseindia.com';
const NSE_INDEX = 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050';
const CACHE_MS = 10000;
const FETCH_TIMEOUT_MS = 6000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/market-data/live-equity-market'
};

let cache = { at: 0, quotes: null };
let cookie = '';

function withTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function primeCookie() {
  const res = await withTimeout(NSE_HOME, { headers: BROWSER_HEADERS });
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  cookie = raw
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ');
  return cookie;
}

async function fetchIndex() {
  if (!cookie) await primeCookie();
  let res = await withTimeout(NSE_INDEX, { headers: { ...BROWSER_HEADERS, Cookie: cookie } });
  if (res.status === 401 || res.status === 403) {
    await primeCookie();
    res = await withTimeout(NSE_INDEX, { headers: { ...BROWSER_HEADERS, Cookie: cookie } });
  }
  if (!res.ok) throw new Error('NSE responded ' + res.status);
  const json = await res.json();
  if (!json || !Array.isArray(json.data)) throw new Error('Unexpected NSE payload');

  return json.data
    .filter((row) => row && row.symbol && row.symbol !== 'NIFTY 50')
    .map((row) => ({
      symbol: String(row.symbol).toUpperCase(),
      name: row.meta && row.meta.companyName ? row.meta.companyName : String(row.symbol),
      price: Number(row.lastPrice),
      prevClose: Number(row.previousClose ?? row.lastPrice)
    }))
    .filter((q) => Number.isFinite(q.price) && q.price > 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const raw = (req.query && req.query.symbols) || '';
  const wanted = String(Array.isArray(raw) ? raw.join(',') : raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9&.\-]{1,20}$/.test(s))
    .slice(0, 60);

  try {
    if (!cache.quotes || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), quotes: await fetchIndex() };
    }
    const all = cache.quotes || [];
    const quotes = wanted.length ? all.filter((q) => wanted.includes(q.symbol)) : all;
    if (!quotes.length) throw new Error('No matching symbols in NSE snapshot');
    res.status(200).json({ source: 'nse', asOf: new Date(cache.at).toISOString(), quotes });
  } catch (err) {
    // Do not leak internals; the client has its own simulated fallback.
    res.status(503).json({
      source: 'unavailable',
      quotes: [],
      error: 'Live NSE feed is unavailable right now.'
    });
  }
};
