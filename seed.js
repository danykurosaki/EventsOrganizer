// Datos de PRUEBA ficticios (emails @example.com). Uso: node seed.js  (borra personas/respuestas previas)
import { db, createEvent, setArchived, DEFAULT_EVENT } from './db.js';

db.exec('DELETE FROM response; DELETE FROM events; DELETE FROM session; DELETE FROM login_code; DELETE FROM log; DELETE FROM person;');

const ins = db.prepare('INSERT INTO person (cohort, name, email, role, manager_id) VALUES (?,?,?,?,?)');
const add = (cohort, name, email, role = 'member', mid = null) => Number(ins.run(cohort, name, email, role, mid).lastInsertRowid);

add('', 'Admin Prueba', 'admin@example.com', 'admin');

const groups = [
  ['1期', 'Responsable Uno', 'manager1@example.com', ['Akira Prueba', 'Beatriz Demo', 'Carlos Ejemplo', 'Daiki Test', 'Emi Muestra', 'Fumi Falso', 'Goro Ficticio']],
  ['2期', 'Responsable Dos', 'manager2@example.com', ['Hana Prueba', 'Ivan Demo', 'Jun Ejemplo', 'Kaori Test', 'Luis Muestra', 'Mika Falso', 'Nao Ficticio']],
  ['3期', 'Responsable Tres', 'manager3@example.com', ['Oscar Prueba', 'Pilar Demo', 'Quino Ejemplo', 'Rina Test', 'Sora Muestra', 'Taro Falso']],
];
const ids = [];
groups.forEach(([cohort, mname, memail, members], gi) => {
  const mid = add(cohort, mname, memail, 'manager');
  ids.push(mid);
  members.forEach((n, i) => ids.push(add(cohort, n, `${n.split(' ')[0].toLowerCase()}${gi + 1}@example.com`, 'member', mid)));
});

const d = new Date(Date.now() + 30 * 864e5);
const dl = new Date(Date.now() + 14 * 864e5);
const d2 = new Date(Date.now() + 75 * 864e5);
const dl2 = new Date(Date.now() + 60 * 864e5);
const past = new Date(Date.now() - 365 * 864e5);
const fmt = (x) => x.toISOString().slice(0, 10);
const e1 = createEvent({
  ...DEFAULT_EVENT, title: 'OBOG会 2026', teacher: 'Prof. Ejemplo', date: `${fmt(d)}T18:30`, deadline: `${fmt(dl)}T23:59`,
  venue: 'Restaurante Demo', address: 'Calle Ficticia 1, Ciudad', map_url: 'https://maps.example.com',
  info: 'Dress code: casual.\nEvento de PRUEBA con datos ficticios.',
  fees: { tachin: 3000, companion: 3000, nijikai: 3300, kid: 0 }, budget: { unit_cost: 5000, extras: 6000 },
});
const e2 = createEvent({
  ...DEFAULT_EVENT, title: 'Excursión de primavera', teacher: '', date: `${fmt(d2)}T10:00`, deadline: `${fmt(dl2)}T23:59`,
  venue: 'Parque Demo', address: 'Camino Ficticio s/n', info: 'Almuerzo al aire libre. Evento de PRUEBA.',
  fees: { tachin: 1500, companion: 1500, nijikai: 0, kid: 0 }, budget: { unit_cost: 1200, extras: 0 },
});
const e0 = createEvent({ ...DEFAULT_EVENT, title: 'OBOG会 2025', date: `${fmt(past)}T18:30`, deadline: `${fmt(past)}T12:00`, venue: 'Restaurante Demo' });
setArchived(e0, true);

const resp = db.prepare('INSERT INTO response (person_id, event_id, answer, nijikai, companions, kids, note, updated_by, updated_at, by_manager) VALUES (?,?,?,?,?,?,?,?,?,?)');
const now = new Date().toISOString();
ids.forEach((id, i) => {
  if (i % 4 !== 3) {
    const a = ['yes', 'yes', 'maybe', 'no'][i % 4];
    resp.run(id, e1, a, a === 'yes' && i % 3 === 0 ? 1 : 0, a === 'yes' && i % 5 === 0 ? 1 : 0, a === 'yes' && i % 7 === 0 ? 1 : 0, '', id, now, 0);
  }
  if (i % 3 === 0) resp.run(id, e2, 'yes', 0, 0, 0, '', id, now, 0);
  resp.run(id, e0, i % 2 ? 'yes' : 'no', 0, 0, 0, '', id, now, 0);
});
console.log('Seed OK:', db.prepare('SELECT COUNT(*) n FROM person').get().n, 'personas,', db.prepare('SELECT COUNT(*) n FROM events').get().n, 'eventos');
