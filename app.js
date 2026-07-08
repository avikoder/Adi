/* ============================================================
 * Aditi Makeup Artistry — Booking Studio
 * Vanilla JS · IndexedDB (with localStorage fallback) · fully offline
 * ============================================================ */
'use strict';

/* -------------------- Persistence layer -------------------- */
const DB_NAME = 'aditi-ma-db';
const STORE = 'bookings';
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}
function _os(mode) { return _db.transaction(STORE, mode).objectStore(STORE); }
function idbAll() {
  return new Promise((res, rej) => { const r = _os('readonly').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
}
function idbPut(o) { return new Promise((res, rej) => { const r = _os('readwrite').put(o); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
function idbDel(id) { return new Promise((res, rej) => { const r = _os('readwrite').delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
function idbClear() { return new Promise((res, rej) => { const r = _os('readwrite').clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }

// Store abstraction — IndexedDB primary, localStorage fallback (private mode, quota, etc.)
const Store = (() => {
  let mode = 'idb';
  const LS = 'aditi-ma-bookings';
  const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (_) { return []; } };
  const lsSave = (a) => localStorage.setItem(LS, JSON.stringify(a));
  return {
    async init() { try { await openDB(); mode = 'idb'; } catch (_) { mode = 'ls'; } },
    async all() {
      if (mode === 'idb') { try { return await idbAll(); } catch (_) { mode = 'ls'; } }
      return lsAll();
    },
    async put(o) {
      if (mode === 'idb') { try { await idbPut(o); return; } catch (_) { mode = 'ls'; } }
      const a = lsAll(); const i = a.findIndex((x) => x.id === o.id);
      if (i >= 0) a[i] = o; else a.push(o); lsSave(a);
    },
    async remove(id) {
      if (mode === 'idb') { try { await idbDel(id); return; } catch (_) { mode = 'ls'; } }
      lsSave(lsAll().filter((x) => x.id !== id));
    },
    async clear() {
      if (mode === 'idb') { try { await idbClear(); return; } catch (_) { mode = 'ls'; } }
      lsSave([]);
    }
  };
})();

// Settings (small key/value) in localStorage
const Settings = {
  KEY: 'aditi-ma-settings',
  data: { name: '', phone: '', upi: '' },
  load() { try { Object.assign(this.data, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (_) {} },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); }
};

/* -------------------- Utilities -------------------- */
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const money = (n) => INR.format(Math.round(Number(n) || 0)); // ₹1,50,000 (Indian grouping)
const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseDate(str) { if (!str) return null; const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
function todayMid() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function dateKey(dt) { return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
function diffDays(str) { const d = parseDate(str); if (!d) return NaN; return Math.round((d - todayMid()) / 86400000); }
const isToday = (str) => diffDays(str) === 0;
const isTomorrow = (str) => diffDays(str) === 1;

function fmt12(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; }
function prettyDate(str) { const d = parseDate(str); return d ? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
function dayLong(str) { const d = parseDate(str); return d ? d.toLocaleDateString('en-IN', { weekday: 'long' }) : ''; }

function targetTs(b) { if (!b.ready) return null; const d = parseDate(b.date); const [h, m] = b.ready.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); }
function countdownText(ts) {
  if (ts == null) return '';
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60), rem = mins % 60;
  if (hrs < 24) return rem ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

// Derived money + status
const grandTotal = (b) => num(b.total) + (b.travel === 'outstation' ? num(b.surcharge) : 0);
const outstanding = (b) => Math.max(0, grandTotal(b) - num(b.advance));
function statusOf(b) {
  if (b.done) return { key: 'done', label: 'Completed', cls: 'done' };
  if (outstanding(b) > 0) return { key: 'pending', label: 'Balance due', cls: 'pending' };
  return { key: 'upcoming', label: 'Upcoming', cls: 'upcoming' };
}
const TRAVEL_LABEL = { studio: 'In-Studio', local: 'Local · Pune', outstation: 'Outstation' };

// Phone → wa.me format (India-first)
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}
function upiLink({ pa, pn, am, tn }) {
  const p = new URLSearchParams();
  p.set('pa', pa); p.set('pn', pn || 'Aditi Makeup Artistry'); p.set('cu', 'INR');
  if (am && am > 0) p.set('am', String(am));
  if (tn) p.set('tn', tn);
  return 'upi://pay?' + p.toString();
}

/* -------------------- App -------------------- */
const App = {
  bookings: [],
  view: 'home',
  filter: 'all',
  payBooking: null,
  payAmount: 0,

  async init() {
    Settings.load();
    await Store.init();
    await this.load();
    this.reflectSettings();
    this.bindSettings();
    this.bindFilters();
    this.applyGreeting();
    this.updateNotifUI();
    this.checkDailyReminder();

    // URL shortcuts from the manifest (?action=add / ?view=…)
    const q = new URLSearchParams(location.search);
    if (q.get('view')) this.go(q.get('view'));
    if (q.get('action') === 'add') setTimeout(() => this.openForm(), 250);

    // Live countdown ticker
    setInterval(() => this.updateCountdowns(), 30000);
  },

  async load() { this.bookings = await Store.all(); },

  async refresh() {
    await this.load();
    this.render();
    this.updateBadges();
  },

  /* ---------- Navigation ---------- */
  go(view) {
    this.view = view;
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    document.querySelectorAll('.tab[data-tab]').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === view));
    document.querySelector('main.viewport').scrollTop = 0;
    this.render();
  },

  render() {
    if (this.view === 'home') this.renderHome();
    else if (this.view === 'bookings') this.renderBookings();
    else if (this.view === 'reminders') this.renderReminders();
    // settings is static; inputs kept in sync separately
  },

  applyGreeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const el = document.getElementById('greeting');
    el.textContent = Settings.data.name ? `${g} · ${Settings.data.name.split(' ')[0]}` : g;
  },

  /* ---------- HOME ---------- */
  renderHome() {
    const today = this.bookings.filter((b) => isToday(b.date))
      .sort((a, b) => (a.ready || '99:99').localeCompare(b.ready || '99:99'));
    const upcoming = this.bookings.filter((b) => diffDays(b.date) > 0)
      .sort((a, b) => (a.date + (a.ready || '')).localeCompare(b.date + (b.ready || '')));
    const tomorrow = this.bookings.filter((b) => isTomorrow(b.date));

    // Reminder banner (Tomorrow highlight — core requirement)
    const bannerEl = document.getElementById('reminderBanner');
    if (tomorrow.length) {
      const names = tomorrow.map((b) => esc(b.name.split(' ')[0])).join(', ');
      const first = tomorrow.slice().sort((a, b) => (a.ready || '99').localeCompare(b.ready || '99'))[0];
      bannerEl.innerHTML = `
        <button class="card" style="width:100%;text-align:left;padding:16px;margin-bottom:16px;background:linear-gradient(135deg,var(--gold-soft),var(--rose-soft));border:none;display:flex;gap:13px;align-items:center;"
                onclick="App.go('reminders')">
          <div style="flex:0 0 auto;width:44px;height:44px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#8A6A22" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A6A22;font-weight:700;">Tomorrow</p>
            <p style="font-weight:600;font-size:14.5px;margin-top:2px;color:var(--ink);">
              ${tomorrow.length} booking${tomorrow.length > 1 ? 's' : ''} · ${names}
            </p>
            <p style="font-size:12.5px;color:var(--ink-soft);margin-top:1px;">
              First up: ${esc(first.name.split(' ')[0])}${first.ready ? ' · ready by ' + fmt12(first.ready) : ''}
            </p>
          </div>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8A6A22" stroke-width="2.2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>
        </button>`;
    } else { bannerEl.innerHTML = ''; }

    // Stat strip
    const total = this.bookings.length;
    const collected = this.bookings.reduce((s, b) => s + num(b.advance), 0);
    const due = this.bookings.reduce((s, b) => s + outstanding(b), 0);
    document.getElementById('statStrip').innerHTML = `
      <div class="card" style="padding:4px 0;margin-bottom:18px;display:grid;grid-template-columns:1fr 1fr 1fr;">
        ${this.statCell(total, 'Bookings', 'ink')}
        <div style="border-left:1px solid var(--line);border-right:1px solid var(--line);">${this.statCellInner(money(collected), 'Collected', 'sage')}</div>
        ${this.statCell(money(due), 'Balance due', 'rose')}
      </div>`;

    // Today's timeline (signature)
    const todayEl = document.getElementById('todayBlock');
    let html = `<div class="flex items-baseline justify-between mb-3">
        <h2 class="serif" style="font-size:22px;font-weight:600;">Today</h2>
        <span class="tag">${todayMid().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
      </div>`;
    if (!today.length) {
      html += `<div class="card empty">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
        <p style="font-weight:600;color:var(--ink);">No bookings today</p>
        <p style="font-size:13px;margin-top:3px;">A rare quiet day — enjoy it.</p>
      </div>`;
    } else {
      html += `<div class="card" style="padding:18px 18px 18px 14px;"><div class="tl">`;
      today.forEach((b) => {
        const st = statusOf(b);
        const ts = targetTs(b);
        const soon = ts && ts - Date.now() < 3 * 3600000 && ts - Date.now() > 0;
        html += `
          <div class="tl-item ${b.done ? 'is-done' : ''} ${soon ? 'is-soon' : ''}">
            <div class="tl-time">
              <div class="h">${b.ready ? fmt12(b.ready).replace(/ (AM|PM)/, '') : '—'}</div>
              <div class="m">${b.ready ? fmt12(b.ready).slice(-2) : 'time'}</div>
            </div>
            <div class="tl-node"></div>
            <button style="width:100%;text-align:left;background:none;border:none;padding:0;" onclick="App.openForm('${b.id}')">
              <div class="flex items-center justify-between">
                <p class="serif" style="font-size:16px;font-weight:600;">${esc(b.name)}</p>
                ${ts && ts > Date.now() && !b.done ? `<span class="pill gold" data-target="${ts}"><span class="countdown">${countdownText(ts)}</span></span>`
                  : `<span class="pill ${st.cls}"><span class="dot"></span>${st.label}</span>`}
              </div>
              <p style="font-size:12.5px;color:var(--ink-soft);margin-top:2px;">
                ${esc(b.service)} · ${esc(b.event)}${b.muhurat ? ` · Muhurat ${fmt12(b.muhurat)}` : ''}
              </p>
            </button>
            <div class="flex" style="gap:8px;margin-top:10px;">
              <button class="btn btn-sm btn-sage" style="flex:1;" onclick="App.whatsapp('${b.id}')">WhatsApp</button>
              ${outstanding(b) > 0 ? `<button class="btn btn-sm btn-soft" style="flex:1;" onclick="App.openPay('${b.id}')">Collect ${money(outstanding(b))}</button>` : ''}
            </div>
          </div>`;
      });
      html += `</div></div>`;
    }
    todayEl.innerHTML = html;

    // Upcoming
    const upEl = document.getElementById('upcomingBlock');
    if (!upcoming.length) { upEl.innerHTML = ''; return; }
    let up = `<div class="flex items-baseline justify-between mt-6 mb-3">
        <h2 class="serif" style="font-size:22px;font-weight:600;">Upcoming</h2>
        ${upcoming.length > 5 ? `<button class="tag" onclick="App.go('bookings')">See all ${upcoming.length}</button>` : ''}
      </div>`;
    upcoming.slice(0, 5).forEach((b) => { up += this.card(b); });
    upEl.innerHTML = up;

    this.updateCountdowns();
  },

  statCell(v, l, color) { return `<div>${this.statCellInner(v, l, color)}</div>`; },
  statCellInner(v, l, color) {
    const c = color === 'sage' ? 'var(--sage)' : color === 'rose' ? 'var(--rose-deep)' : 'var(--ink)';
    return `<div style="text-align:center;padding:14px 6px;">
        <p class="serif" style="font-size:19px;font-weight:700;color:${c};line-height:1;">${v}</p>
        <p class="eyebrow" style="margin-top:6px;font-size:10px;">${l}</p>
      </div>`;
  },

  /* ---------- Reusable booking card ---------- */
  card(b) {
    const st = statusOf(b);
    const bal = outstanding(b);
    const paid = num(b.advance);
    const grand = grandTotal(b);
    const dd = diffDays(b.date);
    const overdue = dd < 0 && bal > 0 && !b.done;
    const whenPill = isToday(b.date) ? '<span class="pill today"><span class="dot"></span>Today</span>'
      : isTomorrow(b.date) ? '<span class="pill gold"><span class="dot"></span>Tomorrow</span>' : '';
    return `
      <div class="card" style="padding:16px;margin-bottom:12px;">
        <button style="width:100%;text-align:left;background:none;border:none;padding:0;" onclick="App.openForm('${b.id}')">
          <div class="flex items-start justify-between" style="gap:10px;">
            <div style="min-width:0;">
              <p class="serif" style="font-size:18px;font-weight:600;line-height:1.15;">${esc(b.name)}</p>
              <p style="font-size:12.5px;color:var(--ink-soft);margin-top:3px;">
                ${prettyDate(b.date)} · ${b.ready ? 'Ready by ' + fmt12(b.ready) : dayLong(b.date)}
              </p>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto;">
              <span class="pill ${st.cls}"><span class="dot"></span>${st.label}</span>
              ${whenPill}
            </div>
          </div>
          <div class="flex" style="gap:6px;flex-wrap:wrap;margin-top:11px;">
            <span class="tag">${esc(b.service)}</span>
            <span class="tag">${esc(b.event)}</span>
            <span class="tag">${TRAVEL_LABEL[b.travel] || 'In-Studio'}</span>
            ${b.accom ? '<span class="tag">Stay incl.</span>' : ''}
            ${b.muhurat ? `<span class="tag">Muhurat ${fmt12(b.muhurat)}</span>` : ''}
          </div>
          <div class="hairline flex items-center justify-between" style="margin-top:13px;padding-top:12px;">
            <div>
              <p style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);font-weight:600;">
                ${bal > 0 ? (overdue ? 'Overdue balance' : 'Balance due') : 'Fully paid'}
              </p>
              <p class="serif" style="font-size:19px;font-weight:700;color:${bal > 0 ? (overdue ? '#B23B4E' : 'var(--rose-deep)') : 'var(--sage)'};margin-top:1px;">
                ${bal > 0 ? money(bal) : money(grand)}
              </p>
            </div>
            <p style="font-size:12px;color:var(--ink-faint);text-align:right;">
              ${money(paid)} paid<br>of ${money(grand)}
            </p>
          </div>
        </button>
        <div class="flex" style="gap:8px;margin-top:13px;">
          <button class="btn btn-sm btn-sage" style="flex:1;" onclick="App.whatsapp('${b.id}')">WhatsApp</button>
          ${bal > 0
            ? `<button class="btn btn-sm btn-soft" style="flex:1;" onclick="App.openPay('${b.id}')">Collect</button>`
            : `<button class="btn btn-sm btn-ghost" style="flex:1;" onclick="App.toggleDone('${b.id}')">${b.done ? 'Reopen' : 'Mark done'}</button>`}
          <button class="btn btn-sm btn-ghost" style="flex:0 0 auto;" onclick="App.openForm('${b.id}')" aria-label="Edit">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
      </div>`;
  },

  /* ---------- BOOKINGS ---------- */
  renderBookings() {
    const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
    let list = this.bookings.slice();
    if (this.filter !== 'all') list = list.filter((b) => statusOf(b).key === this.filter);
    if (q) list = list.filter((b) =>
      (b.name + ' ' + b.service + ' ' + b.event + ' ' + (b.phone || '')).toLowerCase().includes(q));
    // newest / soonest first: future ascending, past descending — simple: by date desc then within, keep chronological upcoming on top
    list.sort((a, b) => {
      const da = diffDays(a.date), db = diffDays(b.date);
      const fa = da >= 0, fb = db >= 0;
      if (fa && fb) return (a.date + (a.ready || '')).localeCompare(b.date + (b.ready || ''));
      if (!fa && !fb) return (b.date).localeCompare(a.date);
      return fa ? -1 : 1;
    });
    document.getElementById('bookingCount').textContent =
      `${this.bookings.length} total`;
    const el = document.getElementById('bookingsList');
    if (!list.length) {
      el.innerHTML = `<div class="card empty">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="17" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>
        <p style="font-weight:600;color:var(--ink);">${this.bookings.length ? 'Nothing matches' : 'No bookings yet'}</p>
        <p style="font-size:13px;margin-top:3px;">${this.bookings.length ? 'Try another filter or search.' : 'Tap + to add your first client.'}</p>
      </div>`;
      return;
    }
    el.innerHTML = list.map((b) => this.card(b)).join('');
  },

  bindFilters() {
    document.querySelectorAll('#filterSeg button').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('#filterSeg button').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.filter;
        this.renderBookings();
      };
    });
  },

  /* ---------- REMINDERS ---------- */
  renderReminders() {
    const el = document.getElementById('remindersList');
    const tomorrow = this.bookings.filter((b) => isTomorrow(b.date));
    const today = this.bookings.filter((b) => isToday(b.date) && !b.done);
    const week = this.bookings.filter((b) => { const d = diffDays(b.date); return d > 1 && d <= 7; })
      .sort((a, b) => (a.date + (a.ready || '')).localeCompare(b.date + (b.ready || '')));
    const dues = this.bookings.filter((b) => outstanding(b) > 0 && !b.done)
      .sort((a, b) => diffDays(a.date) - diffDays(b.date));

    if (!tomorrow.length && !today.length && !week.length && !dues.length) {
      el.innerHTML = `<div class="card empty">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <p style="font-weight:600;color:var(--ink);">You're all caught up</p>
        <p style="font-size:13px;margin-top:3px;">No bookings need attention right now.</p>
      </div>`;
      return;
    }
    const section = (title, items, tint) => items.length ? `
      <div style="margin-bottom:22px;">
        <div class="flex items-center gap-2 mb-3">
          <span style="width:8px;height:8px;border-radius:999px;background:${tint};"></span>
          <p class="eyebrow">${title} · ${items.length}</p>
        </div>
        ${items.map((b) => this.card(b)).join('')}
      </div>` : '';

    el.innerHTML =
      section('Tomorrow', tomorrow, 'var(--gold)') +
      section('Today', today, '#C97E4E') +
      section('Balance to collect', dues, 'var(--rose)') +
      section('This week', week, 'var(--sage)');
  },

  /* ---------- BADGES / COUNTDOWNS ---------- */
  updateBadges() {
    const actionable = this.bookings.filter((b) =>
      isTomorrow(b.date) || (isToday(b.date) && !b.done) || (outstanding(b) > 0 && diffDays(b.date) < 0 && !b.done)).length;
    const wrap = document.getElementById('reminderBadgeWrap');
    wrap.innerHTML = actionable
      ? `Reminders<sup style="background:var(--rose);color:#fff;font-size:9px;font-weight:700;border-radius:999px;padding:1px 5px;margin-left:3px;position:relative;top:-6px;">${actionable}</sup>`
      : 'Reminders';
  },

  updateCountdowns() {
    document.querySelectorAll('[data-target]').forEach((el) => {
      const cd = el.querySelector('.countdown');
      if (cd) cd.textContent = countdownText(Number(el.dataset.target));
    });
  },

  /* ---------- FORM ---------- */
  openForm(id) {
    const f = document.getElementById('bookingForm');
    f.reset();
    document.querySelectorAll('.field.invalid').forEach((x) => x.classList.remove('invalid'));
    const editing = !!id;
    document.getElementById('formTitle').textContent = editing ? 'Edit booking' : 'New booking';
    document.getElementById('deleteBtn').style.display = editing ? 'block' : 'none';

    if (editing) {
      const b = this.bookings.find((x) => x.id === id);
      if (!b) return;
      set('f-id', b.id); set('f-name', b.name); set('f-phone', b.phone);
      set('f-service', b.service); set('f-event', b.event);
      set('f-date', b.date); set('f-ready', b.ready); set('f-muhurat', b.muhurat);
      set('f-total', b.total || ''); set('f-advance', b.advance || '');
      set('f-travel', b.travel || 'studio'); set('f-surcharge', b.surcharge || '');
      set('f-notes', b.notes);
      document.getElementById('f-accom').checked = !!b.accom;
      document.getElementById('f-done').checked = !!b.done;
    } else {
      set('f-id', '');
      set('f-date', dateKey(todayMid()));
    }
    this.onDateChange();
    this.onTravelChange();
    this.recalc();
    this.openOverlay('formOverlay');
    function set(id, v) { const e = document.getElementById(id); if (e) e.value = v == null ? '' : v; }
  },

  closeForm() { this.closeOverlay('formOverlay'); },

  onDateChange() {
    const v = document.getElementById('f-date').value;
    document.getElementById('f-day').textContent = v ? '· ' + dayLong(v) : '';
  },
  onTravelChange() {
    const t = document.getElementById('f-travel').value;
    document.getElementById('wrap-surcharge').style.display = t === 'outstation' ? 'block' : 'none';
    this.recalc();
  },
  recalc() {
    const total = num(document.getElementById('f-total').value);
    const adv = num(document.getElementById('f-advance').value);
    const travel = document.getElementById('f-travel').value;
    const sur = travel === 'outstation' ? num(document.getElementById('f-surcharge').value) : 0;
    const grand = total + sur;
    const bal = Math.max(0, grand - adv);
    document.getElementById('calc-grand').textContent = money(grand);
    document.getElementById('calc-adv').textContent = money(adv);
    document.getElementById('calc-balance').textContent = money(bal);
  },

  validate() {
    let ok = true;
    const mark = (wrap, bad) => { const w = document.getElementById(wrap); w.classList.toggle('invalid', bad); if (bad) ok = false; };
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.replace(/\D/g, '');
    const date = document.getElementById('f-date').value;
    mark('wrap-name', !name);
    mark('wrap-phone', phone.length < 10);
    mark('wrap-date', !date);
    return ok;
  },

  async saveBooking() {
    if (!this.validate()) { this.toast('Please fix the highlighted fields'); return; }
    const id = document.getElementById('f-id').value || ('bk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const existing = this.bookings.find((x) => x.id === id);
    const b = {
      id,
      name: document.getElementById('f-name').value.trim(),
      phone: document.getElementById('f-phone').value.replace(/\D/g, ''),
      service: document.getElementById('f-service').value,
      event: document.getElementById('f-event').value,
      date: document.getElementById('f-date').value,
      ready: document.getElementById('f-ready').value,
      muhurat: document.getElementById('f-muhurat').value,
      total: num(document.getElementById('f-total').value),
      advance: num(document.getElementById('f-advance').value),
      travel: document.getElementById('f-travel').value,
      surcharge: num(document.getElementById('f-surcharge').value),
      accom: document.getElementById('f-accom').checked,
      done: document.getElementById('f-done').checked,
      notes: document.getElementById('f-notes').value.trim(),
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    await Store.put(b);
    this.closeForm();
    await this.refresh();
    this.toast(existing ? 'Booking updated' : 'Booking added ✨');
  },

  deleteFromForm() {
    const id = document.getElementById('f-id').value;
    if (id) this.deleteBooking(id, true);
  },
  async deleteBooking(id, fromForm) {
    if (!confirm('Delete this booking? This cannot be undone.')) return;
    await Store.remove(id);
    if (fromForm) this.closeForm();
    await this.refresh();
    this.toast('Booking deleted');
  },
  async toggleDone(id) {
    const b = this.bookings.find((x) => x.id === id);
    if (!b) return;
    b.done = !b.done; b.updatedAt = Date.now();
    await Store.put(b);
    await this.refresh();
    this.toast(b.done ? 'Marked as done' : 'Reopened');
  },

  /* ---------- WhatsApp ---------- */
  whatsapp(id) {
    const b = this.bookings.find((x) => x.id === id);
    if (!b) return;
    if (!b.phone || b.phone.replace(/\D/g, '').length < 10) { this.toast('No valid number on this booking'); return; }
    const studio = Settings.data.name || 'your artist';
    const bal = outstanding(b);
    const lines = [
      `Namaste ${b.name.split(' ')[0]}! 🌸`,
      '',
      `Your ${b.service} booking is confirmed:`,
      `📅 ${prettyDate(b.date)} (${dayLong(b.date)})`,
      b.ready ? `⏰ Ready by ${fmt12(b.ready)}` : '',
      b.muhurat ? `🕉️ Muhurat at ${fmt12(b.muhurat)}` : '',
      '',
      `Package: ${money(grandTotal(b))}`,
      `Advance received: ${money(b.advance)}`,
      bal > 0 ? `Balance: ${money(bal)}` : 'Fully paid — thank you!',
      bal > 0 && Settings.data.upi ? `You can pay to UPI: ${Settings.data.upi}` : '',
      '',
      `— ${studio}`
    ].filter((l) => l !== '');
    const url = `https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
  },

  /* ---------- Payment sheet (UPI + QR) ---------- */
  openPay(id) {
    const b = this.bookings.find((x) => x.id === id);
    if (!b) return;
    this.payBooking = b;
    this.payAmount = outstanding(b) || grandTotal(b);
    this.renderPay();
    this.openOverlay('payOverlay');
  },
  closePay() { this.closeOverlay('payOverlay'); this.payBooking = null; },

  setPayAmount(kind, btn) {
    const b = this.payBooking;
    document.querySelectorAll('#paySeg button').forEach((x) => x.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (kind === 'balance') this.payAmount = outstanding(b);
    else if (kind === 'full') this.payAmount = grandTotal(b);
    else if (kind === 'custom') {
      const v = num(document.getElementById('payCustom').value);
      this.payAmount = v;
    }
    document.getElementById('payCustomWrap').style.display = kind === 'custom' ? 'block' : 'none';
    this.renderQR();
    const amtEl = document.getElementById('payAmountLabel');
    if (amtEl) amtEl.textContent = money(this.payAmount);
  },

  renderPay() {
    const b = this.payBooking;
    const upi = Settings.data.upi;
    const body = document.getElementById('payBody');
    if (!upi) {
      body.innerHTML = `<div class="card empty" style="margin-bottom:16px;">
          <p style="font-weight:600;color:var(--ink);">Add your UPI ID first</p>
          <p style="font-size:13px;margin-top:4px;">Save your UPI ID in Settings to generate collection links and QR codes.</p>
        </div>
        <button class="btn btn-primary btn-block" onclick="App.closePay();App.go('settings')">Go to Settings</button>`;
      return;
    }
    const bal = outstanding(b);
    body.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <div>
          <p class="serif" style="font-size:17px;font-weight:600;">${esc(b.name)}</p>
          <p style="font-size:12.5px;color:var(--ink-soft);">${esc(b.service)} · ${prettyDate(b.date)}</p>
        </div>
        <p class="serif" id="payAmountLabel" style="font-size:22px;font-weight:700;color:var(--rose-deep);">${money(this.payAmount)}</p>
      </div>

      <div class="seg mt-3" id="paySeg">
        <button class="${bal > 0 ? 'active' : ''}" onclick="App.setPayAmount('balance',this)">Balance ${bal > 0 ? money(bal) : ''}</button>
        <button class="${bal > 0 ? '' : 'active'}" onclick="App.setPayAmount('full',this)">Full package</button>
        <button onclick="App.setPayAmount('custom',this)">Custom</button>
      </div>
      <div class="field mt-3" id="payCustomWrap" style="display:none;">
        <div class="input-money"><span class="rupee">₹</span>
          <input class="input" id="payCustom" type="number" inputmode="numeric" min="1" placeholder="Enter amount" oninput="App.setPayAmount('custom')" />
        </div>
      </div>

      <div class="card" style="padding:20px;margin-top:16px;text-align:center;">
        <div id="qrbox" style="min-height:180px;"></div>
        <p style="font-size:12.5px;color:var(--ink-soft);margin-top:12px;">Scan with any UPI app</p>
        <p style="font-weight:600;font-size:14px;margin-top:2px;">${esc(upi)}</p>
      </div>

      <button class="btn btn-rose btn-block mt-4" onclick="App.openUpiApp()">Open UPI app to collect</button>
      <button class="btn btn-sage btn-block mt-3" onclick="App.requestOnWhatsApp()">Send request on WhatsApp</button>
      <p style="font-size:11.5px;color:var(--ink-faint);text-align:center;margin-top:12px;line-height:1.5;">
        "Open UPI app" works on your phone. The QR and WhatsApp request can be shown or sent to the client on any device.
      </p>`;
    this.renderQR();
  },

  upiString() {
    const b = this.payBooking;
    return upiLink({
      pa: Settings.data.upi,
      pn: Settings.data.name || 'Aditi Makeup Artistry',
      am: Math.round(this.payAmount || 0),
      tn: `${b.service} · ${b.name}`.slice(0, 40)
    });
  },

  renderQR() {
    const box = document.getElementById('qrbox');
    if (!box) return;
    box.innerHTML = '';
    const str = this.upiString();
    if (typeof QRCode === 'undefined') {
      box.innerHTML = `<div style="padding:14px;">
        <p style="font-size:12px;color:var(--ink-soft);">QR needs a one-time online load. Meanwhile, use the buttons below or share this link:</p>
        <p style="font-size:11px;word-break:break-all;margin-top:8px;color:var(--ink);background:var(--powder);padding:10px;border-radius:10px;">${esc(str)}</p>
      </div>`;
      return;
    }
    try {
      new QRCode(box, { text: str, width: 176, height: 176, colorDark: '#2E2530', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
    } catch (_) {
      box.textContent = 'Could not render QR.';
    }
  },

  openUpiApp() {
    if (!this.payAmount || this.payAmount <= 0) { this.toast('Enter an amount first'); return; }
    window.location.href = this.upiString();
  },

  requestOnWhatsApp() {
    const b = this.payBooking;
    if (!b.phone || b.phone.replace(/\D/g, '').length < 10) { this.toast('No valid number on this booking'); return; }
    if (!this.payAmount || this.payAmount <= 0) { this.toast('Enter an amount first'); return; }
    const studio = Settings.data.name || 'your artist';
    const lines = [
      `Namaste ${b.name.split(' ')[0]}! 🌸`,
      `Requesting ${money(this.payAmount)} for your ${b.service} booking on ${prettyDate(b.date)}.`,
      '',
      `Pay to UPI: ${Settings.data.upi}`,
      'You can also tap this link on your phone:',
      this.upiString(),
      '',
      `Thank you! — ${studio}`
    ];
    window.open(`https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  },

  /* ---------- Settings ---------- */
  reflectSettings() {
    document.getElementById('setName').value = Settings.data.name || '';
    document.getElementById('setPhone').value = Settings.data.phone || '';
    document.getElementById('setUpi').value = Settings.data.upi || '';
  },
  bindSettings() {
    const save = () => {
      Settings.data.name = document.getElementById('setName').value.trim();
      Settings.data.phone = document.getElementById('setPhone').value.replace(/\D/g, '');
      Settings.data.upi = document.getElementById('setUpi').value.trim();
      Settings.save();
      this.applyGreeting();
    };
    ['setName', 'setPhone', 'setUpi'].forEach((id) => {
      document.getElementById(id).addEventListener('change', save);
      document.getElementById(id).addEventListener('blur', save);
    });
  },

  /* ---------- Notifications ---------- */
  updateNotifUI() {
    const btn = document.getElementById('notifBtn');
    const status = document.getElementById('notifStatus');
    if (!('Notification' in window)) {
      btn.textContent = 'Unavailable'; btn.disabled = true; btn.style.opacity = '0.5';
      status.textContent = 'This browser does not support notifications';
      return;
    }
    const p = Notification.permission;
    if (p === 'granted') { btn.textContent = 'On'; btn.classList.remove('btn-soft'); btn.classList.add('btn-sage'); status.textContent = "You'll be reminded of tomorrow's bookings"; }
    else if (p === 'denied') { btn.textContent = 'Blocked'; status.textContent = 'Turn on notifications for Aditi Makeup Artistry in device settings'; }
    else { btn.textContent = 'Enable'; status.textContent = "Get a heads-up for tomorrow's bookings"; }
  },
  requestNotif() {
    if (!('Notification' in window)) { this.toast('Notifications not supported here'); return; }
    Notification.requestPermission().then((p) => {
      this.updateNotifUI();
      if (p === 'granted') { this.toast('Notifications on'); this.checkDailyReminder(true); }
      else if (p === 'denied') this.toast('Enable it in device settings');
    });
  },
  // Fire a same-day notification for tomorrow's bookings (once per day) when app opens.
  checkDailyReminder(force) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const key = 'aditi-ma-notif-' + dateKey(todayMid());
    if (!force && localStorage.getItem(key)) return;
    const tomorrow = this.bookings.filter((b) => isTomorrow(b.date));
    if (!tomorrow.length) return;
    localStorage.setItem(key, '1');
    const names = tomorrow.map((b) => b.name.split(' ')[0]).join(', ');
    try {
      new Notification(`Tomorrow: ${tomorrow.length} booking${tomorrow.length > 1 ? 's' : ''}`, {
        body: names, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'aditi-ma-tomorrow'
      });
    } catch (_) {}
  },

  /* ---------- Backup ---------- */
  exportData() {
    const payload = { app: 'aditi-ma', version: 1, exportedAt: new Date().toISOString(), settings: Settings.data, bookings: this.bookings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aditi-ma-backup-${dateKey(todayMid())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toast('Backup downloaded');
  },
  importData(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.bookings)) throw new Error('bad');
        if (!confirm(`Import ${data.bookings.length} booking(s)? This adds to what you have.`)) return;
        for (const b of data.bookings) { if (b && b.id) await Store.put(b); }
        if (data.settings) { Object.assign(Settings.data, data.settings); Settings.save(); this.reflectSettings(); }
        await this.refresh();
        this.toast('Backup imported');
      } catch (_) { this.toast('That file could not be read'); }
      ev.target.value = '';
    };
    reader.readAsText(file);
  },
  async clearAll() {
    if (!confirm('Erase ALL bookings from this device? Export a backup first if unsure.')) return;
    await Store.clear();
    await this.refresh();
    this.toast('All bookings erased');
  },

  /* ---------- Overlay / toast helpers ---------- */
  openOverlay(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow = 'hidden'; },
  closeOverlay(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; },
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2200);
  }
};

// Close overlays when tapping the dimmed backdrop
['formOverlay', 'payOverlay'].forEach((id) => {
  document.getElementById(id).addEventListener('click', (e) => {
    if (e.target.id === id) App.closeOverlay(id);
  });
});

/* -------------------- Boot + Service Worker -------------------- */
window.addEventListener('DOMContentLoaded', () => App.init());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {/* offline-first still works from cache */});
  });
}
