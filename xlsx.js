// Exporta un evento a Excel replicando el formato de la «OBOG名簿» original:
// bloques por promoción (期), columnas 立食/二/計/同伴者/備考 y panel de totales/cuotas a la derecha.
import ExcelJS from 'exceljs';

const FONT = 'ＭＳ Ｐゴシック';
const thin = { style: 'thin' };
const hair = { style: 'hair' };
const medium = { style: 'medium' };
const thick = { style: 'thick' };
const dash = { style: 'dashDot' };
const box = (s = thin) => ({ left: s, right: s, top: s, bottom: s });
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const cohortNum = (c) => parseInt(String(c).match(/\d+/)?.[0], 10) || 9999;

export async function buildRosterXlsx(rows, ev, now = new Date()) {
  const wb = new ExcelJS.Workbook();
  const sheetName = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}確定`;
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: 'portrait', scale: 90, margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: true, zoomScale: 100 }],
    properties: { defaultRowHeight: 13.5 },
  });
  [30.28, 6.37, 6.37, 6.37, 31.75, 19.98, 1.96, 8.82, 10.29, 10.29, 10.29, 10.29, 8.82].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const set = (addr, value, o = {}) => {
    const c = ws.getCell(addr);
    if (value !== undefined) c.value = value;
    c.font = { name: FONT, size: o.size || 11, bold: !!o.bold, ...(o.color ? { color: { argb: o.color } } : {}) };
    c.alignment = { horizontal: o.h, vertical: 'center', wrapText: !!o.wrap };
    if (o.fill) c.fill = solid(o.fill);
    if (o.border) c.border = o.border;
    if (o.fmt) c.numFmt = o.fmt;
    return c;
  };

  // título
  const year = (ev.date || '').slice(0, 4) || String(now.getFullYear());
  ws.mergeCells('A1:F1');
  set('A1', `${year}年OBOG会名簿`, { size: 14, bold: true, h: 'center' });
  ws.getRow(1).height = 21.6;

  // bloques por promoción (los administradores sin promoción no son OBOG)
  const people = rows.filter((r) => r.cohort || r.role !== 'admin');
  const groups = new Map();
  for (const p of people) (groups.get(p.cohort || '—') || groups.set(p.cohort || '—', []).get(p.cohort || '—')).push(p);
  const cohorts = [...groups.keys()].sort((a, b) => cohortNum(a) - cohortNum(b) || a.localeCompare(b));

  let r = 3;
  const personRows = [];
  for (const cohort of cohorts) {
    const list = groups.get(cohort).sort((a, b) => (b.role === 'manager') - (a.role === 'manager') || a.name.localeCompare(b.name, 'ja'));
    set(`A${r}`, cohort, { bold: true, color: 'FFFF0000', fill: 'FF0070C0', border: box() });
    ['立食', '二', '計', '同伴者', '備考'].forEach((t, i) => set(`${'BCDEF'[i]}${r}`, t, { h: 'center', fill: 'FFFFFF99', border: box() }));
    ws.getRow(r).height = 17.15;
    r++;
    list.forEach((p, i) => {
      const yes = p.answer === 'yes';
      const first = i === 0 && p.role === 'manager';
      const bottom = i === list.length - 1 ? thin : hair;
      const b = { left: thin, right: thin, top: thin, bottom };
      set(`A${r}`, p.name, { border: b, ...(first ? { fill: 'FFFFFF00' } : {}) });
      set(`B${r}`, yes ? '○' : p.answer === 'no' ? '×' : null, { h: 'center', border: b });
      set(`C${r}`, yes && p.nijikai ? '○' : null, { h: 'center', border: b });
      set(`D${r}`, { formula: `SUM(B${r}:C${r})`, result: 0 }, { h: 'center', border: b });
      set(`E${r}`, yes && p.companions ? `同伴者 ${p.companions}名` : null, { border: b });
      const kids = yes && p.kids ? `子${p.kids}` : '';
      set(`F${r}`, [kids, p.note].filter(Boolean).join(' ') || null, { size: 8, border: b });
      ws.getRow(r).height = 17.15;
      personRows.push({ r, p });
      r++;
    });
    r++; // fila en blanco entre promociones
  }
  const last = Math.max(r - 2, 3);

  // total final
  const tot = r;
  set(`A${tot}`, 'OBOG計', { border: box() });
  set(`B${tot}`, { formula: `COUNTIF(B3:B${last},"○")`, result: 0 }, { h: 'center', border: box() });
  ws.getRow(tot).height = 17.15;

  // cifras para valores en caché y panel
  const yesRows = personRows.filter((x) => x.p.answer === 'yes');
  const nYes = yesRows.length;
  const nNij = yesRows.filter((x) => x.p.nijikai).length;
  const nComp = yesRows.reduce((s, x) => s + x.p.companions, 0);
  const nKids = yesRows.reduce((s, x) => s + x.p.kids, 0);
  const f = ev.fees;
  const rng = (col) => `${col}3:${col}${last}`;

  // panel de totales (I8:L13)
  ws.mergeCells('I8:J8'); ws.mergeCells('K8:L8'); ws.mergeCells('I9:J9'); ws.mergeCells('K9:L9'); ws.mergeCells('I10:J10'); ws.mergeCells('K10:L10');
  set('I8', '交流会', { h: 'center' }); set('K8', '二次会', { h: 'center' });
  set('I9', { formula: `COUNTIF(${rng('B')},"○")`, result: nYes }, { h: 'right' });
  set('K9', { formula: `COUNTIF(${rng('C')},"○")`, result: nNij }, { h: 'right' });
  set('I10', { formula: 'SUM(I9:J9)', result: nYes }, { h: 'right' });
  set('K10', { formula: 'SUM(K9,)', result: nNij }, { h: 'right' });
  set('H11', '計', { h: 'right' });
  set('I11', f.tachin, { size: 9, wrap: true }); set('J11', undefined, { size: 9, wrap: true });
  set('I12', f.companion, { size: 9, wrap: true });
  set('I13', '子ども（人数外）', { size: 10, h: 'center' });
  set('J13', nKids, { size: 10, h: 'right' });
  set('M11', '先生含む');
  // bordes del panel
  const B = (a, v) => Object.assign(ws.getCell(a), { border: v });
  B('I8', { left: medium, right: thin, top: medium, bottom: thin }); B('J8', { right: thin, top: medium, bottom: thin });
  B('K8', { left: thin, right: medium, top: medium, bottom: thin }); B('L8', { right: medium, top: medium, bottom: thin });
  B('I9', { left: medium, right: thin, top: thin, bottom: thin }); B('J9', { right: thin, top: thin, bottom: thin });
  B('K9', { left: thin, right: medium }); B('L9', { right: medium });
  B('I10', { left: thick, right: medium, top: medium, bottom: thick }); B('J10', { right: medium, top: medium, bottom: thick });
  B('K10', { left: medium, right: medium, bottom: medium }); B('L10', { right: medium, bottom: medium });
  B('I11', { left: medium, right: medium, top: thick }); B('J11', { left: medium, right: medium, top: thick });
  B('I12', { left: medium, right: medium, top: dash }); B('J12', { left: medium, right: medium, top: dash });
  B('I13', { left: medium, right: medium, top: dash, bottom: medium }); B('J13', { left: medium, right: medium, top: dash, bottom: medium });
  B('H11', { right: thin });

  // tabla de cuotas (I18:L22)
  set('J18', '人数', { border: box() }); set('K18', '会費', { border: box() }); set('L18', '合計', { bold: true, border: box() });
  set('I19', '交流パーティー費用', { size: 8, bold: true, h: 'center', wrap: true, border: box() });
  set('J19', nYes, { border: box() }); set('K19', f.tachin, { fmt: '#,##0', border: box() });
  set('L19', { formula: 'SUM(J19*K19)', result: nYes * f.tachin }, { fmt: '#,##0', border: box() });
  set('I20', undefined, { border: box() });
  set('J20', nComp, { border: box() }); set('K20', f.companion, { fmt: '#,##0', border: box() });
  set('L20', { formula: 'SUM(J20*K20)', result: nComp * f.companion }, { fmt: '#,##0', border: box() });
  ws.mergeCells('I19:I20');
  set('I21', '交流合計', { size: 8, bold: true, h: 'center', wrap: true, border: box() });
  set('L21', { formula: 'SUM(L19:L20)', result: nYes * f.tachin + nComp * f.companion }, { fmt: '#,##0', border: box() });
  set('I22', '二次会', { h: 'center', border: box() });
  set('J22', nNij, { border: box() }); set('K22', f.nijikai, { fmt: '#,##0', border: box() });
  set('L22', { formula: 'SUM(J22*K22)', result: nNij * f.nijikai }, { fmt: '#,##0', border: box() });

  // ingresos (I24:L30)
  ['収入', '金額', '人数', null].forEach((t, i) => set(`${'IJKL'[i]}24`, t, { h: i < 2 ? 'center' : undefined, border: box() }));
  const inc = [
    ['OBOG(単独）', f.tachin, nYes, 10],
    ['夫婦参加', f.companion, nComp, 11],
    ['先生', null, null, 11],
    ['４年生', null, null, 11],
    ['３年生', null, null, 11],
  ];
  inc.forEach(([label, amount, n, size], i) => {
    const rr = 25 + i;
    set(`I${rr}`, label, { size, h: 'right', border: box() });
    set(`J${rr}`, amount, { border: box() });
    set(`K${rr}`, n, { border: box() });
    set(`L${rr}`, { formula: `J${rr}*K${rr}`, result: (amount || 0) * (n || 0) }, { border: box() });
  });
  set('I30', '収入合計', { h: 'right', fill: 'FFFFFFFF', border: box() });
  set('J30', undefined, { border: box() });
  set('K30', { formula: 'SUM(K25:K29)', result: nYes + nComp }, { bold: true, border: box() });
  set('L30', { formula: 'SUM(L25:L29)', result: nYes * f.tachin + nComp * f.companion }, { bold: true, border: box() });

  ws.pageSetup.printArea = `A1:F${tot}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
