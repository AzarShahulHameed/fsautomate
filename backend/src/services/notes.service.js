// src/services/notes.service.js
// ─────────────────────────────────────────────────────────────────────────────
// NOTES GENERATION SERVICE
//
// MNC-level note logic:
//   1. Only BS noteGroupIds generate standalone notes by default.
//      P&L items (Expenses, Depreciation, Finance Cost, Tax) are shown on the
//      face of the P&L and do NOT need a separate note.
//   2. Revenue gets a note only for IFRS (IFRS 15 disaggregation required)
//      and optionally for AS/Ind AS if the engagement has Revenue mapped.
//   3. Other Income gets a note for all methods (it's a Schedule III requirement).
//   4. Notes with zero total are suppressed unless mandatory.
//   5. Only CY TB rows are used (isPriorYear: false) — PY data is for comparison only.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
 
const { prisma } = require('../config/db');
 
// ── Note suppression rules ────────────────────────────────────────────────────
// These noteGroupIds are P&L line items — they appear on the face of the
// P&L already. They should NOT generate standalone notes.
// Exception: revenue notes required for IFRS (IFRS 15), optional for AS/Ind AS.
const PL_SUPPRESS_ALWAYS = new Set([
  'NG-MATERIAL-COST',   // Cost of materials — shown on face of P&L
  'NG-PURCHASES',       // Purchases of stock — shown on face of P&L
  'NG-INV-CHANGE',      // Changes in inventory — shown on face of P&L
  'NG-EMPLOYEE-COST',   // Employee benefit expenses — shown on face of P&L
  'NG-DEPRECIATION',    // Depreciation — shown on face of P&L
  'NG-FINANCE-COST',    // Finance costs — shown on face of P&L
  'NG-OTHER-EXPENSES',  // Other expenses — shown on face of P&L
  'NG-EXCEPTIONAL',     // Exceptional items — shown on face of P&L
  'NG-TAX',             // Tax expense — shown on face of P&L
]);
 
// Revenue note: required for IFRS (disaggregation), optional for AS/Ind AS
const PL_REVENUE_IDS = new Set([
  'NG-REVENUE',
  'NG-REVENUE-IFRS15',
]);
 
// Other income: standalone note for all methods (Schedule III requirement)
const OTHER_INCOME_IDS = new Set([
  'NG-OTHER-INCOME',
]);
 
// OCI items — include in notes for Ind AS / IFRS
const OCI_IDS = new Set([
  'NG-OCI-DB', 'NG-OCI-FV', 'NG-OCI-PERM', 'NG-OCI-TEMP',
]);
 
function shouldSuppressNote(noteGroupId, method, total) {
  if (!noteGroupId) return true;
 
  // Always suppress internal placeholders
  if (noteGroupId.startsWith('__')) return true;
 
  // Suppress zero-balance notes (no meaningful disclosure)
  // Exception: Share capital always shows even if zero (unlikely but defensive)
  if (Math.abs(total) < 0.01 && noteGroupId !== 'NG-SHARE-CAPITAL') {
    return true;
  }
 
  // P&L expense items — always suppress (shown on face of P&L)
  if (PL_SUPPRESS_ALWAYS.has(noteGroupId)) return true;
 
  // Revenue notes — only show for IFRS (IFRS 15 requirement)
  // For AS/Ind AS, Revenue is already on the face of the P&L
  if (PL_REVENUE_IDS.has(noteGroupId)) {
    return !(method === 'IFRS' || method === 'IFRS_SME');
  }
 
  // OCI items — only show for Ind AS / IFRS
  if (OCI_IDS.has(noteGroupId)) {
    return !(method === 'IND_AS' || method === 'IFRS' || method === 'IFRS_SME');
  }
 
  // Everything else (BS notes) — show if non-zero
  return false;
}
 
// ── Sign convention ───────────────────────────────────────────────────────────
function displaySign(rawAmount, al) {
  const n = Number(rawAmount || 0);
  if (al === 'Liabilities' || al === 'Equity' || al === 'Income') return -n;
  return n;
}
 
// ── Generate NoteDetails ──────────────────────────────────────────────────────
async function generateNotes(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.id FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Not found'), { status: 404 });
 
  // Get engagement method for suppression rules
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { method: true },
  });
  const method = engagement?.method || 'AS';
 
  // ── Use ONLY current year TB ──────────────────────────────────────────────
  const latest = await prisma.tBVersion.findFirst({
    where: { engagementId, isPriorYear: false },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latest) throw Object.assign(new Error('No TB'), { status: 422 });
 
  const [noteGroups, mappings, fsLines] = await Promise.all([
    prisma.noteGroup.findMany({ where: { engagementId } }),
    prisma.mapping.findMany({ where: { engagementId } }),
    prisma.fSLine.findMany({ where: { engagementId, isPriorYear: false } }),
  ]);
 
  const mappingIndex   = new Map(mappings.map(m => [m.subGrouping.trim().toUpperCase(), m]));
  const noteGroupIndex = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const fsLineByNG     = new Map(fsLines.map(l => [l.noteGroupId, l.assetLiability]));
 
  // ── Compute per-noteGroupId totals first (for suppression check) ──────────
  const noteGroupTotals = new Map();
  for (const row of latest.rows) {
    const mapping = mappingIndex.get(row.subGrouping.trim().toUpperCase());
    if (!mapping?.noteGroupId) continue;
    const al  = fsLineByNG.get(mapping.noteGroupId) || 'Assets';
    const net = displaySign(Number(row.finalNet || 0), al);
    noteGroupTotals.set(mapping.noteGroupId, (noteGroupTotals.get(mapping.noteGroupId) || 0) + net);
  }
 
  // ── Determine which notes should be suppressed ────────────────────────────
  const suppressedIds = new Set();
  for (const [ngId, total] of noteGroupTotals) {
    if (shouldSuppressNote(ngId, method, total)) {
      suppressedIds.add(ngId);
    }
  }
  // Also suppress NoteGroups that have zero TB rows mapping to them
  for (const ng of noteGroups) {
    if (!noteGroupTotals.has(ng.noteGroupId)) {
      suppressedIds.add(ng.noteGroupId);
    }
  }
 
  // ── Build NoteDetail rows ─────────────────────────────────────────────────
  await prisma.noteDetail.deleteMany({ where: { engagementId } });
 
  const noteDetailRows = [];
  let displayOrder = 1;
 
  for (const row of latest.rows) {
    const mapping = mappingIndex.get(row.subGrouping.trim().toUpperCase());
    if (!mapping?.noteGroupId) continue;
    if (suppressedIds.has(mapping.noteGroupId)) continue;
 
    const ng = noteGroupIndex.get(mapping.noteGroupId);
    if (!ng) continue;
 
    const al  = fsLineByNG.get(mapping.noteGroupId) || 'Assets';
    const net = displaySign(Number(row.finalNet || 0), al);
 
    noteDetailRows.push({
      engagementId,
      noteGroupId:   mapping.noteGroupId,
      subGroupNo:    mapping.subGroupNo || null,
      subGroupName:  row.subGrouping,
      accountNumber: row.accountNumber,
      accountName:   row.accountName,
      finalNet:      net,
      displayOrder:  displayOrder++,
    });
  }
 
  if (noteDetailRows.length > 0) {
    await prisma.noteDetail.createMany({ data: noteDetailRows });
  }
 
  // ── Remove NoteGroups that are suppressed ─────────────────────────────────
  // So they don't show up in the notes list at all
  if (suppressedIds.size > 0) {
    await prisma.noteDetail.deleteMany({
      where: { engagementId, noteGroupId: { in: [...suppressedIds] } },
    });
    await prisma.noteGroup.deleteMany({
      where: {
        engagementId,
        noteGroupId: { in: [...suppressedIds] },
        isMandatory: false, // never delete mandatory notes
      },
    });
  }
 
  await validateNoteTotals(engagementId, latest.id);
 
  return {
    created:    noteDetailRows.length,
    suppressed: suppressedIds.size,
  };
}
 
// ── Get notes for display ─────────────────────────────────────────────────────
async function getNotes(engagementId, firmId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.id FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
 
  const noteGroups = await prisma.noteGroup.findMany({
    where:   { engagementId },
    orderBy: { noteNumber: 'asc' },
    include: {
      noteDetails: { orderBy: [{ displayOrder: 'asc' }] },
    },
  });
 
  return noteGroups
    .filter(ng => !ng.noteGroupId?.startsWith('__') && !ng.title?.startsWith('__'))
    .map(ng => ({
      noteNumber:  ng.noteNumber,
      noteGroupId: ng.noteGroupId,
      title:       ng.title,
      isMandatory: ng.isMandatory,
      total:       ng.noteDetails.reduce((sum, d) => sum + Number(d.finalNet), 0),
      subGroups:   collapseBySubGroup(ng.noteDetails),
    }));
}
 
// ── Collapse detail rows into sub-group buckets ───────────────────────────────
function collapseBySubGroup(details) {
  const groups = new Map();
  for (const d of details) {
    const key = d.subGroupName || d.accountName || 'Other';
    if (!groups.has(key)) {
      groups.set(key, {
        subGroupName: key,
        subGroupNo:   d.subGroupNo || '',
        rows:         [],
        subtotal:     0,
      });
    }
    const g = groups.get(key);
    g.rows.push({
      accountNumber: d.accountNumber || '',
      accountName:   d.accountName   || '',
      finalNet:      Number(d.finalNet || 0),
    });
    g.subtotal += Number(d.finalNet || 0);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.subGroupNo && b.subGroupNo) return a.subGroupNo.localeCompare(b.subGroupNo);
    return a.subGroupName.localeCompare(b.subGroupName);
  });
}
 
// ── Validate note totals match FS line totals ─────────────────────────────────
async function validateNoteTotals(engagementId, tbVersionId) {
  const [fsLines, noteDetails] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId, isPriorYear: false } }),
    prisma.noteDetail.findMany({ where: { engagementId } }),
  ]);
 
  const noteGroupTotals = new Map();
  for (const d of noteDetails) {
    noteGroupTotals.set(d.noteGroupId, (noteGroupTotals.get(d.noteGroupId) || 0) + Number(d.finalNet));
  }
 
  const validationRecords = [];
  for (const line of fsLines) {
    if (!line.noteGroupId) continue;
    const noteTotal = noteGroupTotals.get(line.noteGroupId) || 0;
    const fsTotal   = Number(line.totalFinalNet);
    const diff      = Math.abs(noteTotal - fsTotal);
    validationRecords.push({
      engagementId,
      tbVersionId,
      checkType: 'NOTES_TOTAL',
      status:    diff < 0.01 ? 'PASS' : 'FAIL',
      message:   diff < 0.01
        ? `Note for ${line.groupName} matches FS total`
        : `Mismatch: FS=${fsTotal.toFixed(2)}, Notes=${noteTotal.toFixed(2)}, Diff=${diff.toFixed(2)}`,
      detail: { groupName: line.groupName, fsTotal, noteTotal, diff },
    });
  }
 
  if (validationRecords.length > 0) {
    await prisma.validationLog.createMany({ data: validationRecords });
  }
}
 
module.exports = { generateNotes, getNotes };