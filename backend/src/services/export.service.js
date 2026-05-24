'use strict';
 
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, PageBreak, WidthType,
  BorderStyle, ShadingType, Header, Footer, PageNumber,
  NumberFormat, convertInchesToTwip, UnderlineType, HeightRule,
} = require('docx');
const { prisma } = require('../config/db');
 
// ── Number formatter ──────────────────────────────────────────────────────────
function fmtNum(n, divisor = 1, hideZero = false) {
  const num = Number(n || 0) / divisor;
  if (hideZero && num === 0) return ''; // hide zero rows in export
  const abs = Math.abs(num);
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `(${s})` : s;
}
 
// ── Strip HTML tags from rich text for docx ───────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .trim();
}
 
// ── Parse HTML to docx paragraphs (basic) ────────────────────────────────────
function htmlToParagraphs(html) {
  if (!html) return [new Paragraph({ text: '' })];
  const paras = [];
  // Split by block-level tags
  const blocks = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '§H1§$1§END§')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '§H2§$1§END§')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '§H3§$1§END§')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '§LI§$1§END§')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '§P§$1§END§')
    .split('§END§');
 
  for (const block of blocks) {
    const text = stripHtml(block.replace(/§[A-Z0-9]+§/g, '').trim());
    if (!text) continue;
    if (block.includes('§H1§')) {
      paras.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }));
    } else if (block.includes('§H2§')) {
      paras.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }));
    } else if (block.includes('§H3§')) {
      paras.push(new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { after: 80 } }));
    } else if (block.includes('§LI§')) {
      paras.push(new Paragraph({
        text, bullet: { level: 0 },
        spacing: { after: 60 },
      }));
    } else {
      paras.push(new Paragraph({
        children: [new TextRun({ text, size: 22 })],
        spacing: { after: 80 },
      }));
    }
  }
  return paras.length ? paras : [new Paragraph({ text: stripHtml(html) })];
}
 
// ── Helper: section title paragraph ──────────────────────────────────────────
function sectionTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: '1e293b' })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 200 },
    border: { bottom: { color: '6366f1', size: 6, space: 4, style: BorderStyle.SINGLE } },
  });
}
 
// ── Helper: page break paragraph ─────────────────────────────────────────────
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}
 
// ── Helper: BS/PL table row ───────────────────────────────────────────────────
function fsRow(label, note, amount, bold, indent, divisor) {
  const labelRun  = new TextRun({ text: '  '.repeat(indent || 0) + label, bold: !!bold, size: 20 });
  const noteRun   = new TextRun({ text: note ? String(note) : '', size: 20, color: '6366f1' });
  // Return empty invisible row for zero non-bold amounts (keeps array structure intact)
  if (amount !== null && amount !== undefined && Math.abs(Number(amount)) < 0.005 && !bold) {
    return new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: '' })], columnSpan: 3 }),
      ],
      height: { value: 0, rule: HeightRule.EXACT },
    });
  }
  const amtRun    = new TextRun({ text: amount !== null && amount !== undefined ? fmtNum(amount, divisor, true) : '', bold: !!bold, size: 20 });
  return new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [labelRun] })], width: { size: 65, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [noteRun], alignment: AlignmentType.CENTER })], width: { size: 10, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [amtRun], alignment: AlignmentType.RIGHT })], width: { size: 25, type: WidthType.PERCENTAGE } }),
    ],
    tableHeader: !!bold,
  });
}
 
// ── Front page ────────────────────────────────────────────────────────────────
function buildFrontPage(engagement, frontPageContent) {
  const info = (() => { try { return JSON.parse(frontPageContent || '{}'); } catch { return {}; } })();
  return [
    new Paragraph({ text: '', spacing: { after: 800 } }),
    new Paragraph({
      children: [new TextRun({ text: info.companyName || engagement.client?.name || 'Company Name', bold: true, size: 56, color: '1e293b' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: info.cin ? `CIN: ${info.cin}` : '', size: 22, color: '64748b' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: info.address || '', size: 22, color: '64748b' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'ANNUAL REPORT', bold: true, size: 40, color: '6366f1' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Financial Year ${engagement.financialYear}`, size: 28, color: '475569' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Method: ${engagement.method}`, size: 22, color: '94a3b8' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    info.auditorName ? new Paragraph({
      children: [new TextRun({ text: `Statutory Auditors: ${info.auditorName}`, size: 22, color: '94a3b8' })],
      alignment: AlignmentType.CENTER,
    }) : new Paragraph({ text: '' }),
    pageBreak(),
  ];
}
 
// ── TOC ───────────────────────────────────────────────────────────────────────
function buildTOC(sections) {
  const rows = sections
    .filter(s => s.isVisible)
    .map((s, i) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.title, size: 22 })] })], width: { size: 80, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 22 })], alignment: AlignmentType.RIGHT })], width: { size: 20, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
      ],
    }));
 
  return [
    sectionTitle('Table of Contents'),
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    pageBreak(),
  ];
}
 
// ── BS in Word ────────────────────────────────────────────────────────────────
function buildBS(fsLines, divisor, method) {
  const lines = fsLines || [];
  const g = (kw) => lines.filter(l => kw.some(k => l.groupName?.toLowerCase().includes(k.toLowerCase()))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const n = (kw) => lines.find(l => kw.some(k => l.groupName?.toLowerCase().includes(k.toLowerCase())))?.noteGroup?.noteNumber;
 
  const sc=g(['share capital']), res=g(['r&s','reserves and surplus','retained earnings']), sfT=sc+res;
  const ltB=g(['long term borrowings','non-current borrowings']), dtl=g(['deferred tax liability']), oltl=g(['other long term liabilities']), ltp=g(['long term provisions']), ncLT=ltB+dtl+oltl+ltp;
  const stB=g(['short-term borrowings','short term borrowings']), tp=g(['trade payables']), ocl=g(['other current liabilities']), stp=g(['short term provisions']), clT=stB+tp+ocl+stp;
  const totEL=sfT+ncLT+clT;
  const fa=g(['fixed assets','property, plant','ppe','tangible','intangible','cwip']), nci=g(['non current investments']), dta=g(['deferred tax asset']), ltl=g(['long term loans']), onca=g(['other non-current assets']), ncaT=fa+nci+dta+ltl+onca;
  const ci=g(['current investments']), inv=g(['inventories','stock']), tr=g(['trade receivables','debtors']), cash=g(['cash']), stl=g(['short-term loans']), oca=g(['other current assets']), caT=ci+inv+tr+cash+stl+oca;
  const totA=ncaT+caT;
  const D=divisor;
 
  const hdr = (txt) => new TableRow({ children: [new TableCell({ children: [new Paragraph({ children:[new TextRun({text:txt,bold:true,size:20,color:'ffffff'})], shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'} })], columnSpan:3 })], tableHeader: true });
  const subhdr = (txt) => new TableRow({ children: [new TableCell({ children: [new Paragraph({ children:[new TextRun({text:txt,bold:true,size:18,color:'475569'})], shading:{type:ShadingType.SOLID,color:'f1f5f9',fill:'f1f5f9'} })], columnSpan:3 })] });
 
  return [
    sectionTitle(method === 'IFRS' || method === 'IFRS_SME' ? 'Statement of Financial Position' : 'Balance Sheet'),
    new Paragraph({ children:[new TextRun({text:'as at 31st March',size:20,color:'64748b'})], alignment:AlignmentType.CENTER, spacing:{after:160} }),
    new Table({
      width:{size:100,type:WidthType.PERCENTAGE},
      rows:[
        new TableRow({tableHeader:true, children:[
          new TableCell({children:[new Paragraph({children:[new TextRun({text:'Particulars',bold:true,size:22,color:'ffffff'})],shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'}})], width:{size:65,type:WidthType.PERCENTAGE}}),
          new TableCell({children:[new Paragraph({children:[new TextRun({text:'Note',bold:true,size:22,color:'ffffff'})],alignment:AlignmentType.CENTER,shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'}})], width:{size:10,type:WidthType.PERCENTAGE}}),
          new TableCell({children:[new Paragraph({children:[new TextRun({text:'Amount',bold:true,size:22,color:'ffffff'})],alignment:AlignmentType.RIGHT,shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'}})], width:{size:25,type:WidthType.PERCENTAGE}}),
        ]}),
        hdr('I. EQUITY AND LIABILITIES'),
        subhdr("(1) Shareholders' Funds"),
        fsRow('Share Capital',n(['share capital']),sc,false,2,D),
        fsRow('Reserves and Surplus',n(['r&s','reserves']),res,false,2,D),
        fsRow("Sub-total — Shareholders' Funds",null,sfT,true,0,D),
        subhdr('(2) Non-Current Liabilities'),
        fsRow('Long-Term Borrowings',n(['long term borrowings']),ltB,false,2,D),
        fsRow('Deferred Tax Liabilities (Net)',n(['deferred tax liability']),dtl,false,2,D),
        fsRow('Other Long-Term Liabilities',n(['other long term liabilities']),oltl,false,2,D),
        fsRow('Long-Term Provisions',n(['long term provisions']),ltp,false,2,D),
        fsRow('Sub-total — Non-Current Liabilities',null,ncLT,true,0,D),
        subhdr('(3) Current Liabilities'),
        fsRow('Short-Term Borrowings',n(['short-term borrowings']),stB,false,2,D),
        fsRow('Trade Payables',n(['trade payables']),tp,false,2,D),
        fsRow('Other Current Liabilities',n(['other current liabilities']),ocl,false,2,D),
        fsRow('Short-Term Provisions',n(['short term provisions']),stp,false,2,D),
        fsRow('Sub-total — Current Liabilities',null,clT,true,0,D),
        fsRow('TOTAL — EQUITY AND LIABILITIES',null,totEL,true,0,D),
        hdr('II. ASSETS'),
        subhdr('(1) Non-Current Assets'),
        fsRow('Fixed Assets',n(['fixed assets','ppe','tangible']),fa,false,2,D),
        fsRow('Non-Current Investments',n(['non current investments']),nci,false,2,D),
        fsRow('Deferred Tax Assets (Net)',n(['deferred tax asset']),dta,false,2,D),
        fsRow('Long-Term Loans and Advances',n(['long term loans']),ltl,false,2,D),
        fsRow('Other Non-Current Assets',null,onca,false,2,D),
        fsRow('Sub-total — Non-Current Assets',null,ncaT,true,0,D),
        subhdr('(2) Current Assets'),
        fsRow('Inventories',n(['inventories','stock']),inv,false,2,D),
        fsRow('Trade Receivables',n(['trade receivables','debtors']),tr,false,2,D),
        fsRow('Current Investments',n(['current investments']),ci,false,2,D),
        fsRow('Cash and Bank Balances',n(['cash']),cash,false,2,D),
        fsRow('Short-Term Loans and Advances',n(['short-term loans']),stl,false,2,D),
        fsRow('Other Current Assets',n(['other current assets']),oca,false,2,D),
        fsRow('Sub-total — Current Assets',null,caT,true,0,D),
        fsRow('TOTAL — ASSETS',null,totA,true,0,D),
      ],
    }),
    pageBreak(),
  ];
}
 
// ── P&L in Word ───────────────────────────────────────────────────────────────
function buildPL(plLines, divisor, method) {
  const lines = plLines || [];
  const g=(kw)=>lines.filter(l=>kw.some(k=>l.groupName?.toLowerCase().includes(k.toLowerCase()))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const n=(kw)=>lines.find(l=>kw.some(k=>l.groupName?.toLowerCase().includes(k.toLowerCase())))?.noteGroup?.noteNumber;
  const D=divisor;
  const rev=g(['revenue from operations','revenue from contracts','turnover']), oi=g(['other income']), totRev=rev+oi;
  const mat=g(['cost of materials','material cost','purchases of stock','cost of sales','cost of goods']), emp=g(['employee','salary','wages']), fin=g(['finance cost','interest expense']), dep=g(['depreciation','amortisation','amortization']), oe=g(['other expenses']), totExp=mat+emp+fin+dep+oe;
  const ebit=totRev-totExp, exc=g(['exceptional']), pbt=ebit-exc, tax=g(['tax expense','tax expense:']), pat=pbt-tax;
 
  return [
    sectionTitle(method==='IFRS'||method==='IFRS_SME'?'Statement of Comprehensive Income':'Statement of Profit and Loss'),
    new Paragraph({children:[new TextRun({text:'for the year ended 31st March',size:20,color:'64748b'})],alignment:AlignmentType.CENTER,spacing:{after:160}}),
    new Table({
      width:{size:100,type:WidthType.PERCENTAGE},
      rows:[
        new TableRow({tableHeader:true,children:[
          new TableCell({children:[new Paragraph({children:[new TextRun({text:'Particulars',bold:true,size:22,color:'ffffff'})],shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'}})],width:{size:65,type:WidthType.PERCENTAGE}}),
          new TableCell({children:[new Paragraph({children:[new TextRun({text:'Note',bold:true,size:22,color:'ffffff'})],alignment:AlignmentType.CENTER,shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'}})],width:{size:10,type:WidthType.PERCENTAGE}}),
          new TableCell({children:[new Paragraph({children:[new TextRun({text:'Amount',bold:true,size:22,color:'ffffff'})],alignment:AlignmentType.RIGHT,shading:{type:ShadingType.SOLID,color:'1e293b',fill:'1e293b'}})],width:{size:25,type:WidthType.PERCENTAGE}}),
        ]}),
        fsRow('I. REVENUE',null,null,true,0,D),
        fsRow('Revenue from Operations',n(['revenue from operations','turnover']),rev,false,2,D),
        fsRow('Other Income',n(['other income']),oi,false,2,D),
        fsRow('Total Revenue (I)',null,totRev,true,0,D),
        fsRow('II. EXPENSES',null,null,true,0,D),
        fsRow('Cost of Materials / Purchases',n(['cost of material','purchases']),mat,false,2,D),
        fsRow('Employee Benefit Expenses',n(['employee']),emp,false,2,D),
        fsRow('Finance Costs',n(['finance cost']),fin,false,2,D),
        fsRow('Depreciation and Amortisation',n(['depreciation']),dep,false,2,D),
        fsRow('Other Expenses',n(['other expenses']),oe,false,2,D),
        fsRow('Total Expenses (II)',null,totExp,true,0,D),
        fsRow('Profit Before Exceptional Items and Tax',null,ebit,true,0,D),
        ...(exc!==0?[fsRow('Exceptional Items',n(['exceptional']),exc,false,2,D)]:[] ),
        fsRow('Profit Before Tax',null,pbt,true,0,D),
        fsRow('III. TAX EXPENSE',null,null,true,0,D),
        fsRow('Current Tax',null,tax*0.8,false,2,D),
        fsRow('Deferred Tax',null,tax*0.2,false,2,D),
        fsRow('Total Tax Expense',null,tax,true,0,D),
        fsRow('Profit / (Loss) for the Year',null,pat,true,0,D),
      ],
    }),
    pageBreak(),
  ];
}
 
// ── Notes in Word ─────────────────────────────────────────────────────────────
function buildNotes(noteGroups, divisor) {
  const D = divisor;
  const sections = [sectionTitle('Notes to Financial Statements')];
 
  for (const note of noteGroups) {
    // Skip notes where total is zero
    if (Math.abs(Number(note.total)) < 0.005) continue;
 
    sections.push(new Paragraph({
      children: [new TextRun({ text: `Note ${note.noteNumber} — ${note.title}`, bold: true, size: 24, color: '4f46e5' })],
      spacing: { before: 200, after: 100 },
    }));
 
    const rows = [
      new TableRow({ tableHeader: true, children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Particulars', bold: true, size: 20, color: 'ffffff' })], shading: { type: ShadingType.SOLID, color: '334155', fill: '334155' } })], width: { size: 75, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Amount', bold: true, size: 20, color: 'ffffff' })], alignment: AlignmentType.RIGHT, shading: { type: ShadingType.SOLID, color: '334155', fill: '334155' } })], width: { size: 25, type: WidthType.PERCENTAGE } }),
      ]}),
    ];
 
    // Export: show ONLY group heading (subGroupName) + subtotal — NO ledger rows
    if (note.subGroups && note.subGroups.length > 0) {
      for (const sg of note.subGroups) {
        // Skip zero subtotal subgroups
        if (Math.abs(Number(sg.subtotal)) < 0.005) continue;
 
        if (note.subGroups.filter(s => Math.abs(Number(s.subtotal)) >= 0.005).length > 1) {
          // Show subgroup heading + subtotal as a row
          rows.push(new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sg.subGroupName, size: 18 })] })], width: { size: 75, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: fmtNum(sg.subtotal, D, true), size: 18 })], alignment: AlignmentType.RIGHT })], width: { size: 25, type: WidthType.PERCENTAGE } }),
          ]}));
        }
      }
    }
 
    // Total row — always show
    rows.push(new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Total — ${note.title}`, bold: true, size: 20 })], shading: { type: ShadingType.SOLID, color: 'e0e7ff', fill: 'e0e7ff' } })], width: { size: 75, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: fmtNum(note.total, D, true), bold: true, size: 20 })], alignment: AlignmentType.RIGHT, shading: { type: ShadingType.SOLID, color: 'e0e7ff', fill: 'e0e7ff' } })], width: { size: 25, type: WidthType.PERCENTAGE } }),
    ]}));
 
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    sections.push(new Paragraph({ text: '', spacing: { after: 160 } }));
  }
 
  sections.push(pageBreak());
  return sections;
}
 
// ── MAIN EXPORT FUNCTION ──────────────────────────────────────────────────────
async function exportWord(engagementId, firmId) {
  // Raw SQL - avoids broken Prisma relation after db pull
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.cin, c.pan, c.gstin,
            c."tradeLicense", c."vatNumber", c.region as "clientRegion"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
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
 
  const [sections, _rawWordFsLines, noteGroups] = await Promise.all([
    prisma.reportSection.findMany({
      where: { engagementId },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.fSLine.findMany({
      where: { engagementId },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.noteGroup.findMany({
      where: { engagementId },
      orderBy: { noteNumber: 'asc' },
      include: {
        noteDetails: { orderBy: [{ subGroupNo: 'asc' }, { displayOrder: 'asc' }] },
      },
    }),
  ]);
 
  // Join FSLines with NoteGroups (no Prisma relation after db pull)
  const _ngByGroupId = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const fsLines = _rawWordFsLines.map(l => ({
    ...l,
    noteGroup: l.noteGroupId ? _ngByGroupId.get(l.noteGroupId) || null : null,
  }));
 
  const D = 1; // Actual amounts in Word export
 
  const bsLines  = fsLines.filter(l => l.sheet === 'BS' && !l.groupName?.startsWith('__'));
  const plLines  = fsLines.filter(l => l.sheet === 'PL' && !l.groupName?.startsWith('__'));
 
  // Structure notes
  const structuredNotes = noteGroups
    .filter(ng => !ng.noteGroupId?.startsWith('__') && !ng.title?.startsWith('__'))
    .map(ng => ({
      noteNumber: ng.noteNumber,
      title: ng.title,
      total: ng.noteDetails.reduce((s,d)=>s+Number(d.finalNet),0),
      subGroups: collapseNotes(ng.noteDetails),
    }));
 
  // Get section content map
  const sectionMap = {};
  for (const s of sections) { sectionMap[s.sectionType] = s; }
 
  // Build document children in order
  const children = [];
  const visibleSections = sections.filter(s => s.isVisible).sort((a,b)=>a.displayOrder-b.displayOrder);
 
  for (const section of visibleSections) {
    switch (section.sectionType) {
      case 'FIRST_PAGE':
        children.push(...buildFrontPage(engagement, section.content));
        break;
 
      case 'TABLE_OF_CONTENTS':
        children.push(...buildTOC(visibleSections));
        break;
 
      case 'DIRECTOR_REPORT':
        children.push(sectionTitle(section.title));
        children.push(...htmlToParagraphs(section.content));
        children.push(pageBreak());
        break;
 
      case 'AUDITOR_REPORT':
        children.push(sectionTitle(section.title));
        children.push(...htmlToParagraphs(section.content));
        children.push(pageBreak());
        break;
 
      case 'FINANCIAL_STATEMENTS':
        children.push(sectionTitle('Financial Statements'));
        children.push(...buildBS(bsLines, D, engagement.method));
        children.push(...buildPL(plLines, D, engagement.method));
        break;
 
      case 'ACCOUNTING_POLICY':
        children.push(sectionTitle(section.title));
        children.push(...htmlToParagraphs(section.content));
        children.push(pageBreak());
        break;
 
      case 'SUGGESTIONS':
        children.push(sectionTitle(section.title));
        children.push(...htmlToParagraphs(section.content));
        children.push(pageBreak());
        break;
 
      case 'NOTES':
        children.push(...buildNotes(structuredNotes, D));
        break;
 
      case 'THANK_YOU':
        children.push(new Paragraph({ text: '', spacing: { after: 1200 } }));
        children.push(new Paragraph({
          children: [new TextRun({ text: section.content ? stripHtml(section.content) : 'Thank You', bold: true, size: 48, color: '6366f1' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `— ${engagement.client?.name || 'Company'} Management`, size: 24, color: '64748b' })],
          alignment: AlignmentType.CENTER,
        }));
        break;
    }
  }
 
  const doc = new Document({
    creator:  'FinStatement SaaS',
    title:    `${engagement.client?.name} — Annual Report ${engagement.financialYear}`,
    subject:  `Financial Statements — ${engagement.method}`,
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25) },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `${engagement.client?.name || ''} — FY ${engagement.financialYear}  |  Page `, size: 18, color: '94a3b8' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '94a3b8' }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });
 
  return Packer.toBuffer(doc);
}
 
function collapseNotes(details) {
  const groups = new Map();
  for (const d of details) {
    const key = d.subGroupName || 'Other';
    if (!groups.has(key)) groups.set(key, { subGroupName: key, rows: [], subtotal: 0 });
    const g = groups.get(key);
    g.rows.push({ accountNumber: d.accountNumber, accountName: d.accountName, finalNet: Number(d.finalNet) });
    g.subtotal += Number(d.finalNet);
  }
  return [...groups.values()];
}
 
// ── Excel export ──────────────────────────────────────────────────────────────
async function exportExcel(engagementId, firmId) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinStatement SaaS';
 
  const engRows2 = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.cin, c.pan, c.gstin,
            c."tradeLicense", c."vatNumber", c.region as "clientRegion"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows2.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
  const engRow2 = engRows2[0];
  const engagement = {
    ...engRow2,
    client: { name: engRow2.clientName, cin: engRow2.cin, pan: engRow2.pan,
              gstin: engRow2.gstin, tradeLicense: engRow2.tradeLicense,
              vatNumber: engRow2.vatNumber, region: engRow2.clientRegion },
  };
  if (!engagement) throw Object.assign(new Error('Not found'), { status: 404 });
 
  const rawLines = await prisma.fSLine.findMany({
    where: { engagementId },
    orderBy: { displayOrder: 'asc' },
  });
  const noteGroupsForJoin = await prisma.noteGroup.findMany({ where: { engagementId } });
  const ngMapForJoin = new Map(noteGroupsForJoin.map(ng => [ng.noteGroupId, ng]));
  const fsLines = rawLines.map(l => ({
    ...l,
    noteGroup: l.noteGroupId ? ngMapForJoin.get(l.noteGroupId) || null : null,
  }));
 
  const bsLines = fsLines.filter(l => l.sheet === 'BS');
  const plLines = fsLines.filter(l => l.sheet === 'PL');
 
  const style = { font: { name: 'Calibri', size: 11 } };
  const bold  = { font: { name: 'Calibri', size: 11, bold: true } };
  const hdrStyle = { font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }, alignment: { horizontal: 'center' } };
 
  // ── BS Sheet ──
  const bsSheet = wb.addWorksheet('Balance Sheet');
  bsSheet.columns = [{ width: 50 }, { width: 10 }, { width: 20 }];
  const addBSRow = (label, note, amount, isBold) => {
    const row = bsSheet.addRow([label, note || '', amount !== undefined ? amount : '']);
    if (isBold) { row.font = { bold: true, name: 'Calibri', size: 11 }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; }
    if (amount !== undefined && amount !== '') { row.getCell(3).numFmt = '#,##0.00'; row.getCell(3).alignment = { horizontal: 'right' }; }
    row.getCell(2).alignment = { horizontal: 'center' };
  };
 
  bsSheet.addRow(['Balance Sheet', '', '']).font = { bold: true, size: 14, name: 'Calibri' };
  bsSheet.addRow(['as at 31st March', '', '']);
  bsSheet.addRow([]);
  ['Particulars','Note','Amount (₹)'].forEach((h,i) => { const c = bsSheet.getRow(4).getCell(i+1); c.value = h; Object.assign(c, hdrStyle); });
 
  for (const line of bsLines) {
    addBSRow(line.groupName, line.noteGroup?.noteNumber, Number(line.totalFinalNet), false);
  }
 
  // ── P&L Sheet ──
  const plSheet = wb.addWorksheet('Profit and Loss');
  plSheet.columns = [{ width: 50 }, { width: 10 }, { width: 20 }];
  ['Particulars','Note','Amount (₹)'].forEach((h,i) => { const c = plSheet.getRow(1).getCell(i+1); c.value = h; Object.assign(c, hdrStyle); });
  for (const line of plLines) {
    const row = plSheet.addRow([line.groupName, line.noteGroup?.noteNumber || '', Number(line.totalFinalNet)]);
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };
  }
 
  // ── Notes Sheet ──
  const notesSheet = wb.addWorksheet('Notes');
  const noteGroups = await prisma.noteGroup.findMany({
    where: { engagementId },
    orderBy: { noteNumber: 'asc' },
    include: { noteDetails: { orderBy: { displayOrder: 'asc' } } },
  });
  notesSheet.columns = [{ width: 10 }, { width: 50 }, { width: 20 }];
  let notesRow = 1;
  for (const ng of noteGroups.filter(n=>!n.noteGroupId?.startsWith('__'))) {
    const hRow = notesSheet.getRow(notesRow++);
    hRow.getCell(1).value = `Note ${ng.noteNumber}`;
    hRow.getCell(2).value = ng.title;
    hRow.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF4F46E5' } };
    for (const d of ng.noteDetails) {
      const r = notesSheet.getRow(notesRow++);
      r.getCell(2).value = d.accountName || d.accountNumber;
      r.getCell(3).value = Number(d.finalNet);
      r.getCell(3).numFmt = '#,##0.00';
      r.getCell(3).alignment = { horizontal: 'right' };
    }
    const totRow = notesSheet.getRow(notesRow++);
    totRow.getCell(2).value = `Total — ${ng.title}`;
    totRow.getCell(3).value = ng.noteDetails.reduce((s,d)=>s+Number(d.finalNet),0);
    totRow.getCell(3).numFmt = '#,##0.00';
    totRow.getCell(3).alignment = { horizontal: 'right' };
    totRow.font = { bold: true, name: 'Calibri', size: 11 };
    notesRow++;
  }
 
  return wb.xlsx.writeBuffer();
}
 
// ── PDF Export — generates HTML then sends to frontend for print ──────────────
async function exportPDFData(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.name as "clientName", c.id as "clientId", c.cin, c.pan, c.gstin,
            c."tradeLicense", c."vatNumber", c.region as "clientRegion"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
  const engRow   = engRows[0];
  const fsLines  = await prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } });
  const noteGroups = await prisma.noteGroup.findMany({ where: { engagementId }, orderBy: { noteNumber: 'asc' } });
  const noteDetails = await prisma.noteDetail.findMany({ where: { engagementId } });
  return {
    engagement: { ...engRow, clientName: engRow.clientName },
    fsLines, noteGroups, noteDetails,
  };
}
 
module.exports = { exportWord, exportExcel, exportPDFData };