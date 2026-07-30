/* PaperTrade NSE — beginner paper-trading demo.
   No real money, no broker, no exchange connectivity.
   Quotes come from /api/quotes (NSE proxy). If that is unavailable,
   the app falls back to a local simulated feed so the demo always works. */
(function () {
  'use strict';

  var START_CASH = 1000000; // ₹10,00,000 virtual
  var STORAGE_KEY = 'papertrade-nse-v1';
  var REFRESH_MS = 5000;

  // Seed universe: NSE large caps with indicative reference prices.
  var UNIVERSE = [
    { symbol: 'RELIANCE',   name: 'Reliance Industries',        base: 1420 },
    { symbol: 'TCS',        name: 'Tata Consultancy Services',  base: 3180 },
    { symbol: 'HDFCBANK',   name: 'HDFC Bank',                  base: 1960 },
    { symbol: 'INFY',       name: 'Infosys',                    base: 1580 },
    { symbol: 'ICICIBANK',  name: 'ICICI Bank',                 base: 1310 },
    { symbol: 'SBIN',       name: 'State Bank of India',        base: 830 },
    { symbol: 'ITC',        name: 'ITC',                        base: 415 },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel',              base: 1890 },
    { symbol: 'LT',         name: 'Larsen & Toubro',            base: 3620 },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',         base: 2380 },
    { symbol: 'MARUTI',     name: 'Maruti Suzuki',              base: 12800 },
    { symbol: 'TATAMOTORS', name: 'Tata Motors',                base: 690 },
    { symbol: 'AXISBANK',   name: 'Axis Bank',                  base: 1150 },
    { symbol: 'WIPRO',      name: 'Wipro',                      base: 255 },
    { symbol: 'SUNPHARMA',  name: 'Sun Pharmaceutical',         base: 1720 }
  ];

  var quotes = {};   // symbol -> { price, prevClose, name }
  var state = load();
  var feedMode = 'connecting';

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function money(n) {
    var sign = n < 0 ? '-' : '';
    return sign + '₹' + Math.abs(n).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (typeof s.cash === 'number' && s.holdings && s.orders) return s;
      }
    } catch (e) { /* corrupt or unavailable storage → fresh account */ }
    return { cash: START_CASH, holdings: {}, orders: [] };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function priceOf(sym) {
    return quotes[sym] ? quotes[sym].price : 0;
  }

  // ---------- simulated feed (fallback) ----------
  function seedSimulated() {
    UNIVERSE.forEach(function (s) {
      if (!quotes[s.symbol]) {
        quotes[s.symbol] = { price: s.base, prevClose: s.base, name: s.name };
      }
    });
  }

  function tickSimulated() {
    UNIVERSE.forEach(function (s) {
      var q = quotes[s.symbol];
      var drift = (Math.random() - 0.5) * 0.004;        // ±0.2% per tick
      var next = q.price * (1 + drift);
      var lo = s.base * 0.9, hi = s.base * 1.1;         // keep it realistic
      q.price = Math.min(hi, Math.max(lo, Math.round(next * 100) / 100));
    });
  }

  // ---------- live feed ----------
  function fetchQuotes() {
    var symbols = UNIVERSE.map(function (s) { return s.symbol; }).join(',');
    return fetch('./api/quotes?symbols=' + encodeURIComponent(symbols), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('feed ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.quotes) || !data.quotes.length) throw new Error('empty feed');
        data.quotes.forEach(function (q) {
          if (!q || !q.symbol || typeof q.price !== 'number' || !isFinite(q.price)) return;
          var known = quotes[q.symbol] || {};
          quotes[q.symbol] = {
            price: q.price,
            prevClose: typeof q.prevClose === 'number' && q.prevClose > 0 ? q.prevClose : (known.prevClose || q.price),
            name: q.name || known.name || q.symbol
          };
        });
        setFeed(data.source === 'nse' ? 'live' : 'sim');
      });
  }

  function setFeed(mode) {
    if (feedMode === mode) return;
    feedMode = mode;
    var el = $('feedStatus');
    el.classList.remove('live', 'sim');
    if (mode === 'live') {
      el.textContent = '● Live NSE feed';
      el.classList.add('live');
    } else if (mode === 'sim') {
      el.textContent = '● Simulated feed (live NSE data unavailable)';
      el.classList.add('sim');
    } else {
      el.textContent = 'Connecting…';
    }
  }

  function refresh() {
    fetchQuotes()
      .catch(function () { tickSimulated(); setFeed('sim'); })
      .then(render, render);
  }

  // ---------- rendering ----------
  var lastPrices = {};

  function changeCell(q) {
    var diff = q.price - q.prevClose;
    var pct = q.prevClose ? (diff / q.prevClose) * 100 : 0;
    var cls = diff >= 0 ? 'up' : 'down';
    var sign = diff >= 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + diff.toFixed(2) + ' (' + sign + pct.toFixed(2) + '%)</span>';
  }

  function renderWatch() {
    var term = ($('search').value || '').trim().toUpperCase();
    var body = $('watchBody');
    var rows = UNIVERSE.filter(function (s) {
      return !term || s.symbol.indexOf(term) === 0 || s.name.toUpperCase().indexOf(term) !== -1;
    });
    body.innerHTML = rows.map(function (s) {
      var q = quotes[s.symbol];
      if (!q) return '';
      return '<tr data-sym="' + s.symbol + '">' +
        '<td><span class="sym">' + s.symbol + '</span><span class="name">' + s.name + '</span></td>' +
        '<td class="num" data-price>' + money(q.price) + '</td>' +
        '<td class="num">' + changeCell(q) + '</td>' +
        '<td class="num"><span class="act">' +
          '<button type="button" class="btn buy mini" data-act="BUY" data-sym="' + s.symbol + '">Buy</button>' +
          '<button type="button" class="btn sell mini" data-act="SELL" data-sym="' + s.symbol + '">Sell</button>' +
        '</span></td></tr>';
    }).join('');

    // price flash
    rows.forEach(function (s) {
      var q = quotes[s.symbol];
      var prev = lastPrices[s.symbol];
      if (prev !== undefined && q && prev !== q.price) {
        var cell = body.querySelector('tr[data-sym="' + s.symbol + '"] [data-price]');
        if (cell) cell.classList.add(q.price > prev ? 'flash-up' : 'flash-down');
      }
      if (q) lastPrices[s.symbol] = q.price;
    });
  }

  function renderPortfolio() {
    var body = $('pfBody');
    var syms = Object.keys(state.holdings).filter(function (s) { return state.holdings[s].qty > 0; });
    $('pfEmpty').style.display = syms.length ? 'none' : 'block';
    var holdingsValue = 0;

    body.innerHTML = syms.map(function (sym) {
      var h = state.holdings[sym];
      var px = priceOf(sym) || h.avg;
      var val = px * h.qty;
      var pnl = (px - h.avg) * h.qty;
      holdingsValue += val;
      return '<tr>' +
        '<td><span class="sym">' + sym + '</span></td>' +
        '<td class="num">' + h.qty + '</td>' +
        '<td class="num">' + money(h.avg) + '</td>' +
        '<td class="num">' + money(px) + '</td>' +
        '<td class="num">' + money(val) + '</td>' +
        '<td class="num ' + (pnl >= 0 ? 'up' : 'down') + '">' + money(pnl) + '</td>' +
        '</tr>';
    }).join('');

    var total = state.cash + holdingsValue;
    var pnl = total - START_CASH;
    $('statCash').textContent = money(state.cash);
    $('statHoldings').textContent = money(holdingsValue);
    $('statTotal').textContent = money(total);
    var pnlEl = $('statPnl');
    pnlEl.textContent = (pnl >= 0 ? '+' : '') + money(pnl);
    pnlEl.className = pnl >= 0 ? 'up' : 'down';
  }

  function renderHistory() {
    var body = $('histBody');
    var list = state.orders.slice(0, 30);
    $('histEmpty').style.display = list.length ? 'none' : 'block';
    body.innerHTML = list.map(function (o) {
      return '<tr>' +
        '<td>' + new Date(o.time).toLocaleTimeString('en-IN') + '</td>' +
        '<td class="' + (o.side === 'BUY' ? 'up' : 'down') + '">' + o.side + '</td>' +
        '<td>' + o.symbol + '</td>' +
        '<td class="num">' + o.qty + '</td>' +
        '<td class="num">' + money(o.price) + '</td>' +
        '<td class="num">' + money(o.qty * o.price) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderTicket() {
    var sym = $('symbol').value;
    var qty = parseInt($('qty').value, 10);
    var px = priceOf(sym);
    $('ticketPrice').textContent = money(px);
    $('ticketCost').textContent = money((isFinite(qty) && qty > 0 ? qty : 0) * px);
    var owned = state.holdings[sym] ? state.holdings[sym].qty : 0;
    $('ticketOwned').textContent = 'You own ' + owned + ' share' + (owned === 1 ? '' : 's') + ' of ' + sym;
  }

  function render() {
    renderWatch();
    renderPortfolio();
    renderHistory();
    renderTicket();
  }

  // ---------- trading ----------
  function message(text, ok) {
    var el = $('orderMsg');
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  function trade(side, sym, qty) {
    if (!sym || !quotes[sym]) { message('Pick a valid stock.', false); return; }
    if (!isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) {
      message('Enter a whole number of shares (1 or more).', false); return;
    }
    var px = priceOf(sym);
    if (!px) { message('Price not available yet. Try again in a moment.', false); return; }
    var amount = px * qty;
    var h = state.holdings[sym] || { qty: 0, avg: 0 };

    if (side === 'BUY') {
      if (amount > state.cash) {
        message('Not enough virtual cash. You need ' + money(amount) + ' but have ' + money(state.cash) + '.', false);
        return;
      }
      var newQty = h.qty + qty;
      h.avg = ((h.avg * h.qty) + amount) / newQty;
      h.qty = newQty;
      state.cash -= amount;
      state.holdings[sym] = h;
      message('Bought ' + qty + ' ' + sym + ' at ' + money(px) + '.', true);
    } else {
      if (h.qty < qty) {
        message('You only own ' + h.qty + ' share(s) of ' + sym + '.', false);
        return;
      }
      h.qty -= qty;
      state.cash += amount;
      if (h.qty === 0) { delete state.holdings[sym]; } else { state.holdings[sym] = h; }
      message('Sold ' + qty + ' ' + sym + ' at ' + money(px) + '.', true);
    }

    state.orders.unshift({ time: Date.now(), side: side, symbol: sym, qty: qty, price: px });
    if (state.orders.length > 200) state.orders.length = 200;
    save();
    render();
  }

  // ---------- init ----------
  function initSymbolSelect() {
    $('symbol').innerHTML = UNIVERSE.map(function (s) {
      return '<option value="' + s.symbol + '">' + s.symbol + ' — ' + s.name + '</option>';
    }).join('');
  }

  function bind() {
    $('orderForm').addEventListener('submit', function (e) {
      e.preventDefault();
      trade('BUY', $('symbol').value, parseInt($('qty').value, 10));
    });
    document.querySelector('.btn.sell[data-side="SELL"]').addEventListener('click', function () {
      trade('SELL', $('symbol').value, parseInt($('qty').value, 10));
    });
    $('watchBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      $('symbol').value = btn.getAttribute('data-sym');
      renderTicket();
      trade(btn.getAttribute('data-act'), btn.getAttribute('data-sym'), parseInt($('qty').value, 10));
    });
    $('symbol').addEventListener('change', renderTicket);
    $('qty').addEventListener('input', renderTicket);
    $('search').addEventListener('input', renderWatch);
    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('Reset your demo account back to ₹10,00,000 and clear all trades?')) return;
      state = { cash: START_CASH, holdings: {}, orders: [] };
      save();
      message('Account reset to ' + money(START_CASH) + '.', true);
      render();
    });
  }

  seedSimulated();
  initSymbolSelect();
  bind();
  render();
  refresh();
  setInterval(refresh, REFRESH_MS);
})();
