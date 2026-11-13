import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbFile = process.env.DB_FILE || path.join(import.meta.dirname, 'data', 'obog.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS person (
  id         INTEGER PRIMARY KEY,
  cohort     TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager','admin')),
  manager_id INTEGER REFERENCES person(id) ON DELETE SET NULL,
  note       TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS login_code (
  email    TEXT PRIMARY KEY COLLATE NOCASE,
  hash     TEXT NOT NULL,
  expires  INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session (
  hash      TEXT PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  expires   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS log (
  id        INTEGER PRIMARY KEY,
  ts        TEXT NOT NULL,
  person_id INTEGER,
  actor_id  INTEGER,
  action    TEXT NOT NULL,
  detail    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_person_manager ON person(manager_id);
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  data       TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

// --- migración desde la versión de un solo evento ---
const hasTable = (n) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
if (hasTable('event')) {
  const old = db.prepare('SELECT data FROM event WHERE id = 1').get();
  if (old && !db.prepare('SELECT 1 FROM events WHERE id = 1').get()) {
    db.prepare('INSERT INTO events (id, data, archived, created_at) VALUES (1, ?, 0, ?)').run(old.data, new Date().toISOString());
  }
  db.exec('DROP TABLE event');
}
let legacy = false;
if (hasTable('response') && !db.prepare('PRAGMA table_info(response)').all().some((c) => c.name === 'event_id')) {
  db.exec('ALTER TABLE response RENAME TO response_old');
  legacy = true;
}
db.exec(`
CREATE TABLE IF NOT EXISTS response (
  person_id  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  answer     TEXT CHECK (answer IN ('yes','maybe','no')),
  nijikai    INTEGER NOT NULL DEFAULT 0,
  companions INTEGER NOT NULL DEFAULT 0,
  kids       INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  updated_by INTEGER,
  updated_at TEXT,
  by_manager INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_response_event ON response(event_id);
`);
if (legacy) {
  if (!db.prepare('SELECT 1 FROM events WHERE id = 1').get()) {
    db.prepare('INSERT INTO events (id, data, archived, created_at) VALUES (1, ?, 0, ?)').run(JSON.stringify({}), new Date().toISOString());
  }
  db.exec(`INSERT INTO response (person_id, event_id, answer, nijikai, companions, kids, note, updated_by, updated_at, by_manager)
           SELECT person_id, 1, answer, nijikai, companions, kids, note, updated_by, updated_at, by_manager FROM response_old;
           DROP TABLE response_old;`);
}

// --- historial: columna event_id para poder filtrar la actividad por evento ---
if (!db.prepare('PRAGMA table_info(log)').all().some((c) => c.name === 'event_id')) {
  db.exec('ALTER TABLE log ADD COLUMN event_id INTEGER');
  db.exec(`UPDATE log SET event_id = CASE WHEN json_valid(detail) THEN CAST(json_extract(detail, '$.event') AS INTEGER) END
           WHERE action IN ('response','response_by_manager')`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_log_event ON log(event_id, id); CREATE INDEX IF NOT EXISTS idx_log_person ON log(person_id);');

export const DEFAULT_EVENT = {
  title: 'OBOG会',
  teacher: '',
  date: '', // 'YYYY-MM-DDTHH:mm' hora local del lugar
  tz: '+09:00', // desfase horario del lugar
  deadline: '', // 'YYYY-MM-DDTHH:mm' hora local del lugar
  venue: '',
  address: '',
  map_url: '',
  info: '',
  fees: { tachin: 3000, companion: 3000, nijikai: 3300, kid: 0 },
  budget: { unit_cost: 0, extras: 0 },
};

const mergeEvent = (saved) => ({
  ...DEFAULT_EVENT,
  ...saved,
  fees: { ...DEFAULT_EVENT.fees, ...(saved.fees || {}) },
  budget: { ...DEFAULT_EVENT.budget, ...(saved.budget || {}) },
});
const rowToEvent = (r) => ({ id: r.id, archived: !!r.archived, ...mergeEvent(JSON.parse(r.data)) });

export function getEvent(id) {
  const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return r ? rowToEvent(r) : null;
}

// ordenados por fecha ascendente; sin fecha al final
export function listEvents() {
  return db
    .prepare('SELECT * FROM events')
    .all()
    .map(rowToEvent)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id - b.id);
}

export function createEvent(data) {
  const r = db.prepare('INSERT INTO events (data, archived, created_at) VALUES (?, 0, ?)').run(JSON.stringify(data), new Date().toISOString());
  return Number(r.lastInsertRowid);
}
export function saveEvent(id, data) {
  db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
}
export function setArchived(id, flag) {
  db.prepare('UPDATE events SET archived = ? WHERE id = ?').run(flag ? 1 : 0, id);
}
export function deleteEvent(id) {
  // el historial de respuestas del evento contiene datos personales: se elimina con él
  db.prepare('DELETE FROM log WHERE event_id = ?').run(id);
  return Number(db.prepare('DELETE FROM events WHERE id = ?').run(id).changes);
}

export function normEvent(b = {}) {
  const str = (v, n = 500) => String(v ?? '').trim().slice(0, n);
  const num = (v) => Math.max(0, Number(v) || 0);
  const dt = (v) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '') ? v : '');
  return {
    title: str(b.title, 120) || 'OBOG会',
    teacher: str(b.teacher, 120),
    date: dt(b.date),
    tz: /^[+-]\d{2}:\d{2}$/.test(b.tz || '') ? b.tz : '+09:00',
    deadline: dt(b.deadline),
    venue: str(b.venue, 160),
    address: str(b.address, 300),
    map_url: /^https?:\/\//.test(b.map_url || '') ? str(b.map_url, 500) : '',
    info: str(b.info, 3000),
    fees: { tachin: num(b.fees?.tachin), companion: num(b.fees?.companion), nijikai: num(b.fees?.nijikai), kid: num(b.fees?.kid) },
    budget: { unit_cost: num(b.budget?.unit_cost), extras: num(b.budget?.extras) },
  };
}

export function audit(actorId, personId, action, detail = '', eventId = null) {
  db.prepare('INSERT INTO log (ts, person_id, actor_id, action, detail, event_id) VALUES (?,?,?,?,?,?)').run(
    new Date().toISOString(),
    personId ?? null,
    actorId ?? null,
    action,
    typeof detail === 'string' ? detail : JSON.stringify(detail),
    eventId,
  );
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
