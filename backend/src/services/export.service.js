'use strict';
 
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, PageBreak, WidthType,
  BorderStyle, ShadingType, Header, Footer, PageNumber,
  NumberFormat, convertInchesToTwip, UnderlineType,
  TabStopType, TabStopPosition,
} = require('docx');
const { prisma } = require('../config/db');
const { v4: uuid } = require('uuid');
 
// ── Template constants (matching the illustrative FS template exactly) ─────────
const FONT        = 'Calibri';
const SZ_NORMAL   = 20; // 10pt
const SZ_SMALL    = 18; // 9pt
const SZ_TITLE    = 28; // 14pt
const SZ_HEADING  = 22; // 11pt
const COL_NOTE_BLUE = '4472C4'; // note number colour (blue like in template)
const COL_SECTION = '1e293b';   // section header colour (dark)
const COL_GREY    = '64748b';   // grey text
 
// ── Column widths (DXA) — exactly matching template ──────────────────────────
// Total A4 content width with 1" margins = 9026 DXA
// Template BS: Particulars | Notes | gap | CY Amount | gap | PY Amount
const COL_PART  = 4700; // Particulars
const COL_NOTE  = 720;  // Note number
const COL_GAP   = 250;  // spacer
const COL_AMT1  = 1500; // Current Year
const COL_GAPB  = 106;  // spacer
const COL_AMT2  = 1550; // Prior Year (or comparative)
const TOTAL_W   = COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2; // 8826
 
// ── Number formatter ──────────────────────────────────────────────────────────
function fmtNum(n, divisor = 1, hideZero = false) {
  const num = Number(n || 0) / divisor;
  if (hideZero && Math.abs(num) < 0.005) return '-';
  if (Math.abs(num) < 0.005) return '-';
  const abs = Math.abs(num);
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return num < 0 ? `(${s})` : s;
}
 
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}
 
// ── No border (invisible cell border) ────────────────────────────────────────
const NO_BORDER = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
 
// ── Cell border helpers ───────────────────────────────────────────────────────
const SINGLE = { style: BorderStyle.SINGLE, size: 4, color: 'auto' };
const DOUBLE = { style: BorderStyle.DOUBLE, size: 4, color: 'auto' };
 
function cellBorders(opts = {}) {
  return {
    top:    opts.top    ? SINGLE : NO_BORDER,
    bottom: opts.bottom ? (opts.double ? DOUBLE : SINGLE) : NO_BORDER,
    left:   NO_BORDER,
    right:  NO_BORDER,
  };
}
 
// ── Text run helper ───────────────────────────────────────────────────────────
function run(text, opts = {}) {
  return new TextRun({
    text: String(text || ''),
    font: FONT,
    size: opts.size || SZ_NORMAL,
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || undefined,
  });
}
 
// ── Paragraph helper ─────────────────────────────────────────────────────────
function para(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 0 },
    indent: opts.indent ? { left: opts.indent } : undefined,
  });
}
 
// ── Cell helper ───────────────────────────────────────────────────────────────
function cell(children, width, opts = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: { size: width, type: WidthType.DXA },
    borders: opts.borders || NO_BORDERS,
    verticalAlign: opts.vAlign || undefined,
    columnSpan: opts.span || undefined,
    shading: opts.shading || undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}
 
// ── Page break ────────────────────────────────────────────────────────────────
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } });
}
 
// ── Section title (e.g. "Statement of Financial Position") ───────────────────
function sectionTitle(text) {
  return new Paragraph({
    children: [run(text, { bold: true, size: SZ_TITLE, color: COL_SECTION })],
    spacing: { before: 160, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COL_SECTION, space: 4 } },
  });
}
 
// ── Sub-section label (e.g. "Non-current assets") ────────────────────────────
function sectionLabel(text) {
  return new Paragraph({
    children: [run(text, { bold: true, size: SZ_NORMAL })],
    spacing: { before: 80, after: 40 },
  });
}
 
// ── Standard FS table row ─────────────────────────────────────────────────────
// label | note# | gap | CY amt | gap | PY amt
function fsRow(label, noteNum, amtCY, amtPY, opts = {}) {
  // opts: bold, indent, subheader, subtotal, total, hideIfZero
  if (opts.hideIfZero && Math.abs(Number(amtCY || 0)) < 0.005 && Math.abs(Number(amtPY || 0)) < 0.005) return null;
 
  const isSubheader = opts.subheader;
  const isSubtotal  = opts.subtotal;
  const isTotal     = opts.total;
  const isBold      = opts.bold || isSubtotal || isTotal || isSubheader;
 
  // Amount border style
  const amtBorder = isTotal
    ? { top: SINGLE, bottom: DOUBLE, left: NO_BORDER, right: NO_BORDER }
    : isSubtotal
    ? { top: NO_BORDER, bottom: SINGLE, left: NO_BORDER, right: NO_BORDER }
    : NO_BORDERS;
 
  const labelText = isSubheader
    ? run(label, { bold: true, size: SZ_NORMAL, color: COL_SECTION })
    : run((opts.indent ? '    ' : '') + label, { bold: isBold, size: SZ_NORMAL });
 
  const noteText = noteNum
    ? run(String(noteNum), { size: SZ_SMALL, color: COL_NOTE_BLUE })
    : run('');
 
  const cy = (amtCY !== null && amtCY !== undefined) ? fmtNum(amtCY) : '';
  const py = (amtPY !== null && amtPY !== undefined) ? fmtNum(amtPY) : '';
 
  return new TableRow({
    children: [
      cell(para(labelText), COL_PART),
      cell(para(noteText, { alignment: AlignmentType.CENTER }), COL_NOTE),
      cell(para(run('')), COL_GAP),
      cell(para(run(cy, { bold: isBold, size: SZ_NORMAL }), { alignment: AlignmentType.RIGHT }),
        COL_AMT1, { borders: amtBorder }),
      cell(para(run('')), COL_GAPB),
      cell(para(run(py, { bold: isBold, size: SZ_NORMAL }), { alignment: AlignmentType.RIGHT }),
        COL_AMT2, { borders: amtBorder }),
    ],
  });
}
 
// ── FS Table wrapper ──────────────────────────────────────────────────────────
function fsTable(rows) {
  const validRows = rows.filter(Boolean);
  if (!validRows.length) return null;
  return new Table({
    width: { size: TOTAL_W, type: WidthType.DXA },
    columnWidths: [COL_PART, COL_NOTE, COL_GAP, COL_AMT1, COL_GAPB, COL_AMT2],
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideH: NO_BORDER, insideV: NO_BORDER },
    rows: validRows,
  });
}
 
// ── Table header row (year columns) ──────────────────────────────────────────
function tableHeaderRow(cy, py, currency) {
  return [
    new TableRow({
      children: [
        cell(para(run('')), COL_PART),
        cell(para(run('')), COL_NOTE),
        cell(para(run('')), COL_GAP),
        cell(para(run(cy,  { bold: true }), { alignment: AlignmentType.RIGHT }), COL_AMT1),
        cell(para(run('')), COL_GAPB),
        cell(para(run(py,  { bold: true }), { alignment: AlignmentType.RIGHT }), COL_AMT2),
      ],
    }),
    new TableRow({
      children: [
        cell(para(run('', { bold: true, size: SZ_SMALL })), COL_PART),
        cell(para(run('Notes', { bold: true, size: SZ_SMALL, color: COL_NOTE_BLUE }), { alignment: AlignmentType.CENTER }), COL_NOTE),
        cell(para(run('')), COL_GAP),
        cell(para(run(currency, { bold: true, size: SZ_SMALL }), { alignment: AlignmentType.RIGHT }), COL_AMT1,
          { borders: { top: NO_BORDER, bottom: SINGLE, left: NO_BORDER, right: NO_BORDER } }),
        cell(para(run('')), COL_GAPB),
        cell(para(run(currency, { bold: true, size: SZ_SMALL }), { alignment: AlignmentType.RIGHT }), COL_AMT2,
          { borders: { top: NO_BORDER, bottom: SINGLE, left: NO_BORDER, right: NO_BORDER } }),
      ],
    }),
  ];
}
 
// ── Helper: look up amount from fsLines ──────────────────────────────────────
function amt(lines, ...keywords) {
  const kw = keywords.map(k => k.toLowerCase());
  const match = lines.find(l => kw.some(k => (l.groupName || '').toLowerCase().includes(k)));
  return match ? Number(match.totalFinalNet || 0) : null;
}
function note(lines, ...keywords) {
  const kw = keywords.map(k => k.toLowerCase());
  const match = lines.find(l => kw.some(k => (l.groupName || '').toLowerCase().includes(k)));
  return match?.noteGroup?.noteNumber || null;
}
function sumAmt(lines, ...keywords) {
  const kw = keywords.map(k => k.toLowerCase());
  return lines
    .filter(l => kw.some(k => (l.groupName || '').toLowerCase().includes(k)))
    .reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
}
 
// ── Build BS ──────────────────────────────────────────────────────────────────
function buildBS(lines, engagement, currency, fyLabel) {
  const isIFRS = ['IFRS', 'IFRS_SME'].includes(engagement.method);
  const title  = isIFRS ? 'Statement of Financial Position' : 'Balance Sheet';
  const cyYear = fyLabel.split('-')[1] ? '20' + fyLabel.split('-')[1] : fyLabel;
  const pyYear = String(Number(cyYear) - 1);
 
  // Group all lines by category
  const bsLines = lines.filter(l => l.sheet === 'BS');
 
  // Build rows dynamically from actual mapped data
  const rows = [
    ...tableHeaderRow(cyYear, pyYear, currency),
  ];
 
  // ASSETS section
  rows.push(new TableRow({ children: [
    cell(para(run('ASSETS', { bold: true, size: SZ_NORMAL, color: COL_SECTION })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2, { span: 6 }),
  ]}));
 
  // Non-current assets
  const ncaLines = bsLines.filter(l => ['ppe','plant','equipment','intangible','goodwill','investment','deferred tax asset','right of use','biological','non-current'].some(k => l.groupName.toLowerCase().includes(k)));
  if (ncaLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Non-current assets', { bold: true })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    ncaLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const ncaTotal = ncaLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total non-current assets', null, ncaTotal, null, { subtotal: true }));
  }
 
  // Current assets
  const caLines = bsLines.filter(l => ['inventory','inventories','receivable','cash','bank','prepaid','current','trade receivable','advance','tax asset'].some(k => l.groupName.toLowerCase().includes(k)) && !l.groupName.toLowerCase().includes('non-current'));
  if (caLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Current assets', { bold: true })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    caLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const caTotal = caLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total current assets', null, caTotal, null, { subtotal: true }));
  }
 
  const allAssets = bsLines.filter(l => ['Assets','asset'].some(k => (l.assetLiability || '').includes(k)));
  const totalAssets = allAssets.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
  rows.push(fsRow('TOTAL ASSETS', null, totalAssets, null, { total: true }));
 
  // EQUITY AND LIABILITIES
  rows.push(new TableRow({ children: [
    cell(para(run('EQUITY AND LIABILITIES', { bold: true, color: COL_SECTION })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2),
  ]}));
 
  const eqLines = bsLines.filter(l => l.assetLiability === 'Equity');
  if (eqLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Equity', { bold: true })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    eqLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const eqTotal = eqLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total equity', null, eqTotal, null, { subtotal: true }));
  }
 
  const nclLines = bsLines.filter(l => l.assetLiability === 'Liabilities' && ['long term','non-current','deferred tax liab','lease'].some(k => l.groupName.toLowerCase().includes(k)));
  if (nclLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Non-current liabilities', { bold: true })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    nclLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const nclTotal = nclLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total non-current liabilities', null, nclTotal, null, { subtotal: true }));
  }
 
  const clLines = bsLines.filter(l => l.assetLiability === 'Liabilities' && !['long term','non-current','deferred tax liab','lease'].some(k => l.groupName.toLowerCase().includes(k)));
  if (clLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Current liabilities', { bold: true })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    clLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const clTotal = clLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total current liabilities', null, clTotal, null, { subtotal: true }));
  }
 
  const allLiabEq = bsLines.filter(l => l.assetLiability === 'Liabilities' || l.assetLiability === 'Equity');
  const totalEqLiab = allLiabEq.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
  rows.push(fsRow('TOTAL EQUITY AND LIABILITIES', null, totalEqLiab, null, { total: true }));
 
  return [
    sectionTitle(title),
    new Paragraph({ children: [run(`As at ${isIFRS ? '31 December' : '31 March'} ${cyYear}`, { size: SZ_SMALL, color: COL_GREY, italics: true })], spacing: { before: 60, after: 120 } }),
    new Paragraph({ children: [run(`All amounts in ${currency} unless otherwise stated`, { size: SZ_SMALL, color: COL_GREY, italics: true })], spacing: { before: 0, after: 120 } }),
    fsTable(rows),
    pageBreak(),
  ];
}
 
// ── Build P&L ─────────────────────────────────────────────────────────────────
function buildPL(lines, engagement, currency, fyLabel) {
  const isIFRS = ['IFRS', 'IFRS_SME'].includes(engagement.method);
  const title  = isIFRS ? 'Statement of Profit or Loss' : 'Statement of Profit and Loss';
  const cyYear = fyLabel.split('-')[1] ? '20' + fyLabel.split('-')[1] : fyLabel;
  const pyYear = String(Number(cyYear) - 1);
  const plLines = lines.filter(l => l.sheet === 'PL');
 
  const rows = [...tableHeaderRow(`Year ended\n${cyYear}`, `Year ended\n${pyYear}`, currency)];
 
  const incomeLines = plLines.filter(l => l.assetLiability === 'Income');
  const expenseLines = plLines.filter(l => l.assetLiability === 'Expenses');
 
  if (incomeLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Revenue and other income', { bold: true, color: COL_SECTION })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    incomeLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const incTotal = incomeLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total revenue', null, incTotal, null, { subtotal: true }));
  }
 
  if (expenseLines.length) {
    rows.push(new TableRow({ children: [cell(para(run('Expenses', { bold: true, color: COL_SECTION })), COL_PART + COL_NOTE + COL_GAP + COL_AMT1 + COL_GAPB + COL_AMT2)] }));
    expenseLines.forEach(l => {
      const r = fsRow(l.groupName, l.noteGroup?.noteNumber, Number(l.totalFinalNet), null, { hideIfZero: true });
      if (r) rows.push(r);
    });
    const expTotal = expenseLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    rows.push(fsRow('Total expenses', null, expTotal, null, { subtotal: true }));
  }
 
  const incTotal = incomeLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
  const expTotal = expenseLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
  rows.push(fsRow('Profit / (Loss) for the year', null, incTotal - expTotal, null, { total: true }));
 
  return [
    sectionTitle(title),
    new Paragraph({ children: [run(`For the year ended ${isIFRS ? '31 December' : '31 March'} ${cyYear}`, { size: SZ_SMALL, color: COL_GREY, italics: true })], spacing: { before: 60, after: 120 } }),
    new Paragraph({ children: [run(`All amounts in ${currency} unless otherwise stated`, { size: SZ_SMALL, color: COL_GREY, italics: true })], spacing: { before: 0, after: 120 } }),
    fsTable(rows),
    pageBreak(),
  ];
}
 
// ── Build Notes ───────────────────────────────────────────────────────────────
function buildNotes(noteGroups, currency) {
  const sections = [
    sectionTitle('Notes to the Financial Statements'),
    new Paragraph({ children: [run(`All amounts in ${currency} unless otherwise stated`, { size: SZ_SMALL, color: COL_GREY, italics: true })], spacing: { before: 60, after: 160 } }),
  ];
 
  for (const note of noteGroups) {
    if (Math.abs(Number(note.total)) < 0.005) continue;
 
    // Note heading
    sections.push(new Paragraph({
      children: [
        run(`${note.noteNumber}. `, { bold: true, size: SZ_HEADING, color: COL_NOTE_BLUE }),
        run(note.title, { bold: true, size: SZ_HEADING, color: COL_SECTION }),
      ],
      spacing: { before: 200, after: 80 },
    }));
 
    // Note table: Particulars | CY | PY
    const noteColPart = 5500;
    const noteColAmt  = 1663;
    const noteTotalW  = noteColPart + noteColAmt + noteColAmt;
 
    const noteRows = [
      // Header row
      new TableRow({ children: [
        cell(para(run('Particulars', { bold: true, size: SZ_SMALL })), noteColPart),
        cell(para(run(currency, { bold: true, size: SZ_SMALL }), { alignment: AlignmentType.RIGHT }), noteColAmt,
          { borders: { top: NO_BORDER, bottom: SINGLE, left: NO_BORDER, right: NO_BORDER } }),
        cell(para(run(''), { alignment: AlignmentType.RIGHT }), noteColAmt),
      ]}),
    ];
 
    // Only subGroupName + subtotal (no ledger detail in export)
    const visibleSGs = (note.subGroups || []).filter(sg => Math.abs(Number(sg.subtotal)) >= 0.005);
    for (const sg of visibleSGs) {
      noteRows.push(new TableRow({ children: [
        cell(para(run(sg.subGroupName, { size: SZ_NORMAL })), noteColPart),
        cell(para(run(fmtNum(sg.subtotal), { size: SZ_NORMAL }), { alignment: AlignmentType.RIGHT }), noteColAmt),
        cell(para(run(''), { alignment: AlignmentType.RIGHT }), noteColAmt),
      ]}));
    }
 
    // Total row
    noteRows.push(new TableRow({ children: [
      cell(para(run(`Total — ${note.title}`, { bold: true, size: SZ_NORMAL })), noteColPart),
      cell(para(run(fmtNum(note.total), { bold: true, size: SZ_NORMAL }), { alignment: AlignmentType.RIGHT }), noteColAmt,
        { borders: { top: SINGLE, bottom: DOUBLE, left: NO_BORDER, right: NO_BORDER } }),
      cell(para(run(''), { alignment: AlignmentType.RIGHT }), noteColAmt),
    ]}));
 
    sections.push(new Table({
      width: { size: noteTotalW, type: WidthType.DXA },
      columnWidths: [noteColPart, noteColAmt, noteColAmt],
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideH: NO_BORDER, insideV: NO_BORDER },
      rows: noteRows,
    }));
    sections.push(new Paragraph({ text: '', spacing: { after: 120 } }));
  }
 
  return sections;
}
 
// ── Collapse note details into subgroups ──────────────────────────────────────
function collapseNotes(noteDetails) {
  const groups = new Map();
  for (const d of noteDetails) {
    const key = d.subGroupName || 'Other';
    if (!groups.has(key)) groups.set(key, { subGroupName: key, rows: [], subtotal: 0 });
    groups.get(key).rows.push(d);
    groups.get(key).subtotal += Number(d.finalNet || 0);
  }
  return Array.from(groups.values());
}
 
// ── Header builder ────────────────────────────────────────────────────────────
function buildHeader(engagement, firmName) {
  const clientName = engagement.client?.name || '';
  const method     = engagement.method || 'IFRS';
  const fyLabel    = engagement.financialYear || '';
  const isIFRS     = ['IFRS', 'IFRS_SME'].includes(method);
  const cyYear     = fyLabel.split('-')[1] ? '20' + fyLabel.split('-')[1] : fyLabel;
  const closingDate = isIFRS ? `31 December ${cyYear}` : `31 March ${cyYear}`;
 
  return new Header({
    children: [
      new Paragraph({
        children: [run(clientName.toUpperCase(), { bold: true, size: SZ_HEADING, color: COL_SECTION })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COL_SECTION, space: 4 } },
        spacing: { before: 0, after: 60 },
      }),
      new Paragraph({
        children: [run(`Financial statements for the year ended ${closingDate}`, { size: SZ_SMALL, color: COL_GREY, italics: true })],
        spacing: { before: 40, after: 0 },
      }),
    ],
  });
}
 
// ── Footer builder ────────────────────────────────────────────────────────────
function buildFooter(firmName) {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          run(firmName || 'FinStatement', { size: SZ_SMALL, color: COL_GREY }),
          new TextRun({ text: '\t', size: SZ_SMALL }),
          run('Page ', { size: SZ_SMALL, color: COL_GREY }),
          new PageNumber({ size: SZ_SMALL, color: COL_GREY }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TOTAL_W }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'cbd5e1', space: 4 } },
        spacing: { before: 60, after: 0 },
      }),
    ],
  });
}
 
// ── MAIN EXPORT FUNCTION ──────────────────────────────────────────────────────
async function exportWord(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.cin, c.pan, c.gstin,
            c."tradeLicense", c."vatNumber", c.region as "clientRegion",
            f.name as "firmName"
     FROM "Engagement" e
     JOIN "Client" c ON c.id = e."clientId"
     JOIN "Firm" f ON f.id = c."firmId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
  const engRow = engRows[0];
  const engagement = {
    ...engRow,
    client: { name: engRow.clientName, cin: engRow.cin, pan: engRow.pan,
              gstin: engRow.gstin, tradeLicense: engRow.tradeLicense,
              vatNumber: engRow.vatNumber, region: engRow.clientRegion },
  };
 
  const method   = engagement.method || 'IFRS';
  const isIFRS   = ['IFRS', 'IFRS_SME'].includes(method);
  const currency = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED' : '₹';
  const fyLabel  = engagement.financialYear || '';
 
  const [rawFsLines, noteGroups] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({
      where: { engagementId },
      orderBy: { noteNumber: 'asc' },
      include: { noteDetails: { orderBy: { displayOrder: 'asc' } } },
    }),
  ]);
 
  // Join FSLines with NoteGroups
  const ngMap = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const fsLines = rawFsLines.map(l => ({
    ...l,
    noteGroup: l.noteGroupId ? ngMap.get(l.noteGroupId) || null : null,
  }));
 
  // Structure notes
  const structuredNotes = noteGroups
    .filter(ng => !ng.noteGroupId?.startsWith('__'))
    .map(ng => ({
      noteNumber: ng.noteNumber,
      title: ng.title,
      total: ng.noteDetails.reduce((s, d) => s + Number(d.finalNet || 0), 0),
      subGroups: collapseNotes(ng.noteDetails),
    }));
 
  // Build all sections
  const children = [
    // Cover page
    new Paragraph({ children: [run(engRow.clientName || '', { bold: true, size: 48, color: COL_SECTION })], alignment: AlignmentType.CENTER, spacing: { before: 2000, after: 200 } }),
    new Paragraph({ children: [run('Financial Statements', { bold: true, size: 36, color: COL_GREY })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 } }),
    new Paragraph({ children: [run(`For the year ended ${isIFRS ? '31 December' : '31 March'} ${fyLabel.split('-')[1] ? '20' + fyLabel.split('-')[1] : fyLabel}`, { size: SZ_HEADING, color: COL_GREY })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 } }),
    new Paragraph({ children: [run(method, { size: SZ_NORMAL, color: COL_NOTE_BLUE })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 } }),
    pageBreak(),
 
    // Balance Sheet
    ...buildBS(fsLines, engagement, currency, fyLabel),
 
    // P&L
    ...buildPL(fsLines, engagement, currency, fyLabel),
 
    // Notes
    ...buildNotes(structuredNotes, currency),
  ];
 
  const header = buildHeader(engagement, engRow.firmName);
  const footer = buildFooter(engRow.firmName);
 
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: SZ_NORMAL } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1152, bottom: 1008, left: 1440, header: 720, footer: 432 },
        },
      },
      headers:  { default: header },
      footers:  { default: footer },
      children,
    }],
  });
 
  return Packer.toBuffer(doc);
}
 
// ── Excel export (unchanged) ──────────────────────────────────────────────────
async function exportExcel(engagementId, firmId) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinStatement';
 
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.region as "clientRegion"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const eng = engRows[0];
  const method   = eng.method || 'AS';
  const currency = ['IFRS','IFRS_SME'].includes(method) ? 'AED' : 'INR';
 
  const [rawFsLines, noteGroups] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId }, orderBy: { noteNumber: 'asc' }, include: { noteDetails: { orderBy: { displayOrder: 'asc' } } } }),
  ]);
  const ngMap2 = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const fsLines2 = rawFsLines.map(l => ({ ...l, noteGroup: l.noteGroupId ? ngMap2.get(l.noteGroupId) : null }));
 
  function addSheet(name, lines, title) {
    const ws = wb.addWorksheet(name);
    ws.columns = [
      { header: 'Particulars', key: 'label', width: 45 },
      { header: 'Note', key: 'note', width: 8 },
      { header: `Amount (${currency})`, key: 'amount', width: 18 },
    ];
    ws.getRow(1).font = { bold: true, size: 11 };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
 
    let rowIdx = 2;
    for (const l of lines) {
      const v = Number(l.totalFinalNet || 0);
      if (Math.abs(v) < 0.005) continue;
      const row = ws.addRow({ label: l.groupName, note: l.noteGroup?.noteNumber || '', amount: v });
      row.getCell('amount').numFmt = '#,##0;(#,##0);"-"';
      row.getCell('amount').alignment = { horizontal: 'right' };
      rowIdx++;
    }
    return ws;
  }
 
  addSheet('Balance Sheet', fsLines2.filter(l => l.sheet === 'BS'), 'Balance Sheet');
  addSheet('Profit & Loss', fsLines2.filter(l => l.sheet === 'PL'), 'P&L');
 
  // Notes sheet
  const wsN = wb.addWorksheet('Notes');
  wsN.columns = [
    { key: 'note', width: 8 },
    { key: 'title', width: 35 },
    { key: 'subgroup', width: 30 },
    { key: 'amount', width: 18 },
  ];
  let nr = 1;
  for (const ng of noteGroups) {
    const total = ng.noteDetails.reduce((s, d) => s + Number(d.finalNet || 0), 0);
    if (Math.abs(total) < 0.005) continue;
    const hRow = wsN.addRow([ng.noteNumber, ng.title, '', '']);
    hRow.font = { bold: true }; hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    nr++;
 
    const sgs = collapseNotes(ng.noteDetails);
    for (const sg of sgs) {
      if (Math.abs(sg.subtotal) < 0.005) continue;
      const sgRow = wsN.addRow(['', '', sg.subGroupName, sg.subtotal]);
      sgRow.getCell(4).numFmt = '#,##0;(#,##0);"-"';
      sgRow.getCell(4).alignment = { horizontal: 'right' };
      nr++;
    }
    const totRow = wsN.addRow(['', `Total — ${ng.title}`, '', total]);
    totRow.font = { bold: true };
    totRow.getCell(4).numFmt = '#,##0;(#,##0);"-"';
    totRow.getCell(4).alignment = { horizontal: 'right' };
    totRow.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    nr++;
    wsN.addRow([]);
  }
 
  return wb.xlsx.writeBuffer();
}
 
// ── PDF data ──────────────────────────────────────────────────────────────────
async function exportPdfData(engagementId, firmId) {
  const [fsLines, noteGroups] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId }, orderBy: { noteNumber: 'asc' }, include: { noteDetails: true } }),
  ]);
  return { fsLines, noteGroups };
}
 
module.exports = { exportWord, exportExcel, exportPdfData };