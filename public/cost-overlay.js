  (function () {
  'use strict';


  const POLL_MS  = 2000;
  const RED_PCT  = 0.95;

  // Themed via the app's CSS variables so the card follows light/dark switches.
  const C = {
    bg: 'var(--surface)', fg: 'var(--ink)', border: 'var(--line-strong)', dim: 'var(--muted)',
    green: 'var(--success)', gold: 'var(--warning)', red: 'var(--danger)', barRed: 'var(--danger)'
  };
  const SHADOW = '0 4px 18px color-mix(in srgb, var(--ink) 16%, transparent)';

  // Ported from a Tampermonkey script: GM_* storage replaced with localStorage.
  const NS = 'pi-livecraft.cost-overlay.'
  const store = {
    get(k, d) {
      try { const v = JSON.parse(localStorage.getItem(NS + k)); return v === null || v === undefined ? d : v; } catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* noop */ } }
  };

  // ---------- DOM ----------
  const card = document.createElement('div');
  card.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'box-sizing:border-box',
    'width:194px', 'background:' + C.bg, 'color:' + C.fg,
    'border:1px solid ' + C.border, 'border-radius:12px',
    'padding:10px 12px', 'font:12px/1.55 "Segoe UI",system-ui,sans-serif',
    'user-select:none', 'box-shadow:' + SHADOW
  ].join(';');

  function row() {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline';
    body.appendChild(d);
    return d;
  }
  function barEl() {
    const b = document.createElement('div');
    b.style.cssText = 'height:4px;border-radius:2px;background:' + C.border + ';margin:3px 0 4px;overflow:hidden';
    const f = document.createElement('div');
    f.style.cssText = 'height:100%;border-radius:2px;width:0%;background:' + C.green;
    b.appendChild(f);
    return b;
  }
  function label(t) {
    const s = document.createElement('span');
    s.style.cssText = 'color:' + C.dim + ';font-size:11px';
    s.textContent = t;
    return s;
  }
  function value(t, color) {
    const s = document.createElement('span');
    s.style.cssText = 'font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap';
    s.style.color = color || C.fg;
    s.textContent = t;
    return s;
  }

  // header (drag handle) - the dot doubles as the minimize toggle
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:move;margin-bottom:6px';
  const dotWrap = document.createElement('span');
  dotWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;cursor:pointer';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + C.dim;
  dotWrap.appendChild(dot);
  const title = document.createElement('span');
  title.textContent = 'STUDIO COST';
  title.style.cssText = 'color:' + C.dim + ';font-size:11px;letter-spacing:.08em';
  head.append(dotWrap, title);
  card.appendChild(head);

  // body = everything below the header; hidden when minimized
  const body = document.createElement('div');
  card.appendChild(body);

  const rState = row();
  const stState = value('IDLE', C.dim);
  rState.append(label('State'), stState);

  const rPerf = row();
  const stPerf = value('–');
  rPerf.append(label('Perf'), stPerf);

  const rSession = row();
  const stSession = value('0 RON', C.gold);
  rSession.append(label('Session'), stSession);

  const rMonth = row();
  const stMonth = value('0 RON', C.gold);
  rMonth.append(label('Month'), stMonth);

  const rTokens = row();
  const stTokens = value('0');
  rTokens.append(label('Tokens'), stTokens);

  const rGpu1 = row();
  const barGpu1 = barEl();
  body.appendChild(barGpu1);
  const rGpu2 = row();
  const barGpu2 = barEl();
  body.appendChild(barGpu2);
  const rRam  = row();
  const barRam = barEl();
  body.appendChild(barRam);

  // GPU merge (mirror of the widget): click a GPU row -> GPU1+GPU2 collapse
  // into one combined "GPU" row; click again reverts. In-memory only - not
  // persisted (the overlay reloads fresh each page load).
  let gpuMerged = false;
  let lastData = null;
  function toggleGpuMerge() {
    gpuMerged = !gpuMerged;
    if (lastData) render(lastData);
  }
  rGpu1.style.cursor = 'pointer';
  rGpu2.style.cursor = 'pointer';
  rGpu1.addEventListener('click', toggleGpuMerge);
  rGpu2.addEventListener('click', toggleGpuMerge);

  const foot = document.createElement('div');
  foot.style.cssText = 'margin-top:6px;display:flex;justify-content:space-between;align-items:baseline;font-size:10px;color:' + C.dim;
  const stActive = document.createElement('span');
  const stLive = document.createElement('span');
  const feedBtn = document.createElement('button');
  feedBtn.textContent = 'monitor';
  feedBtn.style.cssText = 'background:transparent;border:none;color:' + C.dim + ';font:10px "Segoe UI",system-ui,sans-serif;cursor:pointer;padding:0;margin-left:8px;letter-spacing:.02em';
  feedBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  feedBtn.addEventListener('click', () => toggleFeed());
  const footRight = document.createElement('span');
  footRight.style.cssText = 'display:inline-flex;align-items:baseline;gap:8px';
  footRight.append(stLive, feedBtn);
  foot.append(stActive, footRight);
  body.appendChild(foot);

  // ---------- tps feed (mirror of the widget's 'monitor' panel) ----------
  // 'monitor' button in the footer toggles a log below the rows. The card is
  // anchored by its top, so opening it grows the card DOWNWARD - the cost rows
  // stay exactly where they are.
  const feedStyle = document.createElement('style');
  feedStyle.textContent = '.sc-feed::-webkit-scrollbar{width:0;height:0;display:none}';
  document.head.appendChild(feedStyle);
  const feedPanel = document.createElement('div');
  feedPanel.className = 'sc-feed';
  feedPanel.style.cssText = 'display:none;margin-top:8px;padding-top:8px;border-top:1px solid ' + C.border + ';max-height:300px;overflow-y:auto;scrollbar-width:none;font:12px/1.5 Consolas,monospace';
  const feedBox = document.createElement('div');
  feedPanel.appendChild(feedBox);
  body.appendChild(feedPanel);

  document.body.appendChild(card);

  // ---------- rows ----------
  // green -> gold >= 75% -> red >= 95%; used by the bar fill and the
  // used-value label (the fill passes C.barRed - a touch deeper)
  function barColor(p, red) {
    red = red || C.red;
    return p >= RED_PCT ? red : p >= 0.75 ? C.gold : C.green;
  }

  function setUsage(rowEl, bar, name, used, total) {
    rowEl.textContent = '';
    rowEl.appendChild(label(name));
    const fill = bar.firstChild;
    if (used == null || total == null) {
      const v = value('–');
      v.style.color = C.dim;
      rowEl.appendChild(v);
      fill.style.width = '0%';
      return;
    }
    const pct = total > 0 ? used / total : 0;
    const danger = pct >= RED_PCT;
    const v = document.createElement('span');
    v.style.cssText = 'display:flex;align-items:baseline;justify-content:flex-end;gap:16px;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap';
    const mid = document.createElement('span');
    const a = document.createElement('span'); a.style.color = barColor(pct); a.textContent = used.toFixed(1);
    const b = document.createElement('span'); b.style.color = C.green; b.textContent = ' / ' + total.toFixed(1) + ' Gb';
    mid.append(a, b);
    const c = document.createElement('span'); c.style.color = danger ? C.red : C.gold; c.textContent = Math.round(pct * 100) + '%';
    v.append(mid, c);
    rowEl.appendChild(v);
    fill.style.width = Math.max(0, Math.min(100, pct * 100)) + '%';
    fill.style.background = barColor(pct, C.barRed);
  }

  function fmtRon(v) {
    v = v || 0;
    return v < 10 ? v.toFixed(3) : v.toFixed(2);
  }
  function fmtHMS(s) {
    s = Math.max(0, Math.floor(s || 0));
    const p = (n) => String(n).padStart(2, '0');
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
  }

  let activeNow = false;
  // per-turn timer from the engine (exact, matches the widget);
  // extrapolated between polls so the count ticks smoothly
  let lastTurnS = 0, lastTurnSTime = 0;
  function turnSeconds() {
    return activeNow ? lastTurnS + (Date.now() - lastTurnSTime) / 1000 : lastTurnS;
  }
  function render(d) {
    const active = !!d.active;
    activeNow = active;
    lastTurnS = d.turn_s || 0;
    lastTurnSTime = Date.now();
    stState.textContent = active ? 'ACTIVE' : 'IDLE';
    stState.style.color = active ? C.green : C.dim;
    // two spans with a real gap - consecutive spaces in one string
    // collapse to a single space, so t/s and W crowded each other
    stPerf.textContent = '';
    const a = document.createElement('span');
    a.textContent = d.tps != null ? d.tps.toFixed(1) + ' t/s' : '– t/s';
    const b = document.createElement('span');
    b.textContent = d.watts != null ? Math.round(d.watts) + ' W' : '– W';
    a.style.marginRight = '14px';
    stPerf.append(a, b);
    stSession.textContent = fmtRon(d.session_cost_ron) + ' RON';
    stMonth.textContent = fmtRon(d.month_cost_ron) + ' RON';
    stTokens.textContent = (d.session_tokens || 0).toLocaleString();
    lastData = d;
    const g = d.gpu_mem || [];
    if (gpuMerged && g.length >= 2) {
      setUsage(rGpu1, barGpu1, 'GPU', g[0][0] + g[1][0], g[0][1] + g[1][1]);
      rGpu2.style.display = 'none';
      barGpu2.style.display = 'none';
    } else {
      setUsage(rGpu1, barGpu1, 'GPU1', g[0] ? g[0][0] : null, g[0] ? g[0][1] : null);
      setUsage(rGpu2, barGpu2, 'GPU2', g[1] ? g[1][0] : null, g[1] ? g[1][1] : null);
      rGpu2.style.display = 'flex';
      barGpu2.style.display = '';
    }
    setUsage(rRam, barRam, 'RAM', d.ram ? d.ram[0] : null, d.ram ? d.ram[1] : null);
    renderFeed(d);
  }

  // ---------- tps feed render (mirror of the widget) ----------
  let feedOpen = false;
  function toggleFeed() {
    feedOpen = !feedOpen;
    feedPanel.style.display = feedOpen ? 'block' : 'none';
    feedBtn.style.color = feedOpen ? C.green : C.dim;
    if (feedOpen) requestAnimationFrame(() => { feedPanel.scrollTop = feedPanel.scrollHeight; });
  }
  const FEED_TPS = /^(.*?)( @ [\d.]+)( t\/s)(.*)$/;
  let feedSeen = 0;
  function feedLineEl(ln) {
    const d = document.createElement('div');
    if (/^\.{3,}$/.test(ln)) {              // dotted separator (dim)
      d.style.cssText = 'color:' + C.dim + ';white-space:nowrap;overflow:hidden;letter-spacing:.15em';
      d.textContent = ln;
      return d;
    }
    if (ln.indexOf('==') === 0) {           // '== watching:' header (dim)
      d.style.cssText = 'color:' + C.dim;
      d.textContent = ln;
      return d;
    }
    d.style.cssText = 'white-space:pre-wrap;word-break:break-word';
    const m = FEED_TPS.exec(ln);
    if (m) {
      const a = document.createElement('span'); a.textContent = m[1];
      const b = document.createElement('span'); b.style.color = C.gold; b.textContent = m[2];
      const c = document.createElement('span'); c.textContent = m[3] + m[4];
      d.append(a, b, c);
    } else {
      d.textContent = ln;
    }
    return d;
  }
  function feedAtBottom() {
    return feedPanel.scrollTop + feedPanel.clientHeight >= feedPanel.scrollHeight - 4;
  }
  function renderFeed(d) {
    const total = d.feed_total || 0;
    const lines = d.feed || [];
    if (total <= feedSeen || !lines.length) return;
    const stick = feedOpen && feedAtBottom();   // capture BEFORE appending - scrollHeight grows after
    const start = Math.max(0, lines.length - (total - feedSeen));
    for (let i = start; i < lines.length; i++) feedBox.appendChild(feedLineEl(lines[i]));
    feedSeen = total;
    while (feedBox.children.length > 60) feedBox.removeChild(feedBox.firstChild);
    if (stick) feedPanel.scrollTop = feedPanel.scrollHeight;
  }

  // ---------- footer (freshness) ----------
  let lastOk = 0, everOk = false;
  function tickFoot() {
    const age = everOk ? Math.round((Date.now() - lastOk) / 1000) : 0;
    const stale = everOk && age >= 8;
    // dot = status lamp: red stale / green active / dim idle
    // (it's the only visible cue while minimized)
    dot.style.background = stale ? C.red : (activeNow ? C.green : C.dim);
    stActive.textContent = fmtHMS(turnSeconds()) + (activeNow ? ' active' : ' last active');
    stActive.style.color = activeNow ? C.green : C.dim;
    if (!everOk) { stLive.textContent = 'waiting for data…'; stLive.style.color = C.dim; return; }
    stLive.textContent = stale ? 'stale · last ' + age + 's' : 'live';
    stLive.style.color = stale ? C.red : C.dim;
  }

  // ---------- polling ----------
  // Data path per origin:
  //  - a.rraven.org (remote Studio): same-origin /cost.json, NPM location ->
  //    widget 192.168.0.9:8787. Page CSP is connect-src 'self', so the page's
  //    own window.fetch is allowed - no GM_xmlhttpRequest (broken on AdGuard
  //    Mobile, AdguardForAndroid #5736), no CORS needed (same-origin).
  //  - 127.0.0.1:5173 (local Studio): cross-origin straight to the widget;
  //    needs cors_origin "*" in config.json. No preflight (plain GET).
  const DATA_URL = location.hostname === '127.0.0.1'
    ? 'http://localhost:8787/cost.json'
    : location.origin + '/cost.json';
  function poll() {
    window.fetch(DATA_URL, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((data) => {
        try {
          render(data);
          lastOk = Date.now();
          everOk = true;
        } catch (e) { /* bad payload - footer shows stale */ }
        tickFoot();
      })
      .catch(() => tickFoot());
  }

  // ---------- position (remembered) + drag ----------
  let pos = store.get('pos', null);
  function valid(p) {
    return p && typeof p.x === 'number' && typeof p.y === 'number' &&
      p.x > -card.offsetWidth + 40 && p.x < window.innerWidth - 40 &&
      p.y > -40 && p.y < window.innerHeight - 40;
  }
  if (!valid(pos)) {
    pos = { x: window.innerWidth - card.offsetWidth - 16, y: 16 };
  }
  function place() { card.style.left = pos.x + 'px'; card.style.top = pos.y + 'px'; }
  place();

  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pos.x = Math.max(-card.offsetWidth + 40, Math.min(window.innerWidth - 40, e.clientX - drag.dx));
    pos.y = Math.max(0, Math.min(window.innerHeight - 20, e.clientY - drag.dy));
    place();
  });
  head.addEventListener('pointerup', () => {
    if (drag) { drag = null; store.set('pos', pos); }
  });

  // ---------- minimize (dot click) ----------
  const CARD_CSS = card.style.cssText;
  const HEAD_CSS = head.style.cssText;
  let minimized = false;
  function setMinimized(m) {
    minimized = m;
    if (m) {
      card.style.cssText = 'position:fixed;z-index:2147483647;box-sizing:border-box;width:26px;height:26px;background:' + C.bg + ';border:1px solid ' + C.border + ';border-radius:50%;box-shadow:' + SHADOW + ';user-select:none';
      head.style.cssText = 'display:flex;align-items:center;justify-content:center;height:24px';
      body.style.display = 'none';
      title.style.display = 'none';
      feedBtn.style.display = 'none';
    } else {
      card.style.cssText = CARD_CSS;
      head.style.cssText = HEAD_CSS;
      body.style.display = '';
      title.style.display = '';
      feedBtn.style.display = '';
    }
    place();
  }
  dotWrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  dotWrap.addEventListener('click', () => setMinimized(!minimized));

  // ---------- visibility gating ----------
  // nobody looking -> stop pulling. resume = immediate refresh.
  let pollTimer = null, footTimer = null, winFocus = true;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_MS);
    footTimer = setInterval(tickFoot, 1000);
    poll();
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (footTimer) { clearInterval(footTimer); footTimer = null; }
    if (everOk) { stLive.textContent = 'paused'; stLive.style.color = C.dim; }
  }
  function refreshGating() {
    if (document.visibilityState === 'visible' && winFocus) startPolling();
    else stopPolling();
  }
  document.addEventListener('visibilitychange', refreshGating);
  window.addEventListener('blur',  () => { winFocus = false; refreshGating(); });
  window.addEventListener('focus', () => { winFocus = true;  refreshGating(); });
  refreshGating();
})();