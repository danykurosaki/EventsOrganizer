import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { db, getEvent, listEvents, createEvent, saveEvent, setArchived, deleteEvent, normEvent, audit, tx } from './db.js';
import { sendCode, mailEnabled } from './mail.js';
import { parseCsv, toCsv } from './csv.js';
import { buildRosterXlsx } from './xlsx.js';

const PORT = Number(process.env.PORT || 3004);
const HOST = process.env.HOST || '127.0.0.1';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECRET = process.env.APP_SECRET || 'dev-secret-change-me';
const SESSION_DAYS = 60;
const CODE_TTL = 10 * 60 * 1000;
const COOKIE = 'obog_session';

if (SECRET === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  console.error('APP_SECRET es obligatorio en producción');
  process.exit(1);
}

const sha = (s) => crypto.createHash('sha256').update(`${s}|${SECRET}`).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- rate limit en memoria ----------
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k);
  db.prepare('DELETE FROM session WHERE expires < ?').run(now);
  db.prepare('DELETE FROM login_code WHERE expires < ?').run(now);
}, 10 * 60 * 1000).unref();

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use((req, res, next) => {
  res.set({
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.json({ limit: '2mb' }));
// defensa CSRF adicional para métodos que modifican estado
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'obog') return res.status(400).json({ error: 'bad_request' });
  next();
});

const cookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p[0])
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );

function setSessionCookie(res, token, maxAgeSec) {
  const secure = BASE_URL.startsWith('https') ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`);
}

function auth(req, res, next) {
  const tok = cookies(req)[COOKIE];
  if (!tok) return res.status(401).json({ error: 'auth' });
  const p = db
    .prepare(
      `SELECT p.* FROM session s JOIN person p ON p.id = s.person_id WHERE s.hash = ? AND s.expires > ?`,
    )
    .get(sha(tok), Date.now());
  if (!p) return res.status(401).json({ error: 'auth' });
  req.user = { ...p };
  next();
}
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden' });

// ---------- lógica de respuestas ----------
const ANSWERS = ['yes', 'maybe', 'no'];
const clampInt = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));

function normResponse(input) {
  const answer = input.answer === null || input.answer === '' ? null : input.answer;
  if (answer !== null && !ANSWERS.includes(answer)) throw httpError(400, 'invalid_answer');
  return {
    answer,
    nijikai: input.nijikai ? 1 : 0,
    companions: clampInt(input.companions, 10),
    kids: clampInt(input.kids, 10),
    note: String(input.note || '').slice(0, 300),
  };
}
const httpError = (status, error) => Object.assign(new Error(error), { status, error });

const BLANK = { answer: null, nijikai: 0, companions: 0, kids: 0, note: '', updated_at: null, by_manager: 0 };
function getResponse(personId, eventId) {
  const r = db
    .prepare('SELECT answer, nijikai, companions, kids, note, updated_at, by_manager FROM response WHERE person_id = ? AND event_id = ?')
    .get(personId, eventId);
  return r ? { ...r } : { ...BLANK };
}

function saveResponse(personId, actorId, eventId, input) {
  const next = normResponse(input);
  const prev = getResponse(personId, eventId);
  const changed = ['answer', 'nijikai', 'companions', 'kids', 'note'].filter((k) => (prev[k] ?? null) !== (next[k] ?? null));
  if (!changed.length) return prev;
  const byManager = actorId !== personId ? 1 : 0;
  db.prepare(
    `INSERT INTO response (person_id, event_id, answer, nijikai, companions, kids, note, updated_by, updated_at, by_manager)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(person_id, event_id) DO UPDATE SET answer=excluded.answer, nijikai=excluded.nijikai, companions=excluded.companions,
       kids=excluded.kids, note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at, by_manager=excluded.by_manager`,
  ).run(personId, eventId, next.answer, next.nijikai, next.companions, next.kids, next.note, actorId, new Date().toISOString(), byManager);
  audit(actorId, personId, byManager ? 'response_by_manager' : 'response', { event: eventId, ...Object.fromEntries(changed.map((k) => [k, [prev[k] ?? null, next[k] ?? null]])) });
  return getResponse(personId, eventId);
}

function isClosed(ev) {
  if (ev.archived) return true;
  if (!ev.deadline) return false;
  return Date.now() > new Date(`${ev.deadline}:00${ev.tz || '+09:00'}`).getTime();
}

const cohortNum = (c) => (parseInt(String(c).match(/\d+/)?.[0], 10) || 9999);
function listPeople(user, eventId) {
  const where = user.role === 'admin' ? '' : 'WHERE p.manager_id = ? OR p.id = ?';
  const args = [eventId, ...(user.role === 'admin' ? [] : [user.id, user.id])];
  const rows = db
    .prepare(
      `SELECT p.id, p.cohort, p.name, p.email, p.role, p.manager_id, p.note AS pnote, m.name AS manager_name,
              r.answer, COALESCE(r.nijikai,0) AS nijikai, COALESCE(r.companions,0) AS companions, COALESCE(r.kids,0) AS kids,
              COALESCE(r.note,'') AS note, r.updated_at, COALESCE(r.by_manager,0) AS by_manager
       FROM person p LEFT JOIN response r ON r.person_id = p.id AND r.event_id = ? LEFT JOIN person m ON m.id = p.manager_id ${where}`,
    )
    .all(...args)
    .map((r) => ({ ...r }));
  return rows.sort((a, b) => cohortNum(a.cohort) - cohortNum(b.cohort) || a.cohort.localeCompare(b.cohort) || a.name.localeCompare(b.name, 'ja'));
}

function computeStats(rows, ev) {
  const blank = () => ({ total: 0, yes: 0, maybe: 0, no: 0, pending: 0, nijikai: 0, companions: 0, kids: 0 });
  const total = blank();
  const byCohort = {};
  for (const r of rows) {
    for (const t of [total, (byCohort[r.cohort || '—'] ||= blank())]) {
      t.total++;
      t[r.answer || 'pending']++;
      if (r.answer === 'yes') {
        t.nijikai += r.nijikai ? 1 : 0;
        t.companions += r.companions;
        t.kids += r.kids;
      }
    }
  }
  const f = ev.fees;
  const headcount = total.yes + total.companions;
  const revenue = total.yes * f.tachin + total.companions * f.companion + total.nijikai * f.nijikai + total.kids * f.kid;
  const cost = headcount * ev.budget.unit_cost + ev.budget.extras;
  return {
    total,
    byCohort: Object.entries(byCohort)
      .sort((a, b) => cohortNum(a[0]) - cohortNum(b[0]))
      .map(([cohort, s]) => ({ cohort, ...s })),
    finance: { headcount, revenue, cost, balance: revenue - cost },
  };
}

function csvRows(rows) {
  return [
    ['cohort', 'name', 'email', 'role', 'manager', 'answer', 'nijikai', 'companions', 'kids', 'note', 'updated_at', 'edited_by_manager'],
    ...rows.map((r) => [r.cohort, r.name, r.email, r.role, r.manager_name || '', r.answer || '', r.nijikai, r.companions, r.kids, r.note, r.updated_at || '', r.by_manager ? 1 : 0]),
  ];
}
async function sendXlsx(res, name, rows, ev) {
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${name}"`,
  });
  res.send(await buildRosterXlsx(rows, ev));
}
function sendCsv(res, name, rows) {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
  res.send(toCsv(rows));
}

// ---------- autenticación ----------
// Sin SMTP y fuera de producción (modo pruebas) se dan pistas extra; con SMTP real la respuesta es siempre neutra.
const DEV = !mailEnabled && process.env.NODE_ENV !== 'production';
// Solo para pruebas locales: muestra el código en pantalla. Exige activarlo a mano Y que BASE_URL sea localhost.
const SHOW_CODE = DEV && process.env.DEV_SHOW_CODE === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL);
app.post('/api/auth/request', async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.json({ ok: true });
  if (limited(`ip:${req.ip}`, 20, 3600e3) || limited(`mail:${email}`, 8, 3600e3)) return res.json({ ok: true, wait: true });
  // el enfriamiento se aplica igual a emails existentes y desconocidos: no revela nada
  if (limited(`mail1:${email}`, 1, 30e3)) return res.json({ ok: true, wait: true });
  const p = db.prepare('SELECT id, name FROM person WHERE email = ?').get(email);
  if (!p) return res.json(DEV ? { ok: true, dev: true, unknown: true } : { ok: true });
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  db.prepare(
    `INSERT INTO login_code (email, hash, expires, attempts) VALUES (?,?,?,0)
     ON CONFLICT(email) DO UPDATE SET hash=excluded.hash, expires=excluded.expires, attempts=0`,
  ).run(email, sha(`${email}|${code}`), Date.now() + CODE_TTL);
  const link = `${BASE_URL}/?e=${encodeURIComponent(email)}&c=${code}`;
  res.json(SHOW_CODE ? { ok: true, dev: true, code } : DEV ? { ok: true, dev: true } : { ok: true });
  try {
    await sendCode({ to: email, name: p.name, code, link, title: process.env.APP_TITLE || 'OBOG会' });
  } catch (e) {
    console.error('Error enviando correo:', e.message);
  }
});

app.post('/api/auth/verify', (req, res) => {
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (limited(`vip:${req.ip}`, 40, 3600e3)) return res.status(429).json({ error: 'rate' });
  const row = db.prepare('SELECT * FROM login_code WHERE email = ?').get(email);
  if (!row || row.expires < Date.now()) return res.status(400).json({ error: 'invalid_code' });
  if (row.attempts >= 5) {
    db.prepare('DELETE FROM login_code WHERE email = ?').run(email);
    return res.status(429).json({ error: 'rate' });
  }
  const ok = crypto.timingSafeEqual(Buffer.from(row.hash), Buffer.from(sha(`${email}|${code}`)));
  if (!ok) {
    db.prepare('UPDATE login_code SET attempts = attempts + 1 WHERE email = ?').run(email);
    return res.status(400).json({ error: 'invalid_code' });
  }
  db.prepare('DELETE FROM login_code WHERE email = ?').run(email);
  const p = db.prepare('SELECT id FROM person WHERE email = ?').get(email);
  if (!p) return res.status(400).json({ error: 'invalid_code' });
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO session (hash, person_id, expires) VALUES (?,?,?)').run(sha(token), p.id, Date.now() + SESSION_DAYS * 864e5);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  audit(p.id, p.id, 'login');
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const tok = cookies(req)[COOKIE];
  if (tok) db.prepare('DELETE FROM session WHERE hash = ?').run(sha(tok));
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});

// ---------- API autenticada ----------
const api = express.Router();
api.use(auth);

// evento accesible para el usuario (los archivados solo los ve el admin)
function eventFor(req) {
  const ev = getEvent(Number(req.params.eid));
  if (!ev || (ev.archived && req.user.role !== 'admin')) throw httpError(404, 'not_found');
  return ev;
}

api.get('/me', (req, res) => {
  const u = req.user;
  const isAdmin = u.role === 'admin';
  const mgr = u.manager_id ? db.prepare('SELECT name FROM person WHERE id = ?').get(u.manager_id) : null;
  const events = listEvents()
    .filter((e) => isAdmin || !e.archived)
    .map((e) => ({ ...e, closed: isClosed(e), budget: isAdmin ? e.budget : undefined }));
  res.json({
    person: { id: u.id, name: u.name, email: u.email, cohort: u.cohort, role: u.role, manager_name: mgr?.name || null },
    events,
    responses: Object.fromEntries(events.map((e) => [e.id, getResponse(u.id, e.id)])),
    base_url: BASE_URL,
  });
});

api.put('/events/:eid/me/response', (req, res) => {
  const ev = eventFor(req);
  if (isClosed(ev)) return res.status(403).json({ error: 'closed' });
  res.json(saveResponse(req.user.id, req.user.id, ev.id, req.body || {}));
});

api.get('/events/:eid/team', requireRole('manager', 'admin'), (req, res) => {
  const ev = eventFor(req);
  const rows = listPeople(req.user, ev.id);
  res.json({ people: rows, stats: computeStats(rows, ev) });
});

function canEdit(actor, targetId) {
  const t = db.prepare('SELECT id, manager_id FROM person WHERE id = ?').get(targetId);
  if (!t) return false;
  return actor.role === 'admin' || (actor.role === 'manager' && (t.manager_id === actor.id || t.id === actor.id));
}

api.put('/events/:eid/team/:id/response', requireRole('manager', 'admin'), (req, res) => {
  const ev = eventFor(req);
  const id = Number(req.params.id);
  if (!canEdit(req.user, id)) return res.status(403).json({ error: 'forbidden' });
  res.json(saveResponse(id, req.user.id, ev.id, req.body || {}));
});

api.get('/events/:eid/team/export.xlsx', requireRole('manager', 'admin'), async (req, res) => {
  const ev = eventFor(req);
  await sendXlsx(res, `obog-${ev.id}-${req.user.role === 'admin' ? 'todos' : 'grupo'}.xlsx`, listPeople(req.user, ev.id), ev);
});

api.get('/events/:eid/team/export.csv', requireRole('manager', 'admin'), (req, res) => {
  const ev = eventFor(req);
  sendCsv(res, `obog-${ev.id}-${req.user.role === 'admin' ? 'todos' : 'grupo'}.csv`, csvRows(listPeople(req.user, ev.id)));
});

// ----- admin -----
const admin = express.Router();
admin.use(requireRole('admin'));

const adminEvent = (req) => {
  const ev = getEvent(Number(req.params.eid));
  if (!ev) throw httpError(404, 'not_found');
  return ev;
};

admin.post('/events', (req, res) => {
  const data = normEvent(req.body || {});
  // copiar de otro evento: precios y datos base si no se envían
  const id = createEvent(data);
  audit(req.user.id, null, 'event_create', { event: id, title: data.title });
  res.json(getEvent(id));
});

admin.put('/events/:eid', (req, res) => {
  const ev = adminEvent(req);
  saveEvent(ev.id, normEvent(req.body || {}));
  if (req.body?.archived !== undefined) setArchived(ev.id, !!req.body.archived);
  audit(req.user.id, null, 'event_update', { event: ev.id });
  res.json(getEvent(ev.id));
});

admin.post('/events/:eid/duplicate', (req, res) => {
  const ev = adminEvent(req);
  const { id: _i, archived: _a, ...data } = ev;
  const id = createEvent({ ...data, title: `${ev.title} (copia)`, date: '', deadline: '' });
  audit(req.user.id, null, 'event_duplicate', { from: ev.id, event: id });
  res.json(getEvent(id));
});

admin.delete('/events/:eid', (req, res) => {
  const ev = adminEvent(req);
  deleteEvent(ev.id);
  audit(req.user.id, null, 'event_delete', { event: ev.id, title: ev.title });
  res.json({ deleted: 1 });
});

admin.post('/person', (req, res) => {
  const b = req.body || {};
  const email = normEmail(b.email);
  if (!EMAIL_RE.test(email) || !String(b.name || '').trim()) return res.status(400).json({ error: 'invalid' });
  if (db.prepare('SELECT 1 FROM person WHERE email = ?').get(email)) return res.status(409).json({ error: 'exists' });
  const role = ['member', 'manager', 'admin'].includes(b.role) ? b.role : 'member';
  const r = db
    .prepare('INSERT INTO person (cohort, name, email, role, manager_id, note) VALUES (?,?,?,?,?,?)')
    .run(String(b.cohort || '').trim(), String(b.name).trim(), email, role, b.manager_id ? Number(b.manager_id) : null, String(b.pnote || '').slice(0, 300));
  audit(req.user.id, Number(r.lastInsertRowid), 'person_create', email);
  res.json({ id: Number(r.lastInsertRowid) });
});

admin.put('/person/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM person WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const email = b.email !== undefined ? normEmail(b.email) : cur.email;
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid' });
  const clash = db.prepare('SELECT id FROM person WHERE email = ? AND id <> ?').get(email, id);
  if (clash) return res.status(409).json({ error: 'exists' });
  const role = ['member', 'manager', 'admin'].includes(b.role) ? b.role : cur.role;
  if (id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'self_demote' });
  const mid = b.manager_id === undefined ? cur.manager_id : b.manager_id ? Number(b.manager_id) : null;
  if (mid === id) return res.status(400).json({ error: 'invalid' });
  db.prepare('UPDATE person SET cohort=?, name=?, email=?, role=?, manager_id=?, note=? WHERE id=?').run(
    b.cohort !== undefined ? String(b.cohort).trim() : cur.cohort,
    b.name !== undefined ? String(b.name).trim() || cur.name : cur.name,
    email,
    role,
    mid,
    b.pnote !== undefined ? String(b.pnote).slice(0, 300) : cur.note,
    id,
  );
  if (email !== cur.email) db.prepare('DELETE FROM session WHERE person_id = ?').run(id);
  audit(req.user.id, id, 'person_update');
  res.json({ ok: true });
});

admin.delete('/person/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'self_delete' });
  const r = db.prepare('DELETE FROM person WHERE id = ?').run(id);
  audit(req.user.id, id, 'person_delete');
  res.json({ deleted: Number(r.changes) });
});

admin.post('/import', (req, res) => {
  const rows = parseCsv(req.body?.csv);
  if (rows.length < 2) return res.status(400).json({ error: 'empty' });
  const alias = { cohort: 'cohort', 期: 'cohort', name: 'name', 名前: 'name', email: 'email', mail: 'email', manager_email: 'manager_email', manager: 'manager_email', role: 'role' };
  const header = rows[0].map((h) => alias[h.trim().toLowerCase()] || h.trim().toLowerCase());
  if (!header.includes('name') || !header.includes('email')) return res.status(400).json({ error: 'missing_columns' });
  const report = { created: 0, updated: 0, errors: [] };
  const mode = req.body?.replace ? 'replace' : 'merge';
  tx(() => {
    const seen = [];
    rows.slice(1).forEach((r, i) => {
      const o = Object.fromEntries(header.map((h, j) => [h, (r[j] ?? '').trim()]));
      const email = normEmail(o.email);
      if (!EMAIL_RE.test(email) || !o.name) return report.errors.push({ line: i + 2, error: 'invalid', value: o.email || o.name });
      const role = ['member', 'manager', 'admin'].includes(o.role) ? o.role : null;
      const cur = db.prepare('SELECT id, role FROM person WHERE email = ?').get(email);
      if (cur) {
        db.prepare('UPDATE person SET cohort=?, name=?, role=? WHERE id=?').run(o.cohort || '', o.name, role || cur.role, cur.id);
        report.updated++;
        seen.push(cur.id);
      } else {
        const ins = db.prepare('INSERT INTO person (cohort, name, email, role) VALUES (?,?,?,?)').run(o.cohort || '', o.name, email, role || 'member');
        report.created++;
        seen.push(Number(ins.lastInsertRowid));
      }
    });
    // segunda pasada: responsables (por email)
    rows.slice(1).forEach((r) => {
      const o = Object.fromEntries(header.map((h, j) => [h, (r[j] ?? '').trim()]));
      const email = normEmail(o.email);
      if (!o.manager_email) return;
      const m = db.prepare('SELECT id FROM person WHERE email = ?').get(normEmail(o.manager_email));
      if (!m) return report.errors.push({ error: 'manager_not_found', value: o.manager_email });
      db.prepare('UPDATE person SET manager_id = ? WHERE email = ? AND id <> ?').run(m.id, email, m.id);
      // quien tiene personas a cargo es responsable (salvo admin)
      db.prepare("UPDATE person SET role = 'manager' WHERE id = ? AND role = 'member'").run(m.id);
    });
    if (mode === 'replace') {
      const keep = new Set([...seen, req.user.id]);
      for (const p of db.prepare('SELECT id FROM person').all()) if (!keep.has(p.id)) db.prepare('DELETE FROM person WHERE id = ?').run(p.id);
    }
  });
  audit(req.user.id, null, 'import', report);
  res.json(report);
});

admin.get('/events/:eid/export.xlsx', async (req, res) => {
  const ev = adminEvent(req);
  await sendXlsx(res, `obog-${ev.id}-completo.xlsx`, listPeople(req.user, ev.id), ev);
});

admin.get('/events/:eid/stats', (req, res) => {
  const ev = adminEvent(req);
  res.json(computeStats(listPeople(req.user, ev.id), ev));
});

admin.get('/events/:eid/export.csv', (req, res) => {
  const ev = adminEvent(req);
  sendCsv(res, `obog-${ev.id}-completo.csv`, csvRows(listPeople(req.user, ev.id)));
});

// matriz de todos los eventos: una fila por persona, una columna por evento
admin.get('/export-all.csv', (req, res) => {
  const evs = listEvents();
  const people = listPeople(req.user, 0);
  const byEvent = new Map(evs.map((e) => [e.id, new Map(listPeople(req.user, e.id).map((p) => [p.id, p]))]));
  const rows = [['cohort', 'name', 'email', 'role', 'manager', ...evs.map((e) => e.title)]];
  for (const p of people) rows.push([p.cohort, p.name, p.email, p.role, p.manager_name || '', ...evs.map((e) => byEvent.get(e.id).get(p.id)?.answer || '')]);
  sendCsv(res, 'obog-todos-los-eventos.csv', rows);
});

admin.get('/log.csv', (req, res) => {
  const rows = db
    .prepare(
      `SELECT l.ts, a.name AS actor, p.name AS person, l.action, l.detail FROM log l
       LEFT JOIN person a ON a.id = l.actor_id LEFT JOIN person p ON p.id = l.person_id ORDER BY l.id DESC LIMIT 20000`,
    )
    .all();
  sendCsv(res, 'obog-log.csv', [['timestamp', 'actor', 'person', 'action', 'detail'], ...rows.map((r) => [r.ts, r.actor || '', r.person || '', r.action, r.detail])]);
});

admin.get('/log', (req, res) => {
  const rows = db
    .prepare(
      `SELECT l.ts, a.name AS actor, p.name AS person, l.action, l.detail FROM log l
       LEFT JOIN person a ON a.id = l.actor_id LEFT JOIN person p ON p.id = l.person_id
       WHERE l.action <> 'login' ORDER BY l.id DESC LIMIT 100`,
    )
    .all()
    .map((r) => ({ ...r }));
  res.json(rows);
});

api.use('/admin', admin);
app.use('/api', api);

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
app.use(express.static(path.join(import.meta.dirname, 'public'), { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.error });
  console.error(err);
  res.status(500).json({ error: 'server' });
});

// ---------- admins iniciales ----------
for (const e of (process.env.ADMIN_EMAILS || '').split(',').map(normEmail).filter(Boolean)) {
  if (!EMAIL_RE.test(e)) continue;
  const cur = db.prepare('SELECT id FROM person WHERE email = ?').get(e);
  if (cur) db.prepare("UPDATE person SET role = 'admin' WHERE id = ?").run(cur.id);
  else db.prepare("INSERT INTO person (cohort, name, email, role) VALUES ('', ?, ?, 'admin')").run(e.split('@')[0], e);
}

app.listen(PORT, HOST, () => console.log(`OBOG cena escuchando en http://${HOST}:${PORT}`));
