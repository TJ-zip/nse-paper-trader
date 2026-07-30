/* =====================================================================
   NSE Paper Trader — client-side paper trading simulator
   Live quotes: Yahoo Finance chart endpoint via public CORS proxies,
   with a Stooq CSV fallback and a simulated feed as last resort.
   ===================================================================== */
'use strict';

/* ------------------------- instrument universe ---------------------- */
const UNIVERSE = [
  ['NIFTY 50',    '^NSEI',        'NIFTY 50 Index',              24800],
  ['BANKNIFTY',   '^NSEBANK',     'Nifty Bank Index',            55600],
  ['RELIANCE',    'RELIANCE.NS',  'Reliance Industries',          1420],
  ['TCS',         'TCS.NS',       'Tata Consultancy Services',    3180],
  ['HDFCBANK',    'HDFCBANK.NS',  'HDFC Bank',                    1980],
  ['INFY',        'INFY.NS',      'Infosys',                      1560],
  ['ICICIBANK',   'ICICIBANK.NS', 'ICICI Bank',                   1440],
  ['SBIN',        'SBIN.NS',      'State Bank of India',           830],
  ['BHARTIARTL',  'BHARTIARTL.NS','Bharti Airtel',                1950],
  ['ITC',         'ITC.NS',       'ITC Ltd',                       410],
  ['LT',          'LT.NS',        'Larsen & Toubro',              3620],
  ['AXISBANK',    'AXISBANK.NS',  'Axis Bank',                    1130],
  ['KOTAKBANK',   'KOTAKBANK.NS', 'Kotak Mahindra Bank',          1980],
  ['HINDUNILVR',  'HINDUNILVR.NS','Hindustan Unilever',           2420],
  ['MARUTI',      'MARUTI.NS',    'Maruti Suzuki',               12400],
  ['TATAMOTORS',  'TATAMOTORS.NS','Tata Motors',                   690],
  ['TATASTEEL',   'TATASTEEL.NS', 'Tata Steel',                    165],
  ['WIPRO',       'WIPRO.NS',     'Wipro',                         255],
  ['HCLTECH',     'HCLTECH.NS',   'HCL Technologies',             1640],
  ['SUNPHARMA',   'SUNPHARMA.NS', 'Sun Pharmaceutical',           1720],
  ['ASIANPAINT',  'ASIANPAINT.NS','Asian Paints',                 2500],
  ['BAJFINANCE',  'BAJFINANCE.NS','Bajaj Finance',                 940],
  ['ADANIENT',    'ADANIENT.NS',  'Adani Enterprises',            2380],
  ['ONGC',        'ONGC.NS',      'Oil & Natural Gas Corp',        245],
  ['NTPC',        'NTPC.NS',      'NTPC Ltd',                      335],
  ['POWERGRID',   'POWERGRID.NS', 'Power Grid Corp',               290],
  ['TITAN',       'TITAN.NS',     'Titan Company',                3550],
  ['ULTRACEMCO',  'ULTRACEMCO.NS','UltraTech Cement',            12100],
  ['NESTLEIND',   'NESTLEIND.NS', 'Nestle India',                 2260],
  ['JSWSTEEL',    'JSWSTEEL.NS',  'JSW Steel',                    1060],
  ['COALINDIA',   'COALINDIA.NS', 'Coal India',                    390],
  ['DRREDDY',     'DRREDDY.NS',   'Dr Reddy\u2019s Labs',         1250],
  ['CIPLA',       'CIPLA.NS',     'Cipla',                        1520],
  ['ZOMATO',      'ETERNAL.NS',   'Eternal (Zomato)',              320],
  ['DMART',       'DMART.NS',     'Avenue Supermarts',            4300],
  ['IRCTC',       'IRCTC.NS',     'IRCTC',                         720],
  ['IDEA',        'IDEA.NS',      'Vodafone Idea',                   8],
  ['YESBANK',     'YESBANK.NS',   'Yes Bank',                       20],
  ['PNB',         'PNB.NS',       'Punjab National Bank',          105],
  ['TATAPOWER',   'TATAPOWER.NS', 'Tata Power',                    390],
];

const META = {};                       // SYMBOL -> {yahoo, name, base}
UNIVERSE.forEach(([s, y, n, b]) => (META[s] = { yahoo: y, name: n, base: b }));
const INDICES = ['NIFTY 50', 'BANKNIFTY'];
const isIndex = s => INDICES.includes(s);

/* ------------------------------ state ------------------------------- */
const START_CASH = 1000000;
const BROKERAGE = 20;                  // ₹ per executed order
const LS_KEY = 'nse_paper_trader_v1';

const defaultState = () => ({
  cash: START_CASH,
  realised: 0,
  positions: {},                       // sym -> {qty, avg}
  pending: [],                         // {id,sym,side,qty,limit,ts}
  trades: [],                          // {ts,sym,side,qty,price,fee}
  watch: ['NIFTY 50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'TATAMOTORS', 'ITC', 'ICICIBANK'],
});

let S = load();
let selected = 'RELIANCE';
let range = '1d';
const quotes = {};                     // sym -> {price, prev, ts}
const series = {};                     // sym|range -> {t:[], c:[]}
let feedMode = 'connecting';           // live | sim | connecting

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && typeof raw.cash === 'number') return Object.assign(defaultState(), raw);
  } catch (e) { /* ignore */ }
  return defaultState();
}
const save = () => localStorage.setItem(LS_KEY, JSON.stringify(S));

/* ----------------------------- helpers ------------------------------ */
const $ = id => document.getElementById(id);
const inr = n => '\u20B9' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sign = n => (n > 0 ? '+' : '') + n.toFixed(2);
const cls = n => (n > 0 ? 'up' : n < 0 ? 'dn' : '');

function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (kind || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = 'toast'), 3200);
}

/* IST helpers — market 9:15–15:30 IST, Mon–Fri */
function istNow() {
  const d = new Date();
  return new Date(d.getTime() + (d.getTimezoneOffset() + 330) * 60000);
}
function marketOpen() {
  const d = istNow(), day = d.getDay();
  if (day === 0 || day === 6) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 555 && m <= 930;
}

/* ------------------------- live data fetching ----------------------- */
const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  u => u, // direct (works if CORS is ever allowed)
];
let proxyIdx = 0;

async function fetchText(url, timeout = 9000) {
  for (let i = 0; i < PROXIES.length; i++) {
    const p = PROXIES[(proxyIdx + i) % PROXIES.length];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(p(url), { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!r.ok) continue;
      const txt = await r.text();
      if (txt && txt.length > 10) { proxyIdx = (proxyIdx + i) % PROXIES.length; return txt; }
    } catch (e) { clearTimeout(timer); }
  }
  return null;
}

async function fetchJSON(url, timeout = 9000) {
  const txt = await fetchText(url, timeout);
  if (!txt) return null;
  try {
    const j = JSON.parse(txt);
    return j && (j.chart || j.quoteResponse) ? j : null;
  } catch (e) { return null; }
}

/* secondary provider: Stooq CSV (last price + open, no intraday series) */
const stooqSym = sym => {
  const y = META[sym].yahoo;
  if (y === '^NSEI') return '^nsei';
  if (y === '^NSEBANK') return '^bsesn';           // closest available index on Stooq
  return y.replace('.NS', '').toLowerCase() + '.in';
};
async function pullStooq(sym) {
  const txt = await fetchText('https://stooq.com/q/l/?s=' + stooqSym(sym) + '&f=sd2t2ohlcv&h&e=csv');
  if (!txt || txt.indexOf('Close') === -1) return null;
  const line = txt.trim().split('\n')[1];
  if (!line) return null;
  const f = line.split(',');                        // Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = parseFloat(f[6]), open = parseFloat(f[3]);
  if (!(close > 0)) return null;
  return { price: close, prev: open > 0 ? open : close, pts: { t: [], c: [] } };
}

const yUrl = (sym, rng, itv) =>
  'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(META[sym].yahoo) +
  '?range=' + rng + '&interval=' + itv + '&includePrePost=false';

const INTERVAL = { '1d': '5m', '5d': '15m', '1mo': '1d', '6mo': '1d', '1y': '1wk' };

/* fetch price + series for one symbol */
async function pullSymbol(sym, rng) {
  const j = await fetchJSON(yUrl(sym, rng, INTERVAL[rng] || '5m'));
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.meta) return rng === '1d' ? await pullStooq(sym) : null;
  const meta = res.meta;
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose || meta.previousClose || price;
  if (typeof price !== 'number') return null;

  const t = res.timestamp || [];
  const c = (res.indicators && res.indicators.quote && res.indicators.quote[0].close) || [];
  const pts = { t: [], c: [] };
  for (let i = 0; i < t.length; i++) if (typeof c[i] === 'number') { pts.t.push(t[i] * 1000); pts.c.push(c[i]); }
  return { price, prev, pts };
}

/* simulated feed (used when the network/proxies are unavailable) */
function simTick(sym) {
  const q = quotes[sym];
  const base = META[sym] ? META[sym].base : 100;
  if (!q) {
    const prev = base * (1 + (Math.random() - 0.5) * 0.02);
    const pts = { t: [], c: [] };
    let p = prev, now = Date.now();
    for (let i = 74; i >= 0; i--) { p *= 1 + (Math.random() - 0.5) * 0.004; pts.t.push(now - i * 300000); pts.c.push(p); }
    quotes[sym] = { price: p, prev, ts: Date.now() };
    series[sym + '|1d'] = pts;
    return;
  }
  const vol = isIndex(sym) ? 0.0006 : 0.0015;
  q.price = Math.max(0.5, q.price * (1 + (Math.random() - 0.5) * 2 * vol));
  q.ts = Date.now();
  const k = sym + '|1d', s = series[k];
  if (s) { s.t.push(Date.now()); s.c.push(q.price); if (s.t.length > 300) { s.t.shift(); s.c.shift(); } }
}

/* keep a rolling intraday series from live ticks when the provider sends no history */
function pushLive(sym, price, prev) {
  const k = sym + '|1d';
  if (!series[k] || !series[k].c.length) series[k] = { t: [Date.now() - 60000], c: [prev || price] };
  const s = series[k];
  s.t.push(Date.now()); s.c.push(price);
  if (s.t.length > 400) { s.t.shift(); s.c.shift(); }
}

function activeSymbols() {
  const set = new Set(S.watch.concat(Object.keys(S.positions), S.pending.map(o => o.sym), [selected], INDICES));
  return [...set].filter(s => META[s]);
}

async function refresh() {
  const syms = activeSymbols();
  let ok = 0;
  // Fetch in small batches to be gentle on the proxy
  for (let i = 0; i < syms.length; i += 4) {
    const batch = syms.slice(i, i + 4);
    const out = await Promise.all(batch.map(s => pullSymbol(s, '1d').catch(() => null)));
    out.forEach((d, k) => {
      const sym = batch[k];
      if (d) {
        ok++;
        quotes[sym] = { price: d.price, prev: d.prev, ts: Date.now() };
        if (d.pts.c.length) series[sym + '|1d'] = d.pts;
        else pushLive(sym, d.price, d.prev);       // provider gave no history: build one live
      }
    });
    if (i === 0 && ok === 0) break;    // first batch failed entirely -> go simulated
  }

  if (ok > 0) feedMode = 'live';
  else { feedMode = 'sim'; syms.forEach(simTick); }
  if (feedMode === 'live') syms.forEach(s => { if (!quotes[s]) simTick(s); });

  matchPending();
  renderAll();
}

/* fetch a longer-range series for the chart when the user changes range */
async function loadRange(sym, rng) {
  const key = sym + '|' + rng;
  if (series[key] && rng !== '1d') { drawChart(); return; }
  if (feedMode === 'sim') { // synthesise
    const q = quotes[sym] || { price: META[sym].base };
    const n = { '1d': 75, '5d': 130, '1mo': 22, '6mo': 130, '1y': 52 }[rng] || 75;
    let p = q.price / (1 + (Math.random() - 0.5) * 0.2);
    const pts = { t: [], c: [] }, step = { '1d': 3e5, '5d': 9e5, '1mo': 864e5, '6mo': 864e5, '1y': 6048e5 }[rng];
    for (let i = n; i >= 0; i--) { p *= 1 + (Math.random() - 0.5) * 0.02; pts.t.push(Date.now() - i * step); pts.c.push(p); }
    pts.c[pts.c.length - 1] = q.price;
    series[key] = pts; drawChart(); return;
  }
  const d = await pullSymbol(sym, rng);
  if (d && d.pts.c.length) series[key] = d.pts;
  drawChart();
}

/* ---------------------------- order engine -------------------------- */
function ltp(sym) { return quotes[sym] ? quotes[sym].price : (META[sym] ? META[sym].base : 0); }

function execute(sym, side, qty, price, quiet) {
  qty = Math.floor(qty);
  if (!META[sym]) return toast('Unknown symbol: ' + sym, 'err');
  if (!(qty > 0)) return toast('Quantity must be at least 1', 'err');
  if (isIndex(sym)) return toast('Indices are not tradable — pick a stock', 'err');

  const cost = qty * price;
  const pos = S.positions[sym];

  if (side === 'BUY') {
    if (cost + BROKERAGE > S.cash) return toast('Insufficient cash. Need ' + inr(cost + BROKERAGE), 'err');
    S.cash -= cost + BROKERAGE;
    if (pos) { pos.avg = (pos.avg * pos.qty + cost) / (pos.qty + qty); pos.qty += qty; }
    else S.positions[sym] = { qty, avg: price };
  } else {
    if (!pos || pos.qty < qty) return toast('You only hold ' + (pos ? pos.qty : 0) + ' share(s) of ' + sym, 'err');
    S.realised += (price - pos.avg) * qty - BROKERAGE;
    S.cash += cost - BROKERAGE;
    pos.qty -= qty;
    if (pos.qty === 0) delete S.positions[sym];
  }
  S.trades.unshift({ ts: Date.now(), sym, side, qty, price, fee: BROKERAGE });
  if (S.trades.length > 500) S.trades.pop();
  save(); renderAll();
  if (!quiet) toast(side + ' ' + qty + ' ' + sym + ' @ ' + inr(price) + ' executed', 'ok');
  return true;
}

function placeOrder(side) {
  const sym = $('oSymbol').value.trim().toUpperCase();
  const qty = parseInt($('oQty').value, 10);
  const type = $('oType').value;
  if (!META[sym]) return toast('Symbol not in list. Try RELIANCE, TCS, SBIN…', 'err');
  if (type === 'MARKET') return execute(sym, side, qty, ltp(sym));

  const lim = parseFloat($('oLimit').value);
  if (!(lim > 0)) return toast('Enter a valid limit price', 'err');
  const p = ltp(sym);
  if ((side === 'BUY' && p <= lim) || (side === 'SELL' && p >= lim)) return execute(sym, side, qty, p);
  S.pending.push({ id: Date.now() + '' + Math.random().toString(36).slice(2, 6), sym, side, qty, limit: lim, ts: Date.now() });
  save(); renderAll();
  toast('Limit ' + side + ' ' + qty + ' ' + sym + ' @ ' + inr(lim) + ' placed', 'ok');
}

function matchPending() {
  if (!S.pending.length) return;
  const keep = [];
  S.pending.forEach(o => {
    const p = ltp(o.sym);
    const hit = (o.side === 'BUY' && p <= o.limit) || (o.side === 'SELL' && p >= o.limit);
    if (hit && execute(o.sym, o.side, o.qty, p, true)) toast('Limit ' + o.side + ' ' + o.qty + ' ' + o.sym + ' filled @ ' + inr(p), 'ok');
    else keep.push(o);
  });
  S.pending = keep; save();
}

/* ------------------------------ render ------------------------------ */
function holdingsValue() {
  return Object.entries(S.positions).reduce((a, [s, p]) => a + p.qty * ltp(s), 0);
}
function unrealised() {
  return Object.entries(S.positions).reduce((a, [s, p]) => a + (ltp(s) - p.avg) * p.qty, 0);
}

function renderSummary() {
  const hv = holdingsValue(), eq = S.cash + hv, ur = unrealised();
  const invested = Object.values(S.positions).reduce((a, p) => a + p.avg * p.qty, 0);
  $('sEquity').textContent = inr(eq);
  const tot = eq - START_CASH;
  const sub = $('sEquitySub');
  sub.textContent = sign(tot) + ' (' + sign((tot / START_CASH) * 100) + '%) overall';
  sub.className = 'sub ' + cls(tot);
  $('sCash').textContent = inr(S.cash);
  $('sHoldings').textContent = inr(hv);
  $('sHoldCount').textContent = Object.keys(S.positions).length + ' position(s)';
  const u = $('sUnreal'); u.textContent = inr(ur); u.className = cls(ur);
  $('sUnrealPct').textContent = invested ? sign((ur / invested) * 100) + '% on invested' : '\u00A0';
  const r = $('sReal'); r.textContent = inr(S.realised); r.className = cls(S.realised);
}

function chgOf(sym) {
  const q = quotes[sym]; if (!q || !q.prev) return { abs: 0, pct: 0 };
  return { abs: q.price - q.prev, pct: ((q.price - q.prev) / q.prev) * 100 };
}

function renderTicker() {
  const list = ['NIFTY 50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'TATAMOTORS', 'ITC', 'LT', 'AXISBANK'];
  const html = list.map(s => {
    const c = chgOf(s);
    return '<span class="tk"><b>' + s + '</b>' + ltp(s).toFixed(2) +
           ' <span class="' + cls(c.pct) + '">' + sign(c.pct) + '%</span></span>';
  }).join('');
  $('tickerTrack').innerHTML = html + html;
}

function renderWatch() {
  const tb = $('watchTable').querySelector('tbody');
  tb.innerHTML = S.watch.map(s => {
    const c = chgOf(s);
    const actions = isIndex(s)
      ? '<button class="mini x" data-rm="' + s + '">remove</button>'
      : '<button class="mini b" data-buy="' + s + '">B</button> <button class="mini s" data-sell="' + s + '">S</button> <button class="mini x" data-rm="' + s + '">✕</button>';
    return '<tr data-sym="' + s + '">' +
      '<td><strong>' + s + '</strong><br><span style="color:var(--mut);font-size:11px">' + (META[s] ? META[s].name : '') + '</span></td>' +
      '<td class="r">' + ltp(s).toFixed(2) + '</td>' +
      '<td class="r ' + cls(c.pct) + '">' + sign(c.pct) + '%</td>' +
      '<td class="r">' + actions + '</td></tr>';
  }).join('');
}

function renderPositions() {
  const rows = Object.entries(S.positions);
  $('posEmpty').classList.toggle('hide', rows.length > 0);
  $('posTable').querySelector('tbody').innerHTML = rows.map(([s, p]) => {
    const pl = (ltp(s) - p.avg) * p.qty, plp = ((ltp(s) - p.avg) / p.avg) * 100;
    return '<tr data-sym="' + s + '">' +
      '<td><strong>' + s + '</strong></td><td class="r">' + p.qty + '</td><td class="r">' + p.avg.toFixed(2) + '</td>' +
      '<td class="r">' + ltp(s).toFixed(2) + '</td>' +
      '<td class="r ' + cls(pl) + '">' + sign(pl) + '<br><span style="font-size:11px">' + sign(plp) + '%</span></td>' +
      '<td class="r"><button class="mini s" data-close="' + s + '">Exit</button></td></tr>';
  }).join('');
}

function renderPending() {
  $('pendEmpty').classList.toggle('hide', S.pending.length > 0);
  $('pendTable').querySelector('tbody').innerHTML = S.pending.map(o =>
    '<tr><td>' + o.sym + '</td><td class="' + (o.side === 'BUY' ? 'up' : 'dn') + '">' + o.side + '</td>' +
    '<td class="r">' + o.qty + '</td><td class="r">' + o.limit.toFixed(2) + '</td>' +
    '<td class="r"><button class="mini x" data-cancel="' + o.id + '">Cancel</button></td></tr>').join('');
}

function renderHistory() {
  $('histEmpty').classList.toggle('hide', S.trades.length > 0);
  $('histTable').querySelector('tbody').innerHTML = S.trades.slice(0, 100).map(t =>
    '<tr><td>' + new Date(t.ts).toLocaleString('en-IN', { hour12: false }) + '</td><td>' + t.sym + '</td>' +
    '<td class="' + (t.side === 'BUY' ? 'up' : 'dn') + '">' + t.side + '</td><td class="r">' + t.qty + '</td>' +
    '<td class="r">' + t.price.toFixed(2) + '</td></tr>').join('');
}

function renderQuote() {
  const c = chgOf(selected);
  $('chartTitle').textContent = selected;
  $('qPrice').textContent = inr(ltp(selected));
  const el = $('qChange');
  el.textContent = sign(c.abs) + ' (' + sign(c.pct) + '%)';
  el.className = 'chg ' + cls(c.pct);
  $('qName').textContent = META[selected] ? META[selected].name : '';
  const os = $('oSymbol').value.trim().toUpperCase();
  const target = META[os] ? os : selected;
  $('oEst').textContent = 'Estimated value: ' + inr((parseInt($('oQty').value, 10) || 0) * ltp(target));
}

function renderBadges() {
  const mb = $('marketBadge'), open = marketOpen();
  mb.textContent = open ? '● NSE OPEN' : '● NSE CLOSED';
  mb.className = 'badge ' + (open ? 'open' : 'closed');
  const fb = $('feedBadge');
  fb.textContent = feedMode === 'live' ? 'Live feed' : feedMode === 'sim' ? 'Simulated feed' : 'Connecting…';
  fb.className = 'badge feed ' + (feedMode === 'live' ? 'live' : feedMode === 'sim' ? 'sim' : '');
  fb.title = feedMode === 'sim'
    ? 'Live market data could not be reached from this browser, so prices are simulated.'
    : 'Quotes from a public market-data endpoint.';
  $('clock').textContent = istNow().toLocaleTimeString('en-IN', { hour12: false }) + ' IST';
}

function renderAll() {
  renderBadges(); renderSummary(); renderTicker(); renderWatch();
  renderPositions(); renderPending(); renderHistory(); renderQuote(); drawChart();
}

/* ---------------------------- chart drawing ------------------------- */
function drawChart() {
  const cv = $('chart'), key = selected + '|' + range, s = series[key] || series[selected + '|1d'];
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = 240;
  cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  if (!s || s.c.length < 2) {
    x.fillStyle = '#93a0c4'; x.font = '13px Segoe UI'; x.textAlign = 'center';
    x.fillText('Loading chart…', w / 2, h / 2); return;
  }
  const c = s.c, pad = { l: 8, r: 58, t: 12, b: 18 };
  const min = Math.min.apply(null, c), max = Math.max.apply(null, c), span = (max - min) || 1;
  const X = i => pad.l + (i / (c.length - 1)) * (w - pad.l - pad.r);
  const Y = v => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);
  const rising = c[c.length - 1] >= c[0];
  const col = rising ? '#16c784' : '#ea3943';

  // grid + axis labels
  x.strokeStyle = 'rgba(147,160,196,.15)'; x.fillStyle = '#93a0c4';
  x.font = '10px Segoe UI'; x.textAlign = 'left'; x.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + (span * i) / 4, y = Y(v);
    x.beginPath(); x.moveTo(pad.l, y); x.lineTo(w - pad.r, y); x.stroke();
    x.fillText(v.toFixed(2), w - pad.r + 6, y + 3);
  }
  // area fill
  const g = x.createLinearGradient(0, pad.t, 0, h);
  g.addColorStop(0, rising ? 'rgba(22,199,132,.30)' : 'rgba(234,57,67,.30)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.beginPath(); x.moveTo(X(0), Y(c[0]));
  c.forEach((v, i) => x.lineTo(X(i), Y(v)));
  x.lineTo(X(c.length - 1), h - pad.b); x.lineTo(X(0), h - pad.b); x.closePath();
  x.fillStyle = g; x.fill();
  // line
  x.beginPath(); x.moveTo(X(0), Y(c[0]));
  c.forEach((v, i) => x.lineTo(X(i), Y(v)));
  x.strokeStyle = col; x.lineWidth = 2; x.stroke();
  // last point marker
  x.beginPath(); x.arc(X(c.length - 1), Y(c[c.length - 1]), 3.5, 0, 7); x.fillStyle = col; x.fill();
}

/* ------------------------------ events ------------------------------ */
function selectSymbol(sym) {
  if (!META[sym]) return;
  selected = sym;
  if (!isIndex(sym)) $('oSymbol').value = sym;
  renderQuote();
  loadRange(sym, range);
}

function bind() {
  $('symbolList').innerHTML = UNIVERSE.map(u => '<option value="' + u[0] + '">' + u[2] + '</option>').join('');

  $('addForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('addInput').value.trim().toUpperCase();
    if (!META[v]) return toast('Symbol not supported: ' + v, 'err');
    if (S.watch.indexOf(v) !== -1) return toast(v + ' is already in your watchlist');
    S.watch.push(v); save(); $('addInput').value = ''; renderWatch(); refresh();
    toast(v + ' added to watchlist', 'ok');
  });

  $('watchTable').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) {
      if (b.dataset.rm) { S.watch = S.watch.filter(s => s !== b.dataset.rm); save(); renderWatch(); return; }
      if (b.dataset.buy) { selectSymbol(b.dataset.buy); return execute(b.dataset.buy, 'BUY', parseInt($('oQty').value, 10) || 1, ltp(b.dataset.buy)); }
      if (b.dataset.sell) { selectSymbol(b.dataset.sell); return execute(b.dataset.sell, 'SELL', parseInt($('oQty').value, 10) || 1, ltp(b.dataset.sell)); }
    }
    const tr = e.target.closest('tr[data-sym]');
    if (tr) selectSymbol(tr.dataset.sym);
  });

  $('posTable').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && b.dataset.close) { const s = b.dataset.close; return execute(s, 'SELL', S.positions[s].qty, ltp(s)); }
    const tr = e.target.closest('tr[data-sym]'); if (tr) selectSymbol(tr.dataset.sym);
  });

  $('pendTable').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && b.dataset.cancel) { S.pending = S.pending.filter(o => o.id !== b.dataset.cancel); save(); renderPending(); toast('Order cancelled'); }
  });

  $('btnBuy').onclick = () => placeOrder('BUY');
  $('btnSell').onclick = () => placeOrder('SELL');
  $('oType').onchange = e => $('oLimitWrap').classList.toggle('hide', e.target.value !== 'LIMIT');
  $('oQty').oninput = renderQuote;
  $('oSymbol').onchange = () => { const v = $('oSymbol').value.trim().toUpperCase(); if (META[v]) selectSymbol(v); renderQuote(); };

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(o => o.classList.remove('on'));
      t.classList.add('on');
      ['pos', 'pend', 'hist'].forEach(k => $('tab-' + k).classList.toggle('hide', k !== t.dataset.tab));
    };
  });

  $('rangeBtns').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#rangeBtns button').forEach(o => o.classList.remove('on'));
    b.classList.add('on'); range = b.dataset.r; loadRange(selected, range);
  });

  $('btnReset').onclick = () => {
    if (!confirm('Reset your paper account back to \u20B910,00,000? All positions and history will be erased.')) return;
    S = defaultState(); save(); renderAll(); toast('Account reset to ' + inr(START_CASH), 'ok');
  };

  $('btnExport').onclick = () => {
    if (!S.trades.length) return toast('No trades to export');
    const rows = [['Time', 'Symbol', 'Side', 'Qty', 'Price', 'Brokerage', 'Value']]
      .concat(S.trades.map(t => [new Date(t.ts).toISOString(), t.sym, t.side, t.qty, t.price.toFixed(2), t.fee, (t.qty * t.price).toFixed(2)]));
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'paper-trades.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  window.addEventListener('resize', drawChart);
}

/* ------------------------------- boot ------------------------------- */
function boot() {
  bind();
  activeSymbols().forEach(s => { if (!quotes[s]) quotes[s] = { price: META[s].base, prev: META[s].base, ts: 0 }; });
  renderAll();
  refresh().then(() => loadRange(selected, range));
  setInterval(refresh, 10000);          // quote refresh
  setInterval(renderBadges, 1000);      // clock
}
document.addEventListener('DOMContentLoaded', boot);
