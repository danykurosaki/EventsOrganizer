// OBOG会 · cliente (vanilla JS, sin dependencias)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

// ---------- iconos (trazo, heredan color) ----------
const PATHS = {
  yes: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  maybe: '<path d="M9.3 9.2a2.8 2.8 0 1 1 4 2.5c-.9.5-1.3 1.1-1.3 2"/><circle cx="12" cy="17.4" r=".7" fill="currentColor"/>',
  no: '<path d="M7 7l10 10M17 7L7 17"/>',
  pending: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.2l2.6 1.6"/>',
  pin: '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  note: '<path d="M5 5h14v10H9l-4 4V5z"/>',
  logout: '<path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  child: '<circle cx="12" cy="8" r="3.2"/><path d="M6 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>',
  copyplus: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 15V6a2 2 0 0 1 2-2h9M14 11.5v5M11.5 14h5"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5V18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c0-3 2.7-5 6-5s6 2 6 5M16 5.6a3 3 0 0 1 0 5.8M18 14.8c2 .6 3.3 2.2 3.3 4.7"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  ticket: '<path d="M4 8a2 2 0 0 0 0 8v1.5A1.5 1.5 0 0 0 5.5 19h13a1.5 1.5 0 0 0 1.5-1.5V16a2 2 0 0 1 0-8V6.5A1.5 1.5 0 0 0 18.5 5h-13A1.5 1.5 0 0 0 4 6.5V8zM14 5v14" stroke-dasharray="2 2.4"/>',
};
const ic = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${PATHS[n]}</svg>`;
const TABICO = { me: 'user', team: 'users', summary: 'chart', events: 'cal', data: 'db' };
const EMO = { yes: ic('yes'), maybe: ic('maybe'), no: ic('no'), pending: ic('pending') };

// ---------- i18n ----------
let dict = {};
let lang = 'es';
async function loadLang(l) {
  dict = await (await fetch(`/i18n/${l}.json`)).json();
  lang = l;
  store.set('lang', l);
  document.documentElement.lang = l;
}
const t = (k, v = {}) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
const locale = () => (lang === 'ja' ? 'ja-JP' : 'es-ES');

document.documentElement.dataset.theme = 'dark'; // solo tema oscuro

// ---------- estado ----------
const state = { me: null, eventId: null, tab: null, team: null, filter: 'all', q: '', cohort: '', editing: null };
const app = $('#app');
let cdTimer = null;
let saveTimer = null;

const curEvent = () => state.me?.events.find((e) => e.id === state.eventId) || null;
const curResp = () => state.me.responses[state.eventId];

async function api(method, url, body) {
  const r = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'obog' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/auth/')) { state.me = null; renderLogin(); }
    throw Object.assign(new Error(data.error || 'error'), { status: r.status, code: data.error });
  }
  return data;
}

function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 2600);
}

const fmtDate = (naive) => (naive ? new Date(naive + ':00Z').toLocaleString(locale(), { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' }) : '');
const shortDate = (naive) => (naive ? new Date(naive + ':00Z').toLocaleDateString(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : t('no_date'));
const yen = (n) => (Number(n) < 0 ? '-¥' : '¥') + Math.abs(Number(n) || 0).toLocaleString(locale());

function animateNum(el, to, ms = 700) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function fx(kind, from) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (kind === 'yes') return confetti();
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  cv.width = innerWidth;
  cv.height = innerHeight;
  const cx = from ? from.left + from.width / 2 : innerWidth / 2;
  const cy = from ? from.top + from.height / 2 : innerHeight / 2;
  let ps; let frames = 0; let max;
  if (kind === 'maybe') {
    // signos de interrogación que suben balanceándose
    max = 150;
    ps = Array.from({ length: 22 }, (_, i) => ({
      x: cx + (Math.random() - 0.5) * from.width * 0.9, y: cy + (Math.random() - 0.5) * 20, vy: -(1.2 + Math.random() * 2.2),
      ph: Math.random() * 6, amp: 0.8 + Math.random() * 1.6, s: 16 + Math.random() * 26, d: i * 3, c: Math.random() < 0.5 ? '#ffc04d' : '#ffdb8f',
    }));
  } else {
    // lluvia lenta de pétalos / lágrimas que cae y se apaga
    max = 170;
    ps = Array.from({ length: 46 }, () => ({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vy: 2 + Math.random() * 3.2, vx: (Math.random() - 0.5) * 0.8,
      s: 6 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.1, c: Math.random() < 0.6 ? '#ff7b97' : '#a9aed6',
    }));
  }
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (kind === 'no') { ctx.fillStyle = `rgba(255,123,151,${Math.max(0, 0.16 - frames / 900)})`; ctx.fillRect(0, 0, cv.width, cv.height); }
    for (const p of ps) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (frames - (p.d || 0)) / 12, 1 - frames / max));
      if (kind === 'maybe') {
        p.y += p.vy; p.x += Math.sin(frames / 14 + p.ph) * p.amp;
        ctx.translate(p.x, p.y); ctx.rotate(Math.sin(frames / 18 + p.ph) * 0.4);
        ctx.fillStyle = p.c; ctx.font = `800 ${p.s}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', 0, 0);
      } else {
        p.y += p.vy; p.x += p.vx + Math.sin(frames / 20 + p.r) * 0.6; p.r += p.vr;
        ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.45, p.s, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (++frames < max) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  cv.width = innerWidth;
  cv.height = innerHeight;
  const colors = ['#6d4aff', '#ff5c93', '#ffb347', '#3ddc97', '#4cc9f0', '#ffffff'];
  const ps = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 100, y: innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 18 - 6, s: 6 + Math.random() * 7,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: colors[(Math.random() * colors.length) | 0],
  }));
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - frames / 150);
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (++frames < 150) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

// ---------- login ----------
const logo = (cls = '') => `<span class="logo ${cls}">会</span>`;

function renderLogin(step = 'email', email = '', hint = '', prefill = '') {
  clearInterval(cdTimer);
  document.body.classList.remove('has-nav');
  app.innerHTML = `
  <div class="wrap">
    <div class="top"><div class="brand">${logo()}<span>OBOG会</span></div>${controls()}</div>
    <div class="card login">
      <div class="lh">${logo()}<h1>${esc(t('login_title'))}</h1>
      <p>${esc(t(step === 'email' ? 'login_sub' : 'code_sent', { email }))}</p></div>
      <div class="lb">
      ${hint ? `<div class="notice" style="text-align:left;margin:0 0 6px">${ic('note')}<span>${esc(hint)}</span></div>` : ''}
      <form id="lf" novalidate>
        ${step === 'email'
          ? `<label class="field"><span>${esc(t('email'))}</span><input type="email" name="email" autocomplete="email" inputmode="email" required autofocus></label>`
          : `<label class="field"><span>${esc(t('code'))}</span><input class="code-input" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" value="${esc(prefill)}" required autofocus></label>`}
        <div class="err" id="lerr"></div>
        <button class="btn block" type="submit">${esc(t(step === 'email' ? 'send_code' : 'enter'))}</button>
        ${step === 'code' ? `<button type="button" class="link-btn" id="back">${esc(t('back'))}</button>` : ''}
      </form>
      </div>
    </div>
  </div>`;
  bindControls();
  const form = $('#lf');
  const errEl = $('#lerr');
  const submit = async (e) => {
    e?.preventDefault();
    errEl.textContent = '';
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      if (step === 'email') {
        const em = form.email.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw Object.assign(new Error('x'), { code: 'invalid_email' });
        const r = await api('POST', '/auth/request', { email: em });
        if (r.unknown) { errEl.textContent = t('dev_unknown'); btn.disabled = false; return; }
        renderLogin('code', em, r.wait ? t('code_wait') : r.code ? t('dev_code_hint', { code: r.code }) : r.dev ? t('dev_hint') : '', r.code || '');
      } else {
        await api('POST', '/auth/verify', { email, code: form.code.value });
        await boot();
      }
    } catch (err) {
      errEl.textContent = t('err_' + (err.code || 'generic'));
      btn.disabled = false;
    }
  };
  form.addEventListener('submit', submit);
  if (step === 'code') {
    form.code.addEventListener('input', () => { form.code.value = form.code.value.replace(/\D/g, ''); if (form.code.value.length === 6) submit(); });
    $('#back').onclick = () => renderLogin();
  }
}

function controls() {
  return `<div class="chips">
    <button class="icon-btn" data-act="lang" title="Language">${lang === 'ja' ? 'ES' : '日本語'}</button>
  </div>`;
}
function bindControls() {
  $$('[data-act=lang]').forEach((b) => (b.onclick = async () => { await loadLang(lang === 'ja' ? 'es' : 'ja'); state.me ? render() : renderLogin(); }));
}

// ---------- tarjeta del evento ----------
function eventCard(ev, compact = false) {
  const priceRows = [
    [t('fee_tachin'), ev.fees.tachin],
    [t('fee_nijikai'), ev.fees.nijikai],
    ev.fees.companion !== ev.fees.tachin ? [t('fee_companion'), ev.fees.companion] : null,
  ].filter((r) => r && r[1]);
  const priceRow = ([l, v]) => {
    const m = String(l).match(/^(.*?)\s*[(（](.*)[)）]$/);
    return `<div class="price"><span class="pn">${esc(m ? m[1] : l)}${m ? `<em>${esc(m[2])}</em>` : ''}</span><b>${yen(v)}</b></div>`;
  };
  const facts = [
    ev.date && [t('ev_date'), esc(fmtDate(ev.date)), 'cal'],
    (ev.venue || ev.address) && [t('ev_place'), `${esc(ev.venue)}${ev.address ? `<br><span class="small">${esc(ev.address)}</span>` : ''}${ev.map_url ? `<br><a href="${esc(ev.map_url)}" target="_blank" rel="noopener noreferrer">${ic('pin')} ${esc(t('ev_map'))}</a>` : ''}`, 'pin'],
    priceRows.length && [t('ev_price'), `<div class="prices">${priceRows.map(priceRow).join('')}</div>`, 'ticket'],
    ev.deadline && [t('ev_deadline'), esc(fmtDate(ev.deadline)), 'pending'],
  ].filter(Boolean);
  if (compact) return `<section class="card event compact"><i class="petal"></i><i class="petal"></i><i class="petal"></i>
    <div class="kicker">${esc(shortDate(ev.date))}${ev.venue ? ' · ' + esc(ev.venue) : ''}</div><h1>${esc(ev.title)}</h1>
    ${ev.date ? `<div class="countdown" id="cd"></div>` : ''}</section>`;
  return `<section class="card event">
    <i class="petal"></i><i class="petal"></i><i class="petal"></i><i class="petal"></i><i class="petal"></i>
    ${ev.date ? `<div class="kicker">${esc(shortDate(ev.date))}</div>` : ''}
    <h1>${esc(ev.title)}</h1>
    ${ev.teacher ? `<p class="sub">${esc(t('ev_with', { name: ev.teacher }))}</p>` : ''}
    ${ev.date ? `<div class="countdown" id="cd"></div>` : ''}
    ${facts.length ? `<div class="facts">${facts.map(([k, v, i]) => `<div class="fact"><span class="fi">${ic(i)}</span><b>${esc(k)}</b><div class="fv">${v}</div></div>`).join('')}</div>` : `<p class="sub">${esc(t('ev_tbd'))}</p>`}
    ${ev.info ? `<div class="info">${esc(ev.info)}</div>` : ''}
  </section>`;
}
function startCountdown(ev) {
  clearInterval(cdTimer);
  const el = $('#cd');
  if (!el || !ev.date) return;
  const target = new Date(`${ev.date}:00${ev.tz || '+09:00'}`).getTime();
  const tick = () => {
    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    if (target - Date.now() <= 0) { el.innerHTML = `<div style="flex:1"><strong>—</strong><span>${esc(t('cd_done'))}</span></div>`; clearInterval(cdTimer); return; }
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    el.innerHTML = [[d, 'cd_d'], [h, 'cd_h'], [m, 'cd_m'], [s, 'cd_s']].map(([n, k]) => `<div><strong>${n}</strong><span>${esc(t(k))}</span></div>`).join('');
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

// ---------- layout ----------
function tabsFor(role) {
  if (role === 'admin') return [['me', 'tab_me'], ['team', 'tab_all'], ['summary', 'tab_summary'], ['events', 'tab_event'], ['data', 'tab_data']];
  if (role === 'manager') return [['me', 'tab_me'], ['team', 'tab_team']];
  return [];
}

function pickEvent() {
  const evs = state.me.events;
  const saved = Number(store.get('event'));
  if (evs.some((e) => e.id === state.eventId)) return state.eventId;
  if (evs.some((e) => e.id === saved)) return saved;
  const live = evs.filter((e) => !e.archived);
  const today = new Date(Date.now() - 864e5).toISOString().slice(0, 16);
  return (live.find((e) => e.date && e.date >= today) || live[live.length - 1] || evs[0])?.id ?? null;
}

function switcher() {
  const evs = state.me.events;
  if (evs.length < 2 || state.tab === 'events') return '';
  return `<div class="evswitch" role="tablist">${evs.map((e) => `<button class="ev ${e.id === state.eventId ? 'on' : ''} ${e.archived ? 'arch' : ''}" data-ev="${e.id}" role="tab" aria-selected="${e.id === state.eventId}">
    <b>${esc(e.title)}</b><span>${esc(shortDate(e.date))}${e.archived ? ' · ' + esc(t('archived')) : ''}</span></button>`).join('')}</div>`;
}

function render() {
  const { me } = state;
  if (!me) return renderLogin();
  state.eventId = pickEvent();
  const tabs = tabsFor(me.person.role);
  if (!state.tab || !tabs.some(([k]) => k === state.tab)) state.tab = me.person.role === 'admin' ? 'summary' : me.person.role === 'manager' ? 'team' : 'me';
  const ev = curEvent();
  const showEvent = ev && (state.tab === 'me' || state.tab === 'team');
  app.innerHTML = `<div class="wrap">
    <div class="top">
      <div class="brand">${logo()}<span>OBOG会</span></div>
      <div class="chips">${controls()}<button class="icon-btn" id="logout" title="${esc(t('logout'))}">${ic('logout')}<span class="nm-btn">${esc(me.person.name)}</span></button></div>
    </div>
    ${tabs.length ? `<nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${ic(TABICO[k])}<span class="t">${esc(t(l))}</span></button>`).join('')}</nav>` : ''}
    ${switcher()}
    ${showEvent ? eventCard(ev, state.tab === 'team') : ''}
    <div id="view"></div>
  </div>`;
  document.body.classList.toggle('has-nav', tabs.length > 0);
  bindControls();
  $('#logout').onclick = async () => { await api('POST', '/auth/logout', {}); state.me = null; state.team = null; renderLogin(); };
  $$('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; state.editing = null; render(); }));
  $$('[data-ev]').forEach((b) => (b.onclick = () => { state.eventId = Number(b.dataset.ev); store.set('event', state.eventId); state.team = null; render(); }));
  if (showEvent) startCountdown(ev); else clearInterval(cdTimer);
  const views = { me: viewMine, team: viewTeam, summary: viewSummary, events: viewEvents, data: viewData };
  views[state.tab]();
}

async function refreshMe(keepEvent = true) {
  const prev = state.eventId;
  state.me = await api('GET', '/me');
  if (keepEvent) state.eventId = prev;
}

const noEvents = () => `<section class="card"><p class="muted" style="margin:0">${esc(t(state.me.person.role === 'admin' ? 'no_events_admin' : 'no_events'))}</p></section>`;

// ---------- mi respuesta ----------
function viewMine() {
  if (!curEvent()) { $('#view').innerHTML = noEvents(); return; }
  $('#view').innerHTML = `<section class="card ask" id="ask"></section>`;
  renderAsk();
}

function stepper(id, label, hint, val) {
  return `<div class="stepper" data-step="${id}"><div><b>${esc(label)}</b>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}</div>
    <div class="ctl"><button type="button" data-d="-1" aria-label="-">−</button><output>${val}</output><button type="button" data-d="1" aria-label="+">+</button></div></div>`;
}

function renderAsk() {
  const { me } = state;
  const ev = curEvent();
  const r = curResp();
  const closed = ev.closed;
  const el = $('#ask');
  if (!el) return;
  el.innerHTML = `
    <h2>${esc(t('ask_title', { name: me.person.name }))}</h2>
    ${me.person.manager_name ? `<p class="muted small">${esc(t('your_manager', { name: me.person.manager_name }))}</p>` : ''}
    <div class="choices">
      ${['yes', 'maybe', 'no'].map((a) => `<button class="choice ${r.answer === a ? 'on' : ''}" data-a="${a}" ${closed ? 'disabled' : ''} aria-pressed="${r.answer === a}">
        <span class="emo">${EMO[a]}</span><b class="lbl">${esc(t(a))}</b><small>${esc(t(a + '_sub'))}</small></button>`).join('')}
    </div>
    <div class="status-line" id="status">${r.answer && r.updated_at ? `<span class="muted small">${esc(t('last_update', { d: new Date(r.updated_at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) }))}</span>` : ''}</div>
    ${closed ? `<div class="notice">${ic('lock')}<span>${esc(t(ev.archived ? 'archived_notice' : 'closed_notice'))}</span></div>` : ''}
    ${r.by_manager && r.answer ? `<div class="notice">${ic('edit')}<span>${esc(t('changed_by_manager'))}</span></div>` : ''}
    ${r.answer ? `<div class="extras">
      ${r.answer === 'yes' ? `
        ${ev.fees.nijikai ? `<label class="toggle"><span><b>${esc(t('nijikai_label'))}</b><div class="small muted">${esc(t('nijikai_hint', { fee: yen(ev.fees.nijikai) }))}</div></span>
          <input type="checkbox" id="nijikai" ${r.nijikai ? 'checked' : ''} ${closed ? 'disabled' : ''}><span class="sw"></span></label>` : ''}
        ${stepper('companions', t('companions'), t('companions_hint'), r.companions)}
        ${stepper('kids', t('kids'), t('kids_hint'), r.kids)}` : ''}
      <label class="field" style="margin:0"><span>${esc(t('note'))}</span><textarea id="note" maxlength="300" style="min-height:80px" placeholder="${esc(t('note_ph'))}" ${closed ? 'disabled' : ''}>${esc(r.note)}</textarea></label>
    </div>` : ''}`;

  $$('.choice', el).forEach((b) => (b.onclick = () => {
    const a = b.dataset.a;
    const was = r.answer;
    const rect = b.getBoundingClientRect();
    r.answer = a;
    if (a !== 'yes') { r.nijikai = 0; r.companions = 0; r.kids = 0; }
    r.by_manager = 0;
    navigator.vibrate?.(a === 'yes' ? [18, 40, 18] : a === 'no' ? [40, 30, 40] : [12, 60, 12]);
    renderAsk();
    save(true);
    if (a !== was) fx(a, rect);
  }));
  const nj = $('#nijikai', el);
  if (nj) nj.onchange = () => { r.nijikai = nj.checked ? 1 : 0; save(); };
  $$('[data-step]', el).forEach((s) => $$('button', s).forEach((b) => (b.onclick = () => {
    if (closed) return;
    const key = s.dataset.step;
    r[key] = Math.max(0, Math.min(10, r[key] + Number(b.dataset.d)));
    $('output', s).textContent = r[key];
    save();
  })));
  const note = $('#note', el);
  if (note) note.oninput = () => { r.note = note.value; save(); };
}

function save(immediate = false) {
  const evId = state.eventId;
  const r = curResp();
  const st = $('#status');
  if (st) st.innerHTML = `<span class="muted small">${esc(t('saving'))}</span>`;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const saved = await api('PUT', `/events/${evId}/me/response`, { answer: r.answer, nijikai: r.nijikai, companions: r.companions, kids: r.kids, note: r.note });
      Object.assign(r, saved);
      const s2 = $('#status');
      if (s2 && state.eventId === evId) s2.innerHTML = `<span class="saved">${ic('yes')} ${esc(t('saved'))}</span>`;
    } catch (e) {
      if (e.code === 'closed') { curEvent().closed = true; renderAsk(); }
      toast(t('err_' + (e.code || 'generic')), true);
    }
  }, immediate ? 0 : 500);
}

// ---------- equipo ----------
async function loadTeam() {
  const d = await api('GET', `/events/${state.eventId}/team`);
  state.team = d.people;
}

async function viewTeam() {
  if (!curEvent()) { $('#view').innerHTML = noEvents(); return; }
  $('#view').innerHTML = `<section class="card" id="teamcard"><p class="muted">…</p></section>`;
  const evId = state.eventId;
  await loadTeam();
  if (evId !== state.eventId || state.tab !== 'team') return;
  const isAdmin = state.me.person.role === 'admin';
  const cohorts = [...new Set(state.team.map((p) => p.cohort).filter(Boolean))];
  if (state.cohort && !cohorts.includes(state.cohort)) state.cohort = '';
  $('#teamcard').innerHTML = `
    <div id="tstats"></div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="${esc(t('search'))}" value="${esc(state.q)}" aria-label="${esc(t('search'))}">
      ${cohorts.length > 1 ? `<select id="cohort" aria-label="${esc(t('cohort'))}"><option value="">${esc(t('all_cohorts'))}</option>${cohorts.map((c) => `<option ${state.cohort === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
    </div>
    <div>
      <div class="filters" id="filters"></div>
      <div class="team-actions">
        <button class="btn ghost sm" id="remind">${ic('copy')} ${esc(t('copy_reminder'))}</button>
        <a class="btn ghost sm" href="/api/events/${evId}/team/export.xlsx" download>${ic('download')} ${esc(t('export_xlsx'))}</a>
        ${isAdmin ? `<button class="btn sm" id="add">${ic('plus')} ${esc(t('add_person'))}</button>` : ''}
      </div>
    </div>
    <div class="people" id="plist" style="margin-top:12px"></div>`;
  $('#q').oninput = (e) => { state.q = e.target.value; renderTeamList(); };
  const cs = $('#cohort');
  if (cs) cs.onchange = () => { state.cohort = cs.value; renderTeamList(); renderTeamStats(); };
  $('#remind').onclick = copyReminder;
  const add = $('#add');
  if (add) add.onclick = () => personDialog(null);
  renderTeamStats();
  renderTeamList();
}

const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (n) => { const w = String(n).trim().split(/\s+/); return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '?'; };
const visible = () => state.team.filter((p) => !state.cohort || p.cohort === state.cohort);
function scopeStats() {
  const s = { total: 0, yes: 0, maybe: 0, no: 0, pending: 0 };
  for (const p of visible()) { s.total++; s[p.answer || 'pending']++; }
  return s;
}

function overview() {
  return `<div class="overview"><div class="donut"><div><b data-k="total">0</b><span>${esc(t('total'))}</span></div></div>
    <div class="legend">${['yes', 'maybe', 'no', 'pending'].map((k) => `<div class="lg ${k}"><i></i><span>${esc(t(k))}</span><b data-k="${k}">0</b></div>`).join('')}</div></div>`;
}

function renderTeamStats() {
  const s = scopeStats();
  const box = $('#tstats');
  if (!box) return;
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  if (!$('#tstats .overview')) box.innerHTML = overview();
  const dn = $('.donut', box);
  dn.style.setProperty('--y', pct(s.yes) + '%'); dn.style.setProperty('--m', pct(s.maybe) + '%'); dn.style.setProperty('--n', pct(s.no) + '%');
  $$('[data-k]', box).forEach((b) => animateNum(b, s[b.dataset.k]));
}

function renderTeamList() {
  const q = state.q.trim().toLowerCase();
  const rows = visible().filter((p) => (state.filter === 'all' || (state.filter === 'pending' ? !p.answer : p.answer === state.filter)) && (!q || `${p.name} ${p.email}`.toLowerCase().includes(q)));
  const f = $('#filters');
  f.innerHTML = ['all', 'yes', 'maybe', 'no', 'pending'].map((k) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}">${esc(t(k === 'all' ? 'filter_all' : k))}</button>`).join('');
  $$('[data-f]', f).forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; renderTeamList(); }));
  const list = $('#plist');
  if (!rows.length) { list.innerHTML = `<p class="muted">${esc(t('empty'))}</p>`; return; }
  let html = '';
  let last = null;
  const isAdmin = state.me.person.role === 'admin';
  rows.forEach((p, i) => {
    if (p.cohort !== last) { last = p.cohort; html += `<div class="cohort-head"><span>${esc(p.cohort || '—')}</span></div>`; }
    const a = p.answer || 'pending';
    const extra = p.answer === 'yes' ? [p.nijikai ? t('fee_nijikai').replace(/^.*\(|\)$/g, '') : '', p.companions ? `+${p.companions}` : '', p.kids ? `${t('kids')} ${p.kids}` : ''].filter(Boolean).join(' · ') : '';
    html += `<div class="person" data-st="${p.answer || 'pending'}" style="animation-delay:${Math.min(i, 12) * 35}ms" data-id="${p.id}">
      <div class="av" style="--h:${hue(p.name)}">${esc(initials(p.name))}</div>
      <div><div class="nm">${esc(p.name)}${p.role !== 'member' ? `<span class="tag">${esc(t('role_' + p.role))}</span>` : ''}</div>
        <div class="meta">${esc(p.email)}${isAdmin && p.manager_name ? ` · ${esc(p.manager_name)}` : ''}</div>
        <div style="margin-top:6px"><span class="pill ${a}">${EMO[a]} ${esc(t(p.answer || 'pending'))}</span>
          ${extra ? `<span class="small muted"> ${esc(extra)}</span>` : ''}${p.by_manager ? `<span class="tag warn" title="${esc(t('changed_by_manager'))}">${ic('edit')}</span>` : ''}</div></div>
      <div class="quick">
        ${['yes', 'maybe', 'no'].map((k) => `<button data-q="${k}" class="${p.answer === k ? 'on' : ''}" title="${esc(t(k))}" aria-label="${esc(t(k))}">${EMO[k]}</button>`).join('')}
        <button data-edit title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${ic('edit')}</button>
      </div>
      ${p.note ? `<div class="note">${ic('note')}<span>${esc(p.note)}</span></div>` : ''}
    </div>`;
  });
  list.innerHTML = html;
  $$('.person', list).forEach((row) => {
    const p = state.team.find((x) => x.id === Number(row.dataset.id));
    $$('[data-q]', row).forEach((b) => (b.onclick = async () => {
      const a = b.dataset.q;
      try {
        await api('PUT', `/events/${state.eventId}/team/${p.id}/response`, { answer: a, nijikai: a === 'yes' ? p.nijikai : 0, companions: a === 'yes' ? p.companions : 0, kids: a === 'yes' ? p.kids : 0, note: p.note });
        await loadTeam();
        renderTeamStats();
        renderTeamList();
        toast(`${p.name} · ${t(a)}`);
      } catch (e) { toast(t('err_' + (e.code || 'generic')), true); }
    }));
    $('[data-edit]', row).onclick = () => personDialog(p);
  });
}

async function copyReminder() {
  const ev = curEvent();
  const pend = visible().filter((p) => !p.answer).map((p) => `・${p.name}`);
  const text = t('reminder_text', { title: ev.title, names: pend.join('\n') || '—', url: state.me.base_url });
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(t('reminder_copied', { n: pend.length }));
}

function personDialog(p) {
  const isAdmin = state.me.person.role === 'admin';
  const isNew = !p;
  const cur = p || { name: '', email: '', cohort: '', role: 'member', manager_id: null, answer: null, nijikai: 0, companions: 0, kids: 0, note: '' };
  const managers = (state.team || []).filter((x) => x.role !== 'member');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog">
    <h3>${esc(isNew ? t('add_person') : cur.name)}</h3>
    ${isAdmin ? `<div class="form-grid">
      <label class="field"><span>${esc(t('name'))}</span><input type="text" name="name" value="${esc(cur.name)}" required></label>
      <label class="field"><span>${esc(t('email'))}</span><input type="email" name="email" value="${esc(cur.email)}" required></label>
      <label class="field"><span>${esc(t('cohort'))}</span><input type="text" name="cohort" value="${esc(cur.cohort)}" placeholder="12期"></label>
      <label class="field"><span>${esc(t('role'))}</span><select name="role">${['member', 'manager', 'admin'].map((r) => `<option value="${r}" ${cur.role === r ? 'selected' : ''}>${esc(t('role_' + r))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('manager'))}</span><select name="manager_id"><option value="">—</option>${managers.filter((m) => m.id !== cur.id).map((m) => `<option value="${m.id}" ${cur.manager_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    </div>` : ''}
    ${isNew ? '' : `<div class="seg" role="group">${['yes', 'maybe', 'no'].map((k) => `<button type="button" data-a="${k}" class="${cur.answer === k ? 'on' : ''}">${EMO[k]} ${esc(t(k))}</button>`).join('')}</div>
    <div id="dx" style="display:grid;gap:10px">
      <label class="toggle"><b>${esc(t('nijikai_label'))}</b><input type="checkbox" name="nijikai" ${cur.nijikai ? 'checked' : ''}><span class="sw"></span></label>
      <div class="form-grid"><label class="field"><span>${esc(t('companions'))}</span><input type="number" name="companions" min="0" max="10" value="${cur.companions}"></label>
      <label class="field"><span>${esc(t('kids'))}</span><input type="number" name="kids" min="0" max="10" value="${cur.kids}"></label></div>
      <label class="field"><span>${esc(t('note'))}</span><textarea name="note" maxlength="300" style="min-height:70px">${esc(cur.note)}</textarea></label>
    </div>`}
    <div class="err" id="derr"></div>
    <div class="row spread" style="margin-top:6px">
      <div>${isAdmin && !isNew ? `<button type="button" class="btn danger sm" id="del">${esc(t('delete'))}</button>` : ''}</div>
      <div class="row"><button type="button" class="btn ghost sm" id="cancel">${esc(t('cancel'))}</button><button class="btn sm" id="ok" type="submit">${esc(t('save'))}</button></div>
    </div></form>`;
  document.body.append(dlg);
  dlg.showModal();
  let answer = cur.answer;
  $$('.seg [data-a]', dlg).forEach((b) => (b.onclick = () => { answer = b.dataset.a; $$('.seg [data-a]', dlg).forEach((x) => x.classList.toggle('on', x === b)); }));
  const close = () => { dlg.close(); dlg.remove(); };
  $('#cancel', dlg).onclick = close;
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  const del = $('#del', dlg);
  if (del) del.onclick = async () => {
    if (!confirm(t('confirm_delete', { name: cur.name }))) return;
    try { await api('DELETE', `/admin/person/${cur.id}`); close(); await loadTeam(); renderTeamStats(); renderTeamList(); } catch (e) { $('#derr', dlg).textContent = t('err_' + (e.code || 'generic')); }
  };
  $('form', dlg).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = $('#derr', dlg);
    err.textContent = '';
    try {
      if (isAdmin) {
        const body = { name: f.name.value, email: f.email.value, cohort: f.cohort.value, role: f.role.value, manager_id: f.manager_id.value || null };
        if (isNew) await api('POST', '/admin/person', body); else await api('PUT', `/admin/person/${cur.id}`, body);
      }
      if (!isNew) {
        await api('PUT', `/events/${state.eventId}/team/${cur.id}/response`, { answer, nijikai: answer === 'yes' && f.nijikai.checked, companions: answer === 'yes' ? f.companions.value : 0, kids: answer === 'yes' ? f.kids.value : 0, note: f.note.value });
      }
      close();
      await loadTeam();
      renderTeamStats();
      renderTeamList();
      toast(t('saved'));
    } catch (er) { err.textContent = t('err_' + (er.code || 'generic')); }
  };
}

// ---------- resumen (admin) ----------
async function viewSummary() {
  if (!curEvent()) { $('#view').innerHTML = noEvents(); return; }
  $('#view').innerHTML = `<section class="card" id="sum"><p class="muted">…</p></section>`;
  const evId = state.eventId;
  const d = await api('GET', `/admin/events/${evId}/stats`);
  if (evId !== state.eventId || state.tab !== 'summary') return;
  const s = d.total;
  const f = d.finance;
  const max = Math.max(1, ...d.byCohort.map((c) => c.total));
  const w = (n, tot) => (n / (tot || 1)) * 100;
  $('#sum').innerHTML = `
    <div class="row spread"><h2 style="margin:0">${esc(curEvent().title)}</h2><span class="muted small">${esc(shortDate(curEvent().date))}</span></div>
    <div style="margin-top:16px">${overview()}</div>
    <div class="kv">
      <div><b>${s.nijikai}</b><span>${esc(t('nijikai_count'))}</span></div>
      <div><b>${s.companions}</b><span>${esc(t('companions_count'))}</span></div>
      <div><b>${s.kids}</b><span>${esc(t('kids_count'))}</span></div>
      <div><b>${f.headcount}</b><span>${esc(t('headcount'))}</span></div>
    </div>
    <div class="sep"></div>
    <h3>${esc(t('finance'))}</h3>
    <div class="kv">
      <div><b>${yen(f.revenue)}</b><span>${esc(t('revenue'))}</span></div>
      <div><b>${yen(f.cost)}</b><span>${esc(t('cost'))}</span></div>
      <div><b class="${f.balance >= 0 ? 'pos' : 'neg'}">${yen(f.balance)}</b><span>${esc(t('balance'))}</span></div>
    </div>
    <div class="sep"></div>
    <h3>${esc(t('by_cohort'))}</h3>
    <div class="bars">${d.byCohort.map((c) => `<div class="bar-row"><b>${esc(c.cohort)}</b>
      <div class="progress" style="width:${(c.total / max) * 100}%;min-width:30px"><i class="yes" style="width:${w(c.yes, c.total)}%"></i><i class="maybe" style="width:${w(c.maybe, c.total)}%"></i><i class="no" style="width:${w(c.no, c.total)}%"></i></div>
      <span class="small muted">${c.yes}/${c.total} · ${esc(t('pending'))} ${c.pending}</span></div>`).join('')}</div>`;
  const dn = $('#sum .donut');
  dn.style.setProperty('--y', w(s.yes, s.total) + '%'); dn.style.setProperty('--m', w(s.maybe, s.total) + '%'); dn.style.setProperty('--n', w(s.no, s.total) + '%');
  $$('[data-k]', $('#sum')).forEach((b) => animateNum(b, s[b.dataset.k]));
}

// ---------- eventos (admin) ----------
function eventStatus(e) {
  return e.archived ? t('archived') : e.closed ? t('status_closed') : t('status_open');
}

function viewEvents() {
  const evs = state.me.events;
  if (state.editing !== null) return eventForm();
  $('#view').innerHTML = `<section class="card">
    <div class="row spread"><h2 style="margin:0">${esc(t('tab_event'))}</h2><button class="btn sm" id="newev">${ic('plus')} ${esc(t('new_event'))}</button></div>
    <p class="muted small" style="margin:8px 0 0">${esc(t('events_hint'))}</p>
    <div class="evlist">${evs.length ? evs.slice().reverse().map((e) => `<div class="evrow ${e.archived ? 'arch' : ''}" data-id="${e.id}">
      <div><div class="t">${esc(e.title)}</div>
        <div class="small muted">${esc(shortDate(e.date))}${e.venue ? ' · ' + esc(e.venue) : ''}</div>
        <div style="margin-top:6px"><span class="tag" style="margin-left:0">${esc(eventStatus(e))}</span></div></div>
      <div class="acts">
        <button class="btn ghost sm" data-act="edit">${ic('edit')} ${esc(t('edit'))}</button>
        <button class="btn ghost sm" data-act="dup" title="${esc(t('duplicate'))}">${ic('copyplus')} ${esc(t('duplicate'))}</button>
        <button class="btn ghost sm" data-act="arch">${ic('archive')} ${esc(t(e.archived ? 'unarchive' : 'archive'))}</button>
        <button class="btn ghost sm" data-act="del" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">${ic('trash')}</button>
      </div></div>`).join('') : `<p class="muted">${esc(t('no_events_admin'))}</p>`}</div></section>`;
  $('#newev').onclick = () => { state.editing = 'new'; viewEvents(); };
  $$('.evrow').forEach((row) => {
    const e = evs.find((x) => x.id === Number(row.dataset.id));
    $('[data-act=edit]', row).onclick = () => { state.editing = e.id; viewEvents(); };
    $('[data-act=dup]', row).onclick = async () => {
      try { const n = await api('POST', `/admin/events/${e.id}/duplicate`, {}); await refreshMe(); state.eventId = n.id; store.set('event', n.id); state.editing = n.id; viewEvents(); toast(t('event_duplicated')); } catch (er) { toast(t('err_' + (er.code || 'generic')), true); }
    };
    $('[data-act=arch]', row).onclick = async () => {
      try { await api('PUT', `/admin/events/${e.id}`, { ...e, archived: !e.archived }); await refreshMe(); viewEvents(); toast(t('saved')); } catch (er) { toast(t('err_' + (er.code || 'generic')), true); }
    };
    $('[data-act=del]', row).onclick = async () => {
      if (!confirm(t('confirm_delete_event', { name: e.title }))) return;
      try { await api('DELETE', `/admin/events/${e.id}`); await refreshMe(); state.eventId = pickEvent(); viewEvents(); toast(t('event_deleted')); } catch (er) { toast(t('err_' + (er.code || 'generic')), true); }
    };
  });
}

function eventForm() {
  const isNew = state.editing === 'new';
  const ev = isNew ? { title: '', teacher: '', date: '', deadline: '', tz: '+09:00', venue: '', address: '', map_url: '', info: '', fees: { tachin: 3000, nijikai: 3300, companion: 3000, kid: 0 }, budget: { unit_cost: 0, extras: 0 }, archived: false } : state.me.events.find((e) => e.id === state.editing);
  if (!ev) { state.editing = null; return viewEvents(); }
  const num = (name, label, v) => `<label class="field"><span>${esc(label)}</span><input type="number" min="0" step="100" name="${name}" value="${v}"></label>`;
  $('#view').innerHTML = `<section class="card"><div class="row spread"><h2 style="margin:0">${esc(isNew ? t('new_event') : ev.title)}</h2><button class="link-btn" id="back">${esc(t('back_list'))}</button></div>
    <form id="evf" style="margin-top:8px">
      <div class="form-grid">
        <label class="field"><span>${esc(t('f_title'))}</span><input type="text" name="title" value="${esc(ev.title)}" maxlength="120" required></label>
        <label class="field"><span>${esc(t('f_teacher'))}</span><input type="text" name="teacher" value="${esc(ev.teacher)}" maxlength="120"></label>
        <label class="field"><span>${esc(t('ev_date'))}</span><input type="datetime-local" name="date" value="${esc(ev.date)}"></label>
        <label class="field"><span>${esc(t('ev_deadline'))}</span><input type="datetime-local" name="deadline" value="${esc(ev.deadline)}"></label>
        <label class="field"><span>${esc(t('f_tz'))}</span><input type="text" name="tz" value="${esc(ev.tz)}" pattern="[+-]\\d{2}:\\d{2}" placeholder="+09:00"></label>
        <label class="field"><span>${esc(t('f_venue'))}</span><input type="text" name="venue" value="${esc(ev.venue)}" maxlength="160"></label>
        <label class="field"><span>${esc(t('f_address'))}</span><input type="text" name="address" value="${esc(ev.address)}" maxlength="300"></label>
        <label class="field"><span>${esc(t('f_map'))}</span><input type="url" name="map_url" value="${esc(ev.map_url)}" placeholder="https://maps.app.goo.gl/…"></label>
      </div>
      <label class="field"><span>${esc(t('f_info'))}</span><textarea name="info" maxlength="3000">${esc(ev.info)}</textarea></label>
      <h3>${esc(t('fees'))}</h3>
      <div class="form-grid">${num('f_tachin', t('fee_tachin'), ev.fees.tachin)}${num('f_nijikai', t('fee_nijikai'), ev.fees.nijikai)}${num('f_companion', t('fee_companion'), ev.fees.companion)}${num('f_kid', t('fee_kid'), ev.fees.kid)}</div>
      <h3>${esc(t('budget'))}</h3>
      <div class="form-grid">${num('b_unit', t('b_unit'), ev.budget.unit_cost)}${num('b_extras', t('b_extras'), ev.budget.extras)}</div>
      <div class="err" id="eerr"></div>
      <div class="row"><button class="btn" type="submit">${esc(t('save'))}</button><button class="btn ghost" type="button" id="cancelev">${esc(t('cancel'))}</button></div>
    </form></section>`;
  const back = () => { state.editing = null; viewEvents(); };
  $('#back').onclick = back;
  $('#cancelev').onclick = back;
  $('#evf').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      title: f.title.value, teacher: f.teacher.value, date: f.date.value, deadline: f.deadline.value, tz: f.tz.value,
      venue: f.venue.value, address: f.address.value, map_url: f.map_url.value, info: f.info.value,
      fees: { tachin: f.f_tachin.value, nijikai: f.f_nijikai.value, companion: f.f_companion.value, kid: f.f_kid.value },
      budget: { unit_cost: f.b_unit.value, extras: f.b_extras.value },
    };
    try {
      let saved;
      if (isNew) saved = await api('POST', '/admin/events', body);
      else saved = await api('PUT', `/admin/events/${ev.id}`, { ...body, archived: ev.archived });
      await refreshMe();
      state.eventId = saved.id;
      store.set('event', saved.id);
      state.editing = null;
      viewEvents();
      toast(t('event_saved'));
    } catch (er) { $('#eerr').textContent = t('err_' + (er.code || 'generic')); }
  };
}

// ---------- datos (admin) ----------
async function viewData() {
  const ev = curEvent();
  $('#view').innerHTML = `<section class="card"><h2>${esc(t('import_title'))}</h2>
      <p class="muted">${esc(t('import_hint'))} <a href="/import-template.csv" download>${esc(t('template'))}</a></p>
      <input type="file" id="csvfile" accept=".csv,text/csv,text/plain" aria-label="CSV">
      <label class="field"><span>CSV</span><textarea id="csvtext" placeholder="cohort,name,email,manager_email"></textarea></label>
      <label class="toggle" style="margin-bottom:12px"><span><b>${esc(t('import_replace'))}</b><div class="small muted">${esc(t('import_replace_hint'))}</div></span><input type="checkbox" id="replace"><span class="sw"></span></label>
      <div class="err" id="ierr"></div><div id="irep"></div>
      <button class="btn" id="irun">${esc(t('import_run'))}</button></section>
    <section class="card"><h2>${esc(t('export_title'))}</h2>
      <div class="row">
        ${ev ? `<a class="btn ghost" href="/api/admin/events/${ev.id}/export.xlsx" download>${ic('download')} ${esc(t('export_event', { name: ev.title }))}</a>` : ''}
        <a class="btn ghost" href="/api/admin/export-all.csv" download>${ic('download')} ${esc(t('export_all'))}</a>
        <a class="btn ghost" href="/api/admin/log.csv" download>${ic('download')} ${esc(t('export_log'))}</a></div></section>
    <section class="card"><h2>${esc(t('log_title'))}</h2><div id="logbox"><p class="muted">…</p></div></section>`;
  $('#csvfile').onchange = async (e) => { const f = e.target.files[0]; if (f) $('#csvtext').value = await f.text(); };
  $('#irun').onclick = async () => {
    const csv = $('#csvtext').value;
    const replace = $('#replace').checked;
    $('#ierr').textContent = '';
    if (!csv.trim()) return;
    if (replace && !confirm(t('import_replace_confirm'))) return;
    try {
      const r = await api('POST', '/admin/import', { csv, replace });
      $('#irep').innerHTML = `<p><b class="pos">${esc(t('import_result', { c: r.created, u: r.updated }))}</b></p>${r.errors.length ? `<p class="neg small">${r.errors.slice(0, 10).map((x) => esc(`${x.line ? 'L' + x.line + ': ' : ''}${x.error} ${x.value || ''}`)).join('<br>')}</p>` : ''}`;
    } catch (er) { $('#ierr').textContent = t('err_' + (er.code || 'generic')); }
  };
  const rows = await api('GET', '/admin/log');
  if (state.tab !== 'data') return;
  $('#logbox').innerHTML = rows.length
    ? `<div style="overflow-x:auto"><table class="log-table"><tr><th>${esc(t('when'))}</th><th>${esc(t('who'))}</th><th>${esc(t('person'))}</th><th>${esc(t('action'))}</th><th></th></tr>${rows.map((r) => `<tr><td>${esc(new Date(r.ts).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }))}</td><td>${esc(r.actor || '')}</td><td>${esc(r.person || '')}</td><td>${esc(r.action)}</td><td class="det">${esc(r.detail)}</td></tr>`).join('')}</table></div>`
    : `<p class="muted">${esc(t('empty'))}</p>`;
}

// ---------- efecto onda al tocar ----------
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('.btn, .choice, .chip, .icon-btn, .tabs button, .quick button, .seg button, .ev');
  if (!b || b.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = b.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span');
  s.className = 'rip';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.append(s);
  setTimeout(() => s.remove(), 650);
});

// ---------- arranque ----------
async function boot() {
  try {
    state.me = await api('GET', '/me');
    render();
  } catch {
    renderLogin();
  }
}

(async () => {
  const saved = store.get('lang');
  await loadLang(['es', 'ja'].includes(saved) ? saved : (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'es');
  const q = new URLSearchParams(location.search);
  if (q.get('e') && q.get('c')) {
    history.replaceState(null, '', location.pathname);
    try {
      await api('POST', '/auth/verify', { email: q.get('e'), code: q.get('c') });
      return boot();
    } catch { /* cae al login */ }
  }
  boot();
})();
