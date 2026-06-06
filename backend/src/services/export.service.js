// src/services/export.service.js
// ─────────────────────────────────────────────────────────────────────────────
// MNC-level fixes:
//   1. Number locale: en-IN for India (1,00,000), en-US for UAE (1,000,000)
//   2. isPriorYear: false on all FSLine queries — no double-counting
//   3. htmlToParagraphs: handles <strong>, <em>, <ul>, <ol>, <table> tags
//   4. Word export: comparative column (CY + PY side by side)
//   5. Excel export: comparative column on BS and P&L sheets
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, PageBreak, WidthType,
  BorderStyle, ShadingType, Header, Footer, PageNumber,
  NumberFormat, convertInchesToTwip, UnderlineType,
} = require('docx');
const { prisma } = require('../config/db');

// ── Locale-aware number formatter ─────────────────────────────────────────────
function fmtNum(n, divisor = 1, locale = 'en-IN') {
  const num = Number(n || 0) / divisor;
  const abs = Math.abs(num);
  const s   = abs.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `(${s})` : s;
}

function getLocale(method, clientRegion) {
  const isUAE = method === 'IFRS' || method === 'IFRS_SME' ||
    clientRegion === 'UAE' || clientRegion === 'AE';
  return isUAE ? 'en-US' : 'en-IN';
}

// ── HTML → docx paragraphs (full tag support) ─────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .trim();
}

function inlineRuns(html) {
  // Parse inline formatting into TextRun array
  const runs = [];
  // Replace inline tags with markers
  const processed = html
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, '§BOLD§$1§/BOLD§')
    .replace(/<b[^>]*>(.*?)<\/b>/gis,           '§BOLD§$1§/BOLD§')
    .replace(/<em[^>]*>(.*?)<\/em>/gis,         '§ITALIC§$1§/ITALIC§')
    .replace(/<i[^>]*>(.*?)<\/i>/gis,           '§ITALIC§$1§/ITALIC§')
    .replace(/<u[^>]*>(.*?)<\/u>/gis,           '§UNDER§$1§/UNDER§')
    .replace(/<[^>]+>/g, ''); // strip remaining tags

  const parts = processed.split(/(§(?:BOLD|ITALIC|UNDER)§.*?§\/(?:BOLD|ITALIC|UNDER)§)/gs);
  for (const part of parts) {
    if (!part) continue;
    const boldMatch   = part.match(/^§BOLD§(.*?)§\/BOLD§$/s);
    const italicMatch = part.match(/^§ITALIC§(.*?)§\/ITALIC§$/s);
    const underMatch  = part.match(/^§UNDER§(.*?)§\/UNDER§$/s);
    const text = stripHtml(boldMatch?.[1] || italicMatch?.[1] || underMatch?.[1] || part);
    if (!text) continue;
    runs.push(new TextRun({
      text,
      size:       22,
      bold:       !!boldMatch,
      italics:    !!italicMatch,
      underline:  underMatch ? { type: UnderlineType.SINGLE } : undefined,
    }));
  }
  return runs.length ? runs : [new TextRun({ text: stripHtml(html), size: 22 })];
}

function htmlToParagraphs(html) {
  if (!html) return [new Paragraph({ text: '' })];
  const paras = [];

  // Normalise line breaks
  const norm = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi,    '\n')
    .replace(/<\/p>/gi,      '\n')
    .replace(/<\/h[1-6]>/gi, '\n');

  // Extract block-level elements
  const blocks = norm
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, (_, c) => `\x00H1\x00${c}\x00END\x00`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, (_, c) => `\x00H2\x00${c}\x00END\x00`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, (_, c) => `\x00H3\x00${c}\x00END\x00`)
    .replace(/<li[^>]*>(.*?)<\/li>/gis, (_, c) => `\x00LI\x00${c}\x00END\x00`)
    .replace(/<p[^>]*>(.*?)<\/p>/gis,   (_, c) => `\x00P\x00${c}\x00END\x00`)
    // Tables: convert each row to a plain paragraph
    .replace(/<tr[^>]*>(.*?)<\/tr>/gis, (_, c) => `\x00P\x00${c}\x00END\x00`)
    .split('\x00END\x00');

  for (const block of blocks) {
    const h1Match = block.match(/\x00H1\x00(.*)/s);
    const h2Match = block.match(/\x00H2\x00(.*)/s);
    const h3Match = block.match(/\x00H3\x00(.*)/s);
    const liMatch = block.match(/\x00LI\x00(.*)/s);
    const pMatch  = block.match(/\x00P\x00(.*)/s);

    if (h1Match) {
      const text = stripHtml(h1Match[1]).trim();
      if (text) paras.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }));
    } else if (h2Match) {
      const text = stripHtml(h2Match[1]).trim();
      if (text) paras.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }));
    } else if (h3Match) {
      const text = stripHtml(h3Match[1]).trim();
      if (text) paras.push(new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { after: 80 } }));
    } else if (liMatch) {
      const runs = inlineRuns(liMatch[1]);
      if (runs.length) paras.push(new Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 60 } }));
    } else if (pMatch) {
      const runs = inlineRuns(pMatch[1]);
      if (runs.length) paras.push(new Paragraph({ children: runs, spacing: { after: 80 } }));
    } else {
      // Untagged text or leftover
      const lines = stripHtml(block).split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (t) paras.push(new Paragraph({ children: [new TextRun({ text: t, size: 22 })], spacing: { after: 80 } }));
      }
    }
  }

  return paras.length ? paras : [new Paragraph({ text: stripHtml(html) })];
}

// ── Section title ──────────────────────────────────────────────────────────────
function sectionTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: '1e293b' })],
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 200, after: 200 },
    border:   { bottom: { color: '6366f1', size: 6, space: 4, style: BorderStyle.SINGLE } },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── FS table row — now with optional PY column ────────────────────────────────
function fsRow(label, note, cyAmount, pyAmount, bold, indent, divisor, locale, hasPY) {
  const labelRun = new TextRun({ text: '  '.repeat(indent || 0) + label, bold: !!bold, size: 20 });
  const noteRun  = new TextRun({ text: note ? String(note) : '', size: 20, color: '6366f1' });
  const cyRun    = new TextRun({ text: cyAmount != null ? fmtNum(cyAmount, divisor, locale) : '', bold: !!bold, size: 20 });
  const pyRun    = new TextRun({ text: pyAmount != null ? fmtNum(pyAmount, divisor, locale) : '', size: 20, color: '64748b' });

  const cells = [
    new TableCell({ children: [new Paragraph({ children: [labelRun] })], width: { size: hasPY ? 50 : 65, type: WidthType.PERCENTAGE } }),
    new TableCell({ children: [new Paragraph({ children: [noteRun], alignment: AlignmentType.CENTER })], width: { size: 8, type: WidthType.PERCENTAGE } }),
    new TableCell({ children: [new Paragraph({ children: [cyRun], alignment: AlignmentType.RIGHT })], width: { size: hasPY ? 21 : 27, type: WidthType.PERCENTAGE } }),
  ];
  if (hasPY) {
    cells.push(new TableCell({ children: [new Paragraph({ children: [pyRun], alignment: AlignmentType.RIGHT })], width: { size: 21, type: WidthType.PERCENTAGE } }));
  }

  return new TableRow({ children: cells, tableHeader: !!bold });
}

// ── Table header row ──────────────────────────────────────────────────────────
function fsTableHeader(cyYear, pyYear, hasPY) {
  const shade = { type: ShadingType.SOLID, color: '1e293b', fill: '1e293b' };
  const hdr   = (txt) => new TextRun({ text: txt, bold: true, size: 22, color: 'ffffff' });
  const cells = [
    new TableCell({ children: [new Paragraph({ children: [hdr('Particulars')], shading: shade })], width: { size: hasPY ? 50 : 65, type: WidthType.PERCENTAGE } }),
    new TableCell({ children: [new Paragraph({ children: [hdr('Note')], alignment: AlignmentType.CENTER, shading: shade })], width: { size: 8, type: WidthType.PERCENTAGE } }),
    new TableCell({ children: [new Paragraph({ children: [hdr(cyYear || 'Current Year')], alignment: AlignmentType.RIGHT, shading: shade })], width: { size: hasPY ? 21 : 27, type: WidthType.PERCENTAGE } }),
  ];
  if (hasPY) {
    cells.push(new TableCell({ children: [new Paragraph({ children: [hdr(pyYear || 'Previous Year')], alignment: AlignmentType.RIGHT, shading: { type: ShadingType.SOLID, color: '334155', fill: '334155' } })], width: { size: 21, type: WidthType.PERCENTAGE } }));
  }
  return new TableRow({ children: cells, tableHeader: true });
}

// ── Derive date headers from FY string ───────────────────────────────────────
function deriveDates(fy, isUAE) {
  if (!fy) return { cyDate: '', pyDate: '', cyYear: fy, pyYear: '' };
  const m1 = fy.match(/^(\d{4})-(\d{2,4})$/);
  if (m1 && !isUAE) {
    const endYear   = m1[2].length === 2 ? parseInt(m1[1].slice(0, 2) + m1[2]) : parseInt(m1[2]);
    return { cyDate: `31 March ${endYear}`, pyDate: `31 March ${endYear - 1}`, cyYear: fy, pyYear: `${endYear - 1}-${String(endYear).slice(-2)}` };
  }
  const m2 = fy.match(/^(\d{4})$/);
  if (m2) {
    const yr = parseInt(m2[1]);
    return { cyDate: `31 December ${yr}`, pyDate: `31 December ${yr - 1}`, cyYear: fy, pyYear: String(yr - 1) };
  }
  return { cyDate: fy, pyDate: '', cyYear: fy, pyYear: '' };
}


// ── Shared cell helpers ───────────────────────────────────────────────────────
const shade = (c) => ({ type: ShadingType.SOLID, color: c, fill: c });
const pct   = (n) => ({ size: n, type: WidthType.PERCENTAGE });
const hText = (t, color='ffffff', size=18) => new TextRun({ text: String(t??''), bold:true, size, color });
const bText = (t, size=18) => new TextRun({ text: String(t??''), bold:true, size });
const rText = (t, size=16, color='1e293b') => new TextRun({ text: String(t??''), size, color });

function hdrCell(txt, width, dark=true) {
  return new TableCell({ children:[new Paragraph({children:[hText(txt)],alignment:AlignmentType.CENTER,shading:shade(dark?'1e293b':'334155')})], width:pct(width) });
}
function numCell(val, D, locale, width, bold=false) {
  const txt = fmtNum(val, D, locale);
  return new TableCell({ children:[new Paragraph({children:[bold?bText(txt):rText(txt)],alignment:AlignmentType.RIGHT})], width:pct(width) });
}
function txtCell(txt, width, bold=false) {
  return new TableCell({ children:[new Paragraph({children:[bold?bText(txt):rText(txt)]})], width:pct(width) });
}

// ── Front page ────────────────────────────────────────────────────────────────
function buildFrontPage(engagement, frontPageContent) {
  const info = (() => { try { return JSON.parse(frontPageContent||'{}'); } catch { return {}; } })();
  return [
    new Paragraph({text:'',spacing:{after:800}}),
    new Paragraph({children:[new TextRun({text:info.companyName||engagement.client?.name||'Company Name',bold:true,size:56,color:'1e293b'})],alignment:AlignmentType.CENTER,spacing:{after:200}}),
    new Paragraph({children:[new TextRun({text:info.cin?`CIN: ${info.cin}`:info.tradeLicense?`Trade License: ${info.tradeLicense}`:'',size:22,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:100}}),
    new Paragraph({children:[new TextRun({text:info.address||'',size:22,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:600}}),
    new Paragraph({children:[new TextRun({text:'ANNUAL REPORT',bold:true,size:40,color:'6366f1'})],alignment:AlignmentType.CENTER,spacing:{after:200}}),
    new Paragraph({children:[new TextRun({text:`Financial Year ${engagement.financialYear}`,size:28,color:'475569'})],alignment:AlignmentType.CENTER,spacing:{after:600}}),
    new Paragraph({children:[new TextRun({text:`Standard: ${engagement.method}`,size:22,color:'94a3b8'})],alignment:AlignmentType.CENTER,spacing:{after:100}}),
    info.auditorName?new Paragraph({children:[new TextRun({text:`Statutory Auditors: ${info.auditorName}`,size:22,color:'94a3b8'})],alignment:AlignmentType.CENTER}):new Paragraph({text:''}),
    pageBreak(),
  ];
}

// ── TOC ───────────────────────────────────────────────────────────────────────
function buildTOC(sections) {
  const rows = sections.filter(s=>s.isVisible).map((s,i) => new TableRow({children:[
    new TableCell({children:[new Paragraph({children:[new TextRun({text:s.title,size:22})]})],width:pct(80),borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}),
    new TableCell({children:[new Paragraph({children:[new TextRun({text:String(i+1),size:22})],alignment:AlignmentType.RIGHT})],width:pct(20),borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}),
  ]}));
  return [sectionTitle('Table of Contents'),new Table({rows,width:pct(100)}),pageBreak()];
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
function buildBS(cyLines, pyByGroup, D, method, hasPY, cyYear, pyYear, locale) {
  const isUAE = ['IFRS','IFRS_SME'].includes(method);
  const {cyDate} = deriveDates(cyYear, isUAE);
  const cols = hasPY?[52,8,20,20]:[65,8,27];
  const hRow = new TableRow({tableHeader:true,children:[hdrCell('Particulars',cols[0]),hdrCell('Note',cols[1]),hdrCell(cyYear||'CY',cols[2]),...(hasPY?[hdrCell(pyYear||'PY',cols[3],false)]:[]) ]});
  const rows = [hRow,...cyLines.map(l=>{
    const pyAmt = hasPY?Number(pyByGroup.get(l.groupName)?.totalFinalNet??0):null;
    return new TableRow({children:[
      txtCell(l.groupName,cols[0]),
      new TableCell({children:[new Paragraph({children:[new TextRun({text:l.noteGroup?.noteNumber?String(l.noteGroup.noteNumber):'',size:16,color:'6366f1'})],alignment:AlignmentType.CENTER})],width:pct(cols[1])}),
      numCell(l.totalFinalNet,D,locale,cols[2]),
      ...(hasPY?[numCell(pyAmt,D,locale,cols[3])]:[]),
    ]});
  })];
  return [sectionTitle(isUAE?'Statement of Financial Position':'Balance Sheet'),new Paragraph({children:[new TextRun({text:`as at ${cyDate}`,size:18,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:160}}),new Table({width:pct(100),rows}),pageBreak()];
}

// ── P&L ───────────────────────────────────────────────────────────────────────
function buildPL(cyLines, pyByGroup, D, method, hasPY, cyYear, pyYear, locale) {
  const isUAE = ['IFRS','IFRS_SME'].includes(method);
  const {cyDate} = deriveDates(cyYear, isUAE);
  const cols = hasPY?[52,8,20,20]:[65,8,27];
  const inc = cyLines.filter(l=>l.assetLiability==='Income').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const exp = cyLines.filter(l=>l.assetLiability==='Expenses').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pat = inc-exp;
  const pyInc = hasPY?cyLines.filter(l=>l.assetLiability==='Income').reduce((s,l)=>s+Number(pyByGroup.get(l.groupName)?.totalFinalNet??0),0):null;
  const pyPAT = hasPY?(pyInc-(hasPY?cyLines.filter(l=>l.assetLiability==='Expenses').reduce((s,l)=>s+Number(pyByGroup.get(l.groupName)?.totalFinalNet??0),0):0)):null;
  const hRow = new TableRow({tableHeader:true,children:[hdrCell('Particulars',cols[0]),hdrCell('Note',cols[1]),hdrCell(cyYear||'CY',cols[2]),...(hasPY?[hdrCell(pyYear||'PY',cols[3],false)]:[]) ]});
  const rows = [hRow,...cyLines.map(l=>{
    const pyAmt=hasPY?Number(pyByGroup.get(l.groupName)?.totalFinalNet??0):null;
    return new TableRow({children:[
      txtCell(l.groupName,cols[0]),
      new TableCell({children:[new Paragraph({children:[new TextRun({text:l.noteGroup?.noteNumber?String(l.noteGroup.noteNumber):'',size:16,color:'6366f1'})],alignment:AlignmentType.CENTER})],width:pct(cols[1])}),
      numCell(l.totalFinalNet,D,locale,cols[2]),
      ...(hasPY?[numCell(pyAmt,D,locale,cols[3])]:[]),
    ]});
  }),
  new TableRow({children:[
    new TableCell({children:[new Paragraph({children:[bText(pat>=0?'Profit / (Loss) for the Year':'Loss for the Year')],shading:shade('f1f5f9')})],width:pct(cols[0])}),
    new TableCell({children:[new Paragraph({text:''})],width:pct(cols[1])}),
    new TableCell({children:[new Paragraph({children:[bText(fmtNum(pat,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('f1f5f9')})],width:pct(cols[2])}),
    ...(hasPY?[new TableCell({children:[new Paragraph({children:[bText(fmtNum(pyPAT,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('f1f5f9')})],width:pct(cols[3])})]:[]),
  ]})];
  return [sectionTitle(isUAE?'Statement of Comprehensive Income':'Statement of Profit and Loss'),new Paragraph({children:[new TextRun({text:`for the year ended ${cyDate}`,size:18,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:160}}),new Table({width:pct(100),rows}),pageBreak()];
}

// ── OCI ───────────────────────────────────────────────────────────────────────
function buildOCI(ociLines, D, locale, hasPY, cyYear, pyYear) {
  if (!ociLines?.length) return [];
  const cols=hasPY?[60,20,20]:[70,30];
  const total=ociLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pyTot=hasPY?ociLines.reduce((s,l)=>s+Number(l.pyAmount||0),0):null;
  const rows=[
    new TableRow({tableHeader:true,children:[hdrCell('Particulars',cols[0]),hdrCell(cyYear||'CY',cols[1]),...(hasPY?[hdrCell(pyYear||'PY',cols[2],false)]:[])]}),
    ...ociLines.map(l=>new TableRow({children:[txtCell(l.groupName,cols[0]),numCell(l.totalFinalNet,D,locale,cols[1]),...(hasPY?[numCell(l.pyAmount||0,D,locale,cols[2])]:[])]})),
    new TableRow({children:[new TableCell({children:[new Paragraph({children:[bText('Total OCI')],shading:shade('f1f5f9')})],width:pct(cols[0])}),new TableCell({children:[new Paragraph({children:[bText(fmtNum(total,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('f1f5f9')})],width:pct(cols[1])}),...(hasPY?[new TableCell({children:[new Paragraph({children:[bText(fmtNum(pyTot,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('f1f5f9')})],width:pct(cols[2])})]:[])]}),
  ];
  return [sectionTitle('Other Comprehensive Income'),new Table({width:pct(100),rows}),pageBreak()];
}

// ── SOCE ─────────────────────────────────────────────────────────────────────
function buildSOCE(bsLines, plLines, D, method, hasPY, locale) {
  const equity=bsLines.filter(l=>l.assetLiability==='Equity');
  const pat=plLines.filter(l=>l.assetLiability==='Income').reduce((s,l)=>s+Number(l.totalFinalNet||0),0)-plLines.filter(l=>l.assetLiability==='Expenses').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalEq=equity.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pyTotalEq=hasPY?equity.reduce((s,l)=>s+Number(l.pyAmount||0),0):null;
  const hRow=new TableRow({tableHeader:true,children:[hdrCell('Component',30),hdrCell('Opening Balance',18),hdrCell('Profit for Year',17),hdrCell('Other Changes',17),hdrCell('Closing Balance',18)]});
  const rows=[hRow,...equity.map(l=>new TableRow({children:[
    txtCell(l.groupName,30),
    new TableCell({children:[new Paragraph({children:[rText(hasPY?fmtNum(l.pyAmount||0,D,locale):'—')],alignment:AlignmentType.RIGHT})],width:pct(18)}),
    new TableCell({children:[new Paragraph({children:[rText('—')],alignment:AlignmentType.RIGHT})],width:pct(17)}),
    new TableCell({children:[new Paragraph({children:[rText('—')],alignment:AlignmentType.RIGHT})],width:pct(17)}),
    numCell(l.totalFinalNet,D,locale,18),
  ]})),
  new TableRow({children:[
    new TableCell({children:[new Paragraph({children:[bText('Total Equity')],shading:shade('e0e7ff')})],width:pct(30)}),
    new TableCell({children:[new Paragraph({children:[bText(hasPY?fmtNum(pyTotalEq,D,locale):'—')],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(18)}),
    new TableCell({children:[new Paragraph({children:[bText(fmtNum(pat,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(17)}),
    new TableCell({children:[new Paragraph({children:[bText('—')],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(17)}),
    new TableCell({children:[new Paragraph({children:[bText(fmtNum(totalEq,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(18)}),
  ]})];
  return [sectionTitle('Statement of Changes in Equity'),new Paragraph({children:[new TextRun({text:['IND_AS','IFRS'].includes(method)?'IAS 1 Para 106 / Ind AS 1':'Statement of Changes in Equity',size:18,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:160}}),new Table({width:pct(100),rows}),pageBreak()];
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
function buildCFS(bsLines, plLines, D, method, hasPY, locale) {
  const isUAE=['IFRS','IFRS_SME'].includes(method);
  const std=isUAE?'IAS 7':method==='IND_AS'?'Ind AS 7':'AS 3';
  const inc=plLines.filter(l=>l.assetLiability==='Income').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const exp=plLines.filter(l=>l.assetLiability==='Expenses').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pbt=inc-exp;
  const deprKW=['depreciation','amortis','amortiz'];
  const finKW=['finance cost','interest expense','bank charge'];
  const cashKW=['cash','bank'];
  const depr=plLines.filter(l=>l.assetLiability==='Expenses'&&deprKW.some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const fin=plLines.filter(l=>l.assetLiability==='Expenses'&&finKW.some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const cash=bsLines.filter(l=>l.assetLiability==='Assets'&&cashKW.some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const openCash=hasPY?bsLines.filter(l=>l.assetLiability==='Assets'&&cashKW.some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.pyAmount||0),0):0;
  const caKW=['inventor','trade receivable','debtor','receivable','prepaid','advance to','other current asset'];
  const clKW=['trade payable','creditor','other current liab','accrued','advance from','short term provision'];
  let wc=0;
  const wcItems=[];
  if(hasPY){
    for(const l of bsLines){
      const n=(l.groupName||'').toLowerCase();
      if(l.assetLiability==='Assets'&&caKW.some(k=>n.includes(k))){const chg=Number(l.pyAmount||0)-Number(l.totalFinalNet||0);if(Math.abs(chg)>0.01){wc+=chg;wcItems.push({label:`(Incr)/Decr in ${l.groupName}`,amt:chg});}}
      if(l.assetLiability==='Liabilities'&&clKW.some(k=>n.includes(k))){const chg=Number(l.totalFinalNet||0)-Number(l.pyAmount||0);if(Math.abs(chg)>0.01){wc+=chg;wcItems.push({label:`Incr/(Decr) in ${l.groupName}`,amt:chg});}}
    }
  }
  const opCash=pbt+depr+fin+wc;
  const cRow=(label,amount,bold=false)=>new TableRow({children:[
    new TableCell({children:[new Paragraph({children:[bold?bText(label):rText(label)],shading:bold?shade('f8fafc'):undefined})],width:pct(70)}),
    new TableCell({children:[new Paragraph({children:[amount!=null?(bold?bText(fmtNum(amount,D,locale)):rText(fmtNum(amount,D,locale))):rText('')],alignment:AlignmentType.RIGHT,shading:bold?shade('f8fafc'):undefined})],width:pct(30)}),
  ]});
  const sHdr=(label)=>new TableRow({children:[new TableCell({children:[new Paragraph({children:[hText(label,'ffffff',16)],shading:shade('334155')})],columnSpan:2})]});
  const rows=[
    new TableRow({tableHeader:true,children:[hdrCell('Particulars',70),hdrCell('Amount',30)]}),
    sHdr('A. Cash Flow from Operating Activities (Indirect Method)'),
    cRow('Profit / (Loss) Before Tax',pbt),
    cRow('Add: Depreciation and Amortisation',depr),
    cRow('Add: Finance Costs',fin),
    ...(hasPY?[sHdr('Working Capital Changes'),...wcItems.map(i=>cRow(i.label,i.amt))]:
      [cRow('Working Capital Changes (upload prior year TB for details)',0)]),
    cRow('Net Cash from Operating Activities (A)',opCash-fin,true),
    sHdr('B. Cash Flow from Investing Activities'),
    cRow('Purchase of Fixed Assets / Capital Expenditure',0),
    cRow('Net Cash from Investing Activities (B)',0,true),
    sHdr('C. Cash Flow from Financing Activities'),
    cRow('Finance Costs Paid',-fin),
    cRow('Net Cash from Financing Activities (C)',-fin,true),
    cRow('Net Change in Cash and Cash Equivalents (A+B+C)',opCash-fin-fin,true),
    cRow(`Cash and Cash Equivalents at Beginning of Year${hasPY?' (Prior Year Balance Sheet)':''}`,openCash),
    new TableRow({children:[
      new TableCell({children:[new Paragraph({children:[bText('Cash and Cash Equivalents at End of Year (per Balance Sheet)')],shading:shade('e0e7ff')})],width:pct(70)}),
      new TableCell({children:[new Paragraph({children:[bText(fmtNum(cash,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(30)}),
    ]}),
  ];
  return [sectionTitle(isUAE?'Statement of Cash Flows':'Cash Flow Statement'),new Paragraph({children:[new TextRun({text:`for the year ended — ${std} (Indirect Method)`,size:18,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:160}}),new Table({width:pct(100),rows}),pageBreak()];
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function buildNotes(noteGroups, D, locale) {
  const sections=[];
  for(const note of noteGroups){
    sections.push(new Paragraph({children:[new TextRun({text:`Note ${note.noteNumber} — ${note.title}`,bold:true,size:22,color:'4f46e5'})],spacing:{before:200,after:100}}));
    // Disclosure text above the table (Item 1 fix)
    if(note.noteContent){
      sections.push(new Paragraph({children:[new TextRun({text:note.noteContent,size:18,color:'475569',italics:false})],spacing:{after:100}}));
    }
    const rows=[new TableRow({tableHeader:true,children:[hdrCell('Particulars',75),hdrCell('Amount',25)]})];
    for(const sg of (note.subGroups||[])){
      if((note.subGroups||[]).length>1) rows.push(new TableRow({children:[new TableCell({children:[new Paragraph({children:[new TextRun({text:sg.subGroupName,italics:true,size:16,color:'475569'})],shading:shade('f8fafc')})],columnSpan:2})]}));
      for(const r of (sg.rows||[])) rows.push(new TableRow({children:[new TableCell({children:[new Paragraph({children:[rText('  '+(r.accountName||r.accountNumber))]})],width:pct(75)}),numCell(r.finalNet,D,locale,25)]}));
      if((note.subGroups||[]).length>1) rows.push(new TableRow({children:[new TableCell({children:[new Paragraph({children:[bText('Sub-total')]})],width:pct(75)}),numCell(sg.subtotal,D,locale,25,true)]}));
    }
    rows.push(new TableRow({children:[new TableCell({children:[new Paragraph({children:[bText(`Total — ${note.title}`)],shading:shade('e0e7ff')})],width:pct(75)}),new TableCell({children:[new Paragraph({children:[bText(fmtNum(note.total,D,locale))],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(25)})]}));
    sections.push(new Table({rows,width:pct(100)}));
    sections.push(new Paragraph({text:'',spacing:{after:160}}));
  }
  sections.push(pageBreak());
  return sections;
}

// ── Mandatory notes ───────────────────────────────────────────────────────────
function buildMandatoryNotes(method, apContent) {
  const notes=[];
  const add=(num,title,body)=>{
    notes.push(new Paragraph({children:[new TextRun({text:`Note ${num} — ${title}`,bold:true,size:22,color:'4f46e5'})],spacing:{before:200,after:100}}));
    notes.push(...(body?htmlToParagraphs(body):[new Paragraph({children:[new TextRun({text:'[To be completed by management]',size:18,italics:true,color:'94a3b8'})],spacing:{after:160}})]));
  };
  add(1,'General Information',null);
  add(2,method==='IFRS'?'Material Accounting Policies':'Significant Accounting Policies',apContent);
  if(['IND_AS','IFRS','IFRS_SME'].includes(method)) add(3,'Significant Judgements and Estimates',null);
  if(['IND_AS','IFRS'].includes(method)) add(4,'Key Sources of Estimation Uncertainty',null);
  return notes;
}

// ── PPE Schedule ──────────────────────────────────────────────────────────────
function buildPPESchedule(rows, D, method, locale) {
  if(!rows?.length) return [];
  const showReval=['IFRS','IND_AS'].includes(method);
  const std={AS:'Schedule II — Companies Act 2013',IND_AS:'Ind AS 16',IFRS:'IAS 16',IFRS_SME:'IFRS for SMEs Section 17'}[method]||'IAS 16';
  const hdrs=['Asset Class','Op.Gross','Additions','Disposals',...(showReval?['Reval']:[]),'Cl.Gross','Op.Depr','Depr/Yr','On Disp','Cl.Depr','Impairment','Net CY','Net PY'];
  const cw=showReval?[20,7,7,7,7,7,7,7,7,7,7,6,5]:[22,8,8,8,9,8,8,8,8,7,6,5];
  const hRow=new TableRow({tableHeader:true,children:hdrs.map((h,i)=>hdrCell(h,cw[i]||6))});
  const mkRow=(r,bold)=>{
    const cg=Number(r.openingGross||0)+Number(r.additions||0)-Number(r.disposals||0)+Number(r.revaluationAmt||0);
    const cd=r.isDepreciable!==false?Number(r.openingDepr||0)+Number(r.deprForYear||0)-Number(r.deprOnDisposal||0):0;
    const net=cg-cd-Number(r.impairmentAmt||0);const netPY=Number(r.openingGross||0)-Number(r.openingDepr||0);
    const vals=[r.openingGross,r.additions,r.disposals,...(showReval?[r.revaluationAmt]:[]),cg,r.openingDepr,r.deprForYear,r.deprOnDisposal,cd,r.impairmentAmt||0,net,netPY];
    return new TableRow({children:[new TableCell({children:[new Paragraph({children:[bold?bText(r.assetClass||'TOTAL'):rText(r.assetClass||'')],...(bold?{shading:shade('f1f5f9')}:{})})],width:pct(cw[0])}),...vals.map((v,i)=>new TableCell({children:[new Paragraph({children:[bold?bText(fmtNum(v,D,locale)):rText(fmtNum(v,D,locale))],alignment:AlignmentType.RIGHT,...(bold?{shading:shade('f1f5f9')}:{})})],width:pct(cw[i+1]||6)}))  ]});
  };
  const tot=rows.reduce((t,r)=>({openingGross:t.openingGross+Number(r.openingGross||0),additions:t.additions+Number(r.additions||0),disposals:t.disposals+Number(r.disposals||0),revaluationAmt:t.revaluationAmt+Number(r.revaluationAmt||0),openingDepr:t.openingDepr+Number(r.openingDepr||0),deprForYear:t.deprForYear+Number(r.deprForYear||0),deprOnDisposal:t.deprOnDisposal+Number(r.deprOnDisposal||0),impairmentAmt:t.impairmentAmt+Number(r.impairmentAmt||0),isDepreciable:true}),{openingGross:0,additions:0,disposals:0,revaluationAmt:0,openingDepr:0,deprForYear:0,deprOnDisposal:0,impairmentAmt:0});
  return [sectionTitle('Property, Plant and Equipment'),new Paragraph({children:[new TextRun({text:std,size:16,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:120}}),new Table({width:pct(100),rows:[hRow,...rows.map(r=>mkRow(r,false)),mkRow({...tot,assetClass:'TOTAL'},true)]}),pageBreak()];
}

// ── Intangibles Schedule ──────────────────────────────────────────────────────
function buildIntangibleSchedule(rows, D, method, locale) {
  if(!rows?.length) return [];
  const std={AS:'Schedule II (Intangibles)',IND_AS:'Ind AS 38',IFRS:'IAS 38',IFRS_SME:'IFRS for SMEs Section 18'}[method]||'IAS 38';
  const hdrs=['Intangible','Op.Gross','Additions','Disposals','Cl.Gross','Op.Amort','Amort/Yr','On Disp','Cl.Amort','Impairment','Net CY','Net PY'];
  const cw=[22,8,8,8,8,7,7,7,7,7,6,5];
  const hRow=new TableRow({tableHeader:true,children:hdrs.map((h,i)=>hdrCell(h,cw[i]))});
  const mkRow=(r,bold)=>{
    const cg=Number(r.openingGross||0)+Number(r.additions||0)-Number(r.disposals||0);
    const ca=r.isIndefinite?0:Number(r.openingAmort||0)+Number(r.amortForYear||0)-Number(r.amortOnDisposal||0);
    const net=cg-ca-Number(r.impairmentAmt||0);const netPY=Number(r.openingGross||0)-Number(r.openingAmort||0);
    const vals=[r.openingGross,r.additions,r.disposals,cg,r.openingAmort,r.amortForYear,r.amortOnDisposal,ca,r.impairmentAmt||0,net,netPY];
    const na=(i)=>r.isIndefinite&&[3,4,5,6].includes(i);
    return new TableRow({children:[new TableCell({children:[new Paragraph({children:[bold?bText(r.assetClass||'TOTAL'):rText(r.assetClass||'')],...(bold?{shading:shade('f1f5f9')}:{})})],width:pct(cw[0])}),...vals.map((v,i)=>new TableCell({children:[new Paragraph({children:[bold?bText(na(i)?'N/A':fmtNum(v,D,locale)):rText(na(i)?'N/A':fmtNum(v,D,locale))],alignment:AlignmentType.RIGHT,...(bold?{shading:shade('f1f5f9')}:{})})],width:pct(cw[i+1])}))]});
  };
  const tot=rows.reduce((t,r)=>({openingGross:t.openingGross+Number(r.openingGross||0),additions:t.additions+Number(r.additions||0),disposals:t.disposals+Number(r.disposals||0),openingAmort:t.openingAmort+Number(r.openingAmort||0),amortForYear:t.amortForYear+Number(r.amortForYear||0),amortOnDisposal:t.amortOnDisposal+Number(r.amortOnDisposal||0),impairmentAmt:t.impairmentAmt+Number(r.impairmentAmt||0)}),{openingGross:0,additions:0,disposals:0,openingAmort:0,amortForYear:0,amortOnDisposal:0,impairmentAmt:0});
  return [sectionTitle('Intangible Assets'),new Paragraph({children:[new TextRun({text:std,size:16,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:120}}),new Table({width:pct(100),rows:[hRow,...rows.map(r=>mkRow(r,false)),mkRow({...tot,assetClass:'TOTAL'},true)]}),pageBreak()];
}

// ── Deferred Tax ──────────────────────────────────────────────────────────────
function buildDeferredTax(items, D, method, locale) {
  if(!items?.length) return [];
  const hasOCI=['IND_AS','IFRS'].includes(method);
  const std={AS:'AS 22',IND_AS:'Ind AS 12',IFRS:'IAS 12',IFRS_SME:'IFRS for SMEs Section 29'}[method]||'IAS 12';
  const hdrs=['Description','Op.Temp Diff','Op.Tax Eff','Created P&L','Reversed P&L',...(hasOCI?['Cr OCI','Rev OCI']:[]),'Closing DTA/DTL','Rate'];
  const cw=hasOCI?[25,10,10,10,10,8,8,12,7]:[27,12,12,12,12,18,7];
  const hRow=new TableRow({tableHeader:true,children:hdrs.map((h,i)=>hdrCell(h,cw[i]))});
  const calcRow=(r)=>{const rate=Number(r.taxRate||0)/100;const open=Number(r.openingDiff||0)*rate;const pl=(Number(r.createdInPL||0)-Number(r.reversedInPL||0))*rate;const oci=hasOCI?(Number(r.createdInOCI||0)-Number(r.reversedInOCI||0))*rate:0;return{...r,openTA:open,plEffect:pl,ociEffect:oci,closingTA:open+pl+oci};};
  const dta=items.filter(r=>r.isAsset).map(calcRow);
  const dtl=items.filter(r=>!r.isAsset).map(calcRow);
  const netDT=dta.reduce((s,r)=>s+r.closingTA,0)-dtl.reduce((s,r)=>s+r.closingTA,0);
  const mkRow=(r)=>new TableRow({children:[txtCell(r.description,cw[0]),numCell(r.openingDiff,D,locale,cw[1]),numCell(r.openTA,D,locale,cw[2]),numCell(r.createdInPL,D,locale,cw[3]),numCell(r.reversedInPL,D,locale,cw[4]),...(hasOCI?[numCell(r.createdInOCI||0,D,locale,cw[5]),numCell(r.reversedInOCI||0,D,locale,cw[6])]:[]),numCell(r.closingTA,D,locale,cw[hasOCI?7:5],true),new TableCell({children:[new Paragraph({children:[rText(`${r.taxRate||0}%`)],alignment:AlignmentType.CENTER})],width:pct(cw[hasOCI?8:6])})]});
  const grpHdr=(label,clr)=>new TableRow({children:[new TableCell({children:[new Paragraph({children:[hText(label,'ffffff',15)],shading:shade(clr)})],columnSpan:hdrs.length})]});
  const rows=[hRow,...(dta.length?[grpHdr('Deferred Tax Assets (DTA)','166534'),...dta.map(mkRow)]:[]),...(dtl.length?[grpHdr('Deferred Tax Liabilities (DTL)','991b1b'),...dtl.map(mkRow)]:[]),new TableRow({children:[new TableCell({children:[new Paragraph({children:[bText(`Net ${netDT>=0?'DTA':'DTL'}`)],shading:shade('e0e7ff')})],columnSpan:hdrs.length-1}),new TableCell({children:[new Paragraph({children:[bText(fmtNum(Math.abs(netDT),D,locale))],alignment:AlignmentType.RIGHT,shading:shade('e0e7ff')})],width:pct(cw[hasOCI?7:5])})]})];
  return [sectionTitle('Deferred Tax Working'),new Paragraph({children:[new TextRun({text:`${std} — Tax Effect of Timing / Temporary Differences`,size:16,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:120}}),new Table({width:pct(100),rows}),pageBreak()];
}

// ── Related Party Disclosures ─────────────────────────────────────────────────
function buildRelatedParty(parties, D, locale, method) {
  if(!parties?.length) return [];
  const std={AS:'AS 18',IND_AS:'Ind AS 24',IFRS:'IAS 24',IFRS_SME:'IFRS for SMEs Section 33'}[method]||'IAS 24';
  const sections=[sectionTitle('Related Party Disclosures'),new Paragraph({children:[new TextRun({text:`${std} — Mandatory Disclosure`,size:18,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:200}})];
  for(const p of parties){
    if(!p.transactions?.length) continue;
    sections.push(new Paragraph({children:[new TextRun({text:`${p.name} (${p.relationship})`,bold:true,size:20,color:'334155'})],spacing:{before:200,after:80}}));
    const rows=[new TableRow({tableHeader:true,children:[hdrCell('Transaction Type',40),hdrCell('CY Amount',20),hdrCell('PY Amount',20),hdrCell('Outstanding',20)]}),
      ...p.transactions.map(tx=>new TableRow({children:[txtCell(tx.transactionType.replace(/_/g,' '),40),numCell(tx.amountCY,D,locale,20),numCell(tx.amountPY,D,locale,20),numCell(Number(tx.outstandingDr||0)-Number(tx.outstandingCr||0),D,locale,20)]}))];
    sections.push(new Table({width:pct(100),rows}));
    sections.push(new Paragraph({text:'',spacing:{after:120}}));
  }
  sections.push(pageBreak());
  return sections;
}

// ── Contingencies ─────────────────────────────────────────────────────────────
function buildContingencies(items, D, locale) {
  if(!items?.length) return [];
  const rows=[new TableRow({tableHeader:true,children:[hdrCell('Type',20),hdrCell('Description',50),hdrCell('Amount',30)]}),
    ...items.map(it=>new TableRow({children:[txtCell(it.contingencyType.replace(/_/g,' '),20),txtCell(it.description||'',50),new TableCell({children:[new Paragraph({children:[rText(it.amount!=null?fmtNum(it.amount,D,locale):'Not ascertainable')],alignment:AlignmentType.RIGHT})],width:pct(30)})]}))];
  return [sectionTitle('Contingent Liabilities and Commitments'),new Table({width:pct(100),rows}),pageBreak()];
}

function collapseNotes(details) {
  const groups=new Map();
  for(const d of details){const key=d.subGroupName||'Other';if(!groups.has(key))groups.set(key,{subGroupName:key,rows:[],subtotal:0});const g=groups.get(key);g.rows.push({accountNumber:d.accountNumber,accountName:d.accountName,finalNet:Number(d.finalNet)});g.subtotal+=Number(d.finalNet);}
  return [...groups.values()];
}


// ═══════════════════════════════════════════════════════════════════════════════
// exportWord
// ═══════════════════════════════════════════════════════════════════════════════
// ── Signature Block ───────────────────────────────────────────────────────────
function buildSignatureBlock(engagement, info, method, locale) {
  const isUAE  = ['IFRS','IFRS_SME'].includes(method);
  const cyDate = info.signDate || new Date().toLocaleDateString(locale==='en-US'?'en-US':'en-GB',{day:'numeric',month:'long',year:'numeric'});
  const place  = info.place || (isUAE?'Dubai':'Mumbai');
  const blank  = (n=28) => '─'.repeat(n);
  const dirs   = Array.isArray(info.directors) ? info.directors : [];
  const dir1   = dirs[0] || {};
  const dir2   = dirs[1] || {};
  const aud    = {
    name: info.auditorName||'[Statutory Auditor]', reg: info.auditorReg||'[Firm Reg. No.]',
    partner: info.auditorPartner||'[Partner Name]', mem: info.auditorMembership||'[M.No.]',
    place: info.auditorPlace||place, date: info.auditorDate||cyDate,
  };
  const tr = (t,b=false,sz=18,c='1e293b') => new TextRun({text:String(t||''),bold:b,size:sz,color:c});
  const mkCell = (lines,w) => new TableCell({
    children: lines.map(l=>new Paragraph({children:[tr(l.t,l.b,l.sz||18,l.c||'1e293b')],spacing:{after:l.sa||60}})),
    width:{size:w,type:WidthType.PERCENTAGE},
    margins:{top:80,bottom:80,left:100,right:100},
    borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
  });
  const els = [pageBreak(), sectionTitle('Signatures'), new Paragraph({text:'',spacing:{after:400}})];
  if (isUAE) {
    els.push(
      new Paragraph({children:[tr('For and on behalf of the Board of Directors',true,20,'475569')],spacing:{after:400}}),
      new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
        new TableRow({children:[
          mkCell([{t:blank(),sz:20,sa:300},{t:dir1.name||engagement.client?.name||'[Signatory]',b:true,sz:20,sa:80},{t:dir1.designation||'Authorised Signatory',c:'64748b',sa:60},{t:dir1.din?`ID: ${dir1.din}`:'',c:'94a3b8',sz:16}],50),
          mkCell([{t:blank(),sz:20,sa:300},{t:aud.name,b:true,sz:20,sa:80},{t:`Firm Reg. No.: ${aud.reg}`,c:'64748b',sa:60},{t:`Per: ${aud.partner}`,sa:40},{t:`Membership No.: ${aud.mem}`,c:'94a3b8',sz:16}],50),
        ]}),
        new TableRow({children:[
          mkCell([{t:`Place: ${place}`,c:'64748b',sz:16,sa:40},{t:`Date:  ${cyDate}`,c:'64748b',sz:16}],50),
          mkCell([{t:`Place: ${aud.place}`,c:'64748b',sz:16,sa:40},{t:`Date:  ${aud.date}`,c:'64748b',sz:16}],50),
        ]}),
      ]}),
    );
  } else {
    els.push(
      new Paragraph({children:[tr(`For ${engagement.client?.name||'Company Name'}`,true,22)],spacing:{after:500}}),
      new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
        new TableRow({children:[
          mkCell([{t:blank(),sz:20,sa:300},{t:dir1.name||blank(16),b:true,sz:20,sa:80},{t:dir1.designation||'Director',c:'64748b',sa:60},{t:dir1.din?`DIN: ${dir1.din}`:`DIN: ${blank(10)}`,c:'94a3b8',sz:16}],33),
          mkCell([{t:blank(),sz:20,sa:300},{t:dir2.name||blank(16),b:true,sz:20,sa:80},{t:dir2.designation||'Director',c:'64748b',sa:60},{t:dir2.din?`DIN: ${dir2.din}`:`DIN: ${blank(10)}`,c:'94a3b8',sz:16}],33),
          mkCell([{t:blank(),sz:20,sa:300},{t:aud.name,b:true,sz:20,sa:80},{t:`Firm Reg. No.: ${aud.reg}`,c:'64748b',sa:60},{t:`Per: ${aud.partner}`,sa:40},{t:`M.No.: ${aud.mem}`,c:'94a3b8',sz:16}],34),
        ]}),
        new TableRow({children:[
          mkCell([{t:`Place: ${place}`,c:'64748b',sz:16,sa:40},{t:`Date:  ${blank(12)}`,c:'64748b',sz:16}],33),
          mkCell([{t:`Place: ${place}`,c:'64748b',sz:16,sa:40},{t:`Date:  ${blank(12)}`,c:'64748b',sz:16}],33),
          mkCell([{t:`Place: ${aud.place}`,c:'64748b',sz:16,sa:40},{t:`Date:  ${blank(12)}`,c:'64748b',sz:16}],34),
        ]}),
      ]}),
    );
    if (info.csName) {
      els.push(
        new Paragraph({text:'',spacing:{after:400}}),
        new Paragraph({children:[tr('Company Secretary',true,20,'475569')],spacing:{after:400}}),
        new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:[
          mkCell([{t:blank(),sz:20,sa:300},{t:info.csName,b:true,sz:20,sa:80},{t:'Company Secretary',c:'64748b',sa:60},{t:info.csMembership?`M.No.: ${info.csMembership}`:'',c:'94a3b8',sz:16}],40),
          mkCell([{t:''}],60),
        ]})]}),
      );
    }
  }
  els.push(
    new Paragraph({text:'',spacing:{after:240}}),
    new Paragraph({children:[tr(isUAE?'These financial statements were approved and authorised for issue on the date stated above.':'As per our report of even date. For and on behalf of the Board.',false,16,'94a3b8')],alignment:AlignmentType.CENTER}),
  );
  return els;
}


async function exportWord(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.cin, c.pan, c.gstin,
            c."tradeLicense", c."vatNumber", c.region as "clientRegion", c.country as "clientCountry"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
  const eng    = engRows[0];
  const method = eng.method;
  const isUAE  = method === 'IFRS' || method === 'IFRS_SME' || eng.clientCountry === 'UAE';
  const locale = isUAE ? 'en-US' : 'en-IN';
  const D      = 1;
  const engagement = { ...eng, client: { name: eng.clientName, cin: eng.cin, pan: eng.pan, gstin: eng.gstin, tradeLicense: eng.tradeLicense, vatNumber: eng.vatNumber, region: eng.clientRegion } };

  const [sections, allFSLines, noteGroups, ppeRows, intangRows, dtItems, relatedParties, contingencies] = await Promise.all([
    prisma.reportSection.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId }, orderBy: { noteNumber: 'asc' }, include: { noteDetails: { orderBy: [{ subGroupNo: 'asc' }, { displayOrder: 'asc' }] } } }),
    prisma.pPEClass.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.intangibleClass.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.deferredTaxItem.findMany({ where: { engagementId }, orderBy: [{ isAsset: 'desc' }, { displayOrder: 'asc' }] }),
    prisma.relatedParty.findMany({ where: { engagementId }, include: { transactions: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.contingency.findMany({ where: { engagementId }, orderBy: [{ contingencyType: 'asc' }, { displayOrder: 'asc' }] }),
  ]);

  const ngMap     = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const cyFSLines = allFSLines.filter(l => !l.isPriorYear).map(l => ({ ...l, noteGroup: l.noteGroupId ? ngMap.get(l.noteGroupId) || null : null }));
  const pyFSLines = allFSLines.filter(l => l.isPriorYear);
  const hasPY     = pyFSLines.length > 0;
  const pyByGroup = new Map(pyFSLines.map(l => [l.groupName, l]));
  const cyBS  = cyFSLines.filter(l => l.sheet === 'BS'  && !l.groupName?.startsWith('__'));
  const cyPL  = cyFSLines.filter(l => l.sheet === 'PL'  && !l.groupName?.startsWith('__'));
  const cyOCI = cyFSLines.filter(l => l.sheet === 'OCI' && !l.groupName?.startsWith('__'));
  const { cyYear, pyYear } = deriveDates(eng.financialYear, isUAE);
  const apSection    = sections.find(s => s.sectionType === 'ACCOUNTING_POLICY');
  const fpSection    = sections.find(s => s.sectionType === 'FIRST_PAGE');
  const info         = (() => { try { return JSON.parse(fpSection?.content||'{}'); } catch { return {}; } })();

  const structuredNotes = noteGroups
    .filter(ng => !ng.noteGroupId?.startsWith('__') && !ng.title?.startsWith('__'))
    .map(ng => ({ noteNumber: ng.noteNumber, title: ng.title, noteContent: ng.noteContent||null, total: ng.noteDetails.reduce((s,d) => s+Number(d.finalNet),0), subGroups: collapseNotes(ng.noteDetails) }));

  const children = [];
  const visibleSections = sections.filter(s => s.isVisible).sort((a,b) => a.displayOrder - b.displayOrder);

  for (const section of visibleSections) {
    switch (section.sectionType) {
      case 'FIRST_PAGE':
        children.push(...buildFrontPage(engagement, section.content)); break;
      case 'TABLE_OF_CONTENTS':
        children.push(...buildTOC(visibleSections)); break;
      case 'DIRECTOR_REPORT':
      case 'AUDITOR_REPORT':
      case 'SUGGESTIONS':
        children.push(sectionTitle(section.title));
        children.push(...htmlToParagraphs(section.content));
        children.push(pageBreak()); break;
      case 'ACCOUNTING_POLICY':
        break; // rendered as Note 2 inside NOTES section — skip here
      case 'FINANCIAL_STATEMENTS':
        children.push(sectionTitle('Financial Statements'));
        children.push(...buildBS(cyBS, pyByGroup, D, method, hasPY, cyYear, pyYear, locale));
        children.push(...buildPL(cyPL, pyByGroup, D, method, hasPY, cyYear, pyYear, locale));
        if (['IND_AS','IFRS'].includes(method) && cyOCI.length > 0)
          children.push(...buildOCI(cyOCI, D, locale, hasPY, cyYear, pyYear));
        children.push(...buildCFS(cyBS, cyPL, D, method, hasPY, locale));
        if (['IND_AS','IFRS','IFRS_SME'].includes(method))
          children.push(...buildSOCE(cyBS, cyPL, D, method, hasPY, locale));
        break;
      case 'NOTES':
        children.push(sectionTitle('Notes to Financial Statements'));
        children.push(...buildMandatoryNotes(method, apSection?.content));
        if (structuredNotes.length > 0) children.push(...buildNotes(structuredNotes, D, locale));
        if (ppeRows.length > 0)         children.push(...buildPPESchedule(ppeRows, D, method, locale));
        if (intangRows.length > 0)      children.push(...buildIntangibleSchedule(intangRows, D, method, locale));
        if (dtItems.length > 0)         children.push(...buildDeferredTax(dtItems, D, method, locale));
        if (relatedParties.length > 0)  children.push(...buildRelatedParty(relatedParties, D, locale, method));
        if (contingencies.length > 0)   children.push(...buildContingencies(contingencies, D, locale));
        break;
      case 'THANK_YOU':
        children.push(new Paragraph({ text: '', spacing: { after: 1200 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: section.content ? stripHtml(section.content) : 'Thank You', bold: true, size: 48, color: '6366f1' })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `— ${engagement.client?.name || 'Company'} Management`, size: 24, color: '64748b' })], alignment: AlignmentType.CENTER }));
        children.push(...buildSignatureBlock(engagement, info, method, locale));
        break;
    }
  }

  const doc = new Document({
    creator: 'FinStatement SaaS',
    title:   `${engagement.client?.name} — Annual Report ${eng.financialYear}`,
    subject: `Financial Statements — ${method}`,
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25) } } },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `${engagement.client?.name||''} — FY ${eng.financialYear}  |  Page `, size: 18, color: '94a3b8' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '94a3b8' })], alignment: AlignmentType.CENTER })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

// ═══════════════════════════════════════════════════════════════════════════════
// exportExcel
// ═══════════════════════════════════════════════════════════════════════════════
async function exportExcel(engagementId, firmId) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinStatement SaaS';

  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.country as "clientCountry" FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId" WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
  const eng    = engRows[0];
  const method = eng.method;
  const isUAE  = method === 'IFRS' || method === 'IFRS_SME' || eng.clientCountry === 'UAE';
  const locale = isUAE ? 'en-US' : 'en-IN';
  const numFmt = isUAE ? '#,##0.00' : '##\\,##\\,##0.00';
  const D = 1;
  const { cyYear, pyYear } = deriveDates(eng.financialYear, isUAE);

  const [allFSLines, noteGroupsAll, ppeRows, intangRows, dtItems, relatedParties, contingencies] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId }, orderBy: { noteNumber: 'asc' }, include: { noteDetails: { orderBy: { displayOrder: 'asc' } } } }),
    prisma.pPEClass.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.intangibleClass.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.deferredTaxItem.findMany({ where: { engagementId }, orderBy: [{ isAsset: 'desc' }, { displayOrder: 'asc' }] }),
    prisma.relatedParty.findMany({ where: { engagementId }, include: { transactions: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.contingency.findMany({ where: { engagementId }, orderBy: [{ contingencyType: 'asc' }, { displayOrder: 'asc' }] }),
  ]);

  const ngMap     = new Map(noteGroupsAll.map(ng => [ng.noteGroupId, ng]));
  const cyFSLines = allFSLines.filter(l => !l.isPriorYear).map(l => ({ ...l, noteGroup: l.noteGroupId ? ngMap.get(l.noteGroupId)||null : null }));
  const pyFSLines = allFSLines.filter(l => l.isPriorYear);
  const hasPY     = pyFSLines.length > 0;
  const pyByGroup = new Map(pyFSLines.map(l => [l.groupName, l]));

  const hdr  = { font:{ name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF1E293B'}}, alignment:{horizontal:'center'} };
  const pyH  = { font:{ name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF334155'}}, alignment:{horizontal:'right'} };
  const bold = { font:{ name:'Calibri',size:11,bold:true }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}} };

  const addFSSheet = (name, lines) => {
    const ws = wb.addWorksheet(name);
    const cw = hasPY?[50,10,20,20]:[50,10,25];
    cw.forEach((w,i)=>{ ws.getColumn(i+1).width=w; });
    const h = ws.addRow(['Particulars','Note',cyYear,...(hasPY?[pyYear]:[])]);
    h.eachCell(c=>Object.assign(c,hdr)); if(hasPY) Object.assign(h.getCell(4),pyH);
    lines.filter(l=>!l.groupName?.startsWith('__')).forEach(l=>{
      const pyAmt=hasPY?Number(pyByGroup.get(l.groupName)?.totalFinalNet??0):undefined;
      const row=ws.addRow([l.groupName,l.noteGroup?.noteNumber||'',Number(l.totalFinalNet),...(hasPY?[pyAmt]:[])]);
      row.getCell(2).alignment={horizontal:'center'};
      row.getCell(3).numFmt=numFmt; row.getCell(3).alignment={horizontal:'right'};
      if(hasPY){row.getCell(4).numFmt=numFmt;row.getCell(4).alignment={horizontal:'right'};row.getCell(4).font={color:{argb:'FF64748B'}};}
    });
  };

  addFSSheet('Balance Sheet', cyFSLines.filter(l=>l.sheet==='BS'));
  addFSSheet('Profit and Loss', cyFSLines.filter(l=>l.sheet==='PL'));
  if(['IND_AS','IFRS'].includes(method)){const oci=cyFSLines.filter(l=>l.sheet==='OCI');if(oci.length)addFSSheet('OCI',oci);}

  // Cash Flow sheet
  const cfWS=wb.addWorksheet('Cash Flow');
  cfWS.getColumn(1).width=60;cfWS.getColumn(2).width=22;
  const cfH=cfWS.addRow(['Particulars','Amount']);cfH.eachCell(c=>Object.assign(c,hdr));
  const addCF=(label,val,isBold)=>{const r=cfWS.addRow([label,val!=null?Number(val):'']);if(val!=null){r.getCell(2).numFmt=numFmt;r.getCell(2).alignment={horizontal:'right'};}if(isBold){r.font={bold:true,name:'Calibri',size:11};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};}};
  const inc=cyFSLines.filter(l=>l.sheet==='PL'&&l.assetLiability==='Income').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const exp=cyFSLines.filter(l=>l.sheet==='PL'&&l.assetLiability==='Expenses').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pbt=inc-exp;
  const depr=cyFSLines.filter(l=>l.sheet==='PL'&&['depreciation','amortis'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const fin=cyFSLines.filter(l=>l.sheet==='PL'&&['finance cost','interest expense'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const cash=cyFSLines.filter(l=>l.sheet==='BS'&&l.assetLiability==='Assets'&&['cash','bank'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const openCash=hasPY?cyFSLines.filter(l=>l.sheet==='BS'&&l.assetLiability==='Assets'&&['cash','bank'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(pyByGroup.get(l.groupName)?.totalFinalNet||0),0):0;
  addCF('A. OPERATING ACTIVITIES',null,true);addCF('Profit/(Loss) Before Tax',pbt);addCF('Add: Depreciation',depr);addCF('Add: Finance Costs',fin);
  addCF('Net Cash from Operating Activities (A)',pbt+depr,true);addCF('B. INVESTING ACTIVITIES',null,true);addCF('Purchase of Fixed Assets',0);addCF('Net Cash from Investing (B)',0,true);
  addCF('C. FINANCING ACTIVITIES',null,true);addCF('Finance Costs Paid',-fin);addCF('Net Cash from Financing (C)',-fin,true);
  addCF('Net Change in Cash',pbt+depr-fin,true);addCF('Opening Cash',openCash);addCF('Closing Cash (from BS)',cash,true);

  // Notes sheet
  const nWS=wb.addWorksheet('Notes');
  nWS.getColumn(1).width=12;nWS.getColumn(2).width=55;nWS.getColumn(3).width=22;
  let nr=1;
  for(const ng of noteGroupsAll.filter(n=>!n.noteGroupId?.startsWith('__'))){
    const h2=nWS.getRow(nr++);h2.getCell(1).value=`Note ${ng.noteNumber}`;h2.getCell(2).value=ng.title;h2.font={bold:true,name:'Calibri',size:11,color:{argb:'FF4F46E5'}};
    for(const d of ng.noteDetails){const r=nWS.getRow(nr++);r.getCell(2).value=d.accountName||d.accountNumber;r.getCell(3).value=Number(d.finalNet);r.getCell(3).numFmt=numFmt;r.getCell(3).alignment={horizontal:'right'};}
    const tot=nWS.getRow(nr++);tot.getCell(2).value=`Total — ${ng.title}`;tot.getCell(3).value=ng.noteDetails.reduce((s,d)=>s+Number(d.finalNet),0);tot.getCell(3).numFmt=numFmt;tot.getCell(3).alignment={horizontal:'right'};tot.font={bold:true,name:'Calibri',size:11};
    nr++;
  }

  // PPE Schedule sheet
  if(ppeRows.length>0){
    const showReval=['IFRS','IND_AS'].includes(method);
    const pWS=wb.addWorksheet('PPE Schedule');
    const pHdrs=['Asset Class','Op.Gross','Additions','Disposals',...(showReval?['Revaluation']:[]),'Cl.Gross','Op.Depr','Depr/Yr','On Disposal','Cl.Depr','Impairment','Net CY','Net PY'];
    [30,12,12,12,...(showReval?[12]:[]),12,12,12,12,12,12,12,12].forEach((w,i)=>pWS.getColumn(i+1).width=w);
    const pH=pWS.addRow(pHdrs);pH.eachCell(c=>Object.assign(c,hdr));
    ppeRows.forEach(r=>{const cg=Number(r.openingGross||0)+Number(r.additions||0)-Number(r.disposals||0)+Number(r.revaluationAmt||0);const cd=r.isDepreciable!==false?Number(r.openingDepr||0)+Number(r.deprForYear||0)-Number(r.deprOnDisposal||0):0;const net=cg-cd-Number(r.impairmentAmt||0);const netPY=Number(r.openingGross||0)-Number(r.openingDepr||0);const row=pWS.addRow([r.assetClass,r.openingGross||0,r.additions||0,r.disposals||0,...(showReval?[r.revaluationAmt||0]:[]),cg,r.openingDepr||0,r.deprForYear||0,r.deprOnDisposal||0,cd,r.impairmentAmt||0,net,netPY]);for(let i=2;i<=row.cellCount;i++){row.getCell(i).numFmt=numFmt;row.getCell(i).alignment={horizontal:'right'};}});
  }

  // Intangibles sheet
  if(intangRows.length>0){
    const iWS=wb.addWorksheet('Intangibles');
    [30,12,12,12,12,12,12,12,12,12,12,12].forEach((w,i)=>iWS.getColumn(i+1).width=w);
    const iH=iWS.addRow(['Class','Op.Gross','Additions','Disposals','Cl.Gross','Op.Amort','Amort/Yr','On Disposal','Cl.Amort','Impairment','Net CY','Net PY']);iH.eachCell(c=>Object.assign(c,hdr));
    intangRows.forEach(r=>{const cg=Number(r.openingGross||0)+Number(r.additions||0)-Number(r.disposals||0);const ca=r.isIndefinite?0:Number(r.openingAmort||0)+Number(r.amortForYear||0)-Number(r.amortOnDisposal||0);const net=cg-ca-Number(r.impairmentAmt||0);const netPY=Number(r.openingGross||0)-Number(r.openingAmort||0);const row=iWS.addRow([r.assetClass,r.openingGross||0,r.additions||0,r.disposals||0,cg,r.openingAmort||0,r.amortForYear||0,r.amortOnDisposal||0,ca,r.impairmentAmt||0,net,netPY]);for(let i=2;i<=row.cellCount;i++){row.getCell(i).numFmt=numFmt;row.getCell(i).alignment={horizontal:'right'};}});
  }

  // Deferred Tax sheet
  if(dtItems.length>0){
    const hasOCI=['IND_AS','IFRS'].includes(method);
    const dtWS=wb.addWorksheet('Deferred Tax');
    const dtHdrs=['Description','Op.Temp Diff','Op.Tax Effect','Created P&L','Reversed P&L',...(hasOCI?['Created OCI','Reversed OCI']:[]),'Closing DTA/DTL','Tax Rate %'];
    [35,14,14,14,14,...(hasOCI?[13,13]:[]),16,10].forEach((w,i)=>dtWS.getColumn(i+1).width=w);
    const dtH=dtWS.addRow(dtHdrs);dtH.eachCell(c=>Object.assign(c,hdr));
    dtItems.forEach(r=>{const rate=Number(r.taxRate||0)/100;const open=Number(r.openingDiff||0)*rate;const pl=(Number(r.createdInPL||0)-Number(r.reversedInPL||0))*rate;const oci=hasOCI?(Number(r.createdInOCI||0)-Number(r.reversedInOCI||0))*rate:0;const cls=open+pl+oci;const row=dtWS.addRow([r.description,r.openingDiff||0,open,r.createdInPL||0,r.reversedInPL||0,...(hasOCI?[r.createdInOCI||0,r.reversedInOCI||0]:[]),cls,r.taxRate||0]);for(let i=2;i<row.cellCount;i++){row.getCell(i).numFmt=numFmt;row.getCell(i).alignment={horizontal:'right'};}});
  }

  // Related Party sheet
  const rpP=relatedParties.filter(p=>p.transactions?.length);
  if(rpP.length>0){
    const rpWS=wb.addWorksheet('Related Party');
    [25,35,18,18,18,18].forEach((w,i)=>rpWS.getColumn(i+1).width=w);
    const rpH=rpWS.addRow(['Party','Transaction Type','CY Amount','PY Amount','Outstanding Dr','Outstanding Cr']);rpH.eachCell(c=>Object.assign(c,hdr));
    let rr=2;for(const p of rpP){for(const tx of p.transactions){const row=rpWS.getRow(rr++);row.getCell(1).value=p.name;row.getCell(2).value=tx.transactionType.replace(/_/g,' ');row.getCell(3).value=Number(tx.amountCY||0);row.getCell(3).numFmt=numFmt;row.getCell(4).value=Number(tx.amountPY||0);row.getCell(4).numFmt=numFmt;row.getCell(5).value=Number(tx.outstandingDr||0);row.getCell(5).numFmt=numFmt;row.getCell(6).value=Number(tx.outstandingCr||0);row.getCell(6).numFmt=numFmt;for(let i=3;i<=6;i++)row.getCell(i).alignment={horizontal:'right'};}}
  }

  // Contingencies sheet
  if(contingencies.length>0){
    const cWS=wb.addWorksheet('Contingencies');
    [20,55,20].forEach((w,i)=>cWS.getColumn(i+1).width=w);
    const cH=cWS.addRow(['Type','Description','Amount']);cH.eachCell(c=>Object.assign(c,hdr));
    contingencies.forEach(it=>{const row=cWS.addRow([it.contingencyType.replace(/_/g,' '),it.description||'',it.amount!=null?Number(it.amount):'Not ascertainable']);if(it.amount!=null){row.getCell(3).numFmt=numFmt;row.getCell(3).alignment={horizontal:'right'};}});
  }

  return wb.xlsx.writeBuffer();
}

// ── PDF data ─────────────────────────────────────────────────────────────────
async function exportPDFData(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.id as "clientId", c.cin, c.pan, c.gstin,
            c."tradeLicense", c."vatNumber", c.region as "clientRegion"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
  const [fsLines, noteGroups, noteDetails] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId, isPriorYear: false }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId }, orderBy: { noteNumber: 'asc' } }),
    prisma.noteDetail.findMany({ where: { engagementId } }),
  ]);
  return { engagement: { ...engRows[0], clientName: engRows[0].clientName }, fsLines, noteGroups, noteDetails };
}

module.exports = { exportWord, exportExcel, exportPDFData };
