// src/services/notes.service.js
// ─────────────────────────────────────────────────────────────────────────────
// NOTES GENERATION SERVICE — MNC Architecture
//
// Core principle: Notes are derived from FSLine (the authoritative aggregated
// source), NOT re-computed from raw TB rows. This eliminates the consistency
// risk between FS generation and note generation.
//
// Pipeline:
//   FSLine (CY only, isPriorYear:false)
//     → filter to noteGroupIds that should show notes (suppression rules)
//     → for each noteGroupId, fetch TB rows via Mapping index
//     → write NoteDetail per TB row
//     → validate: sum(NoteDetail) == FSLine.totalFinalNet
//
// Suppression rules (method-aware):
//   - P&L expense items: never show as standalone notes (on face of P&L already)
//   - Revenue: only for IFRS (IFRS 15 disaggregation required)
//   - OCI items: only for Ind AS / IFRS
//   - Zero-balance notes: suppressed (no meaningful disclosure)
//   - Internal placeholders (__*): always suppressed
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { prisma } = require('../config/db');

// ── Note suppression registry ─────────────────────────────────────────────────
// P&L expense items — shown on face of P&L, no standalone note needed
const PL_SUPPRESS_ALWAYS = new Set([
  'NG-MATERIAL-COST',
  'NG-PURCHASES',
  'NG-INV-CHANGE',
  'NG-EMPLOYEE-COST',
  'NG-DEPRECIATION',
  'NG-FINANCE-COST',
  'NG-OTHER-EXPENSES',
  'NG-EXCEPTIONAL',
  'NG-TAX',
]);

// Revenue note: IFRS 15 requires disaggregation → show for IFRS only
const PL_REVENUE_IDS = new Set(['NG-REVENUE', 'NG-REVENUE-IFRS15']);

// OCI: only Ind AS / IFRS
const OCI_IDS = new Set(['NG-OCI-DB', 'NG-OCI-FV', 'NG-OCI-PERM', 'NG-OCI-TEMP']);

function shouldSuppressNote(noteGroupId, method, total) {
  if (!noteGroupId)                       return true;
  if (noteGroupId.startsWith('__'))       return true;
  if (PL_SUPPRESS_ALWAYS.has(noteGroupId)) return true;

  // Zero-balance: suppress unless Share Capital (may legitimately be nil)
  if (Math.abs(total) < 0.01 && noteGroupId !== 'NG-SHARE-CAPITAL') return true;

  if (PL_REVENUE_IDS.has(noteGroupId))
    return !(method === 'IFRS' || method === 'IFRS_SME');

  if (OCI_IDS.has(noteGroupId))
    return !(method === 'IND_AS' || method === 'IFRS' || method === 'IFRS_SME');

  return false;
}

// ── Display sign (must match fs.service.js convention) ───────────────────────
function displaySign(rawAmount, al) {
  const n = Number(rawAmount || 0);
  if (al === 'Liabilities' || al === 'Equity' || al === 'Income') return -n;
  return n;
}

// ── Generate NoteDetails from FSLine (authoritative source) ───────────────────
async function generateNotes(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.id FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { method: true },
  });
  const method = engagement?.method || 'AS';

  // ── Source of truth: CY FSLines only ─────────────────────────────────────
  const [cyFSLines, cyTB, mappings, noteGroups] = await Promise.all([
    prisma.fSLine.findMany({
      where:   { engagementId, isPriorYear: false },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.tBVersion.findFirst({
      where:   { engagementId, isPriorYear: false },
      orderBy: { versionNumber: 'desc' },
      include: { rows: true },
    }),
    prisma.mapping.findMany({ where: { engagementId } }),
    prisma.noteGroup.findMany({ where: { engagementId } }),
  ]);

  if (!cyTB) throw Object.assign(new Error('No current year TB found'), { status: 422 });
  if (!cyFSLines.length) throw Object.assign(new Error('Generate Financial Statements first'), { status: 422 });

  // ── Build indexes ─────────────────────────────────────────────────────────
  // FSLine by noteGroupId — the amount source
  const fsLineByNG    = new Map(cyFSLines.filter(l => l.noteGroupId).map(l => [l.noteGroupId, l]));
  // Mapping by subGrouping (uppercase) — links TB rows to noteGroupIds
  const mappingIndex  = new Map(mappings.map(m => [m.subGrouping.trim().toUpperCase(), m]));
  // NoteGroup by noteGroupId
  const noteGroupIndex = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));

  // ── Determine which noteGroupIds have non-zero amounts (from FSLine) ───────
  const activeNoteGroupIds = new Set();
  for (const [ngId, fsLine] of fsLineByNG) {
    const total = Number(fsLine.totalFinalNet);
    if (!shouldSuppressNote(ngId, method, total)) {
      activeNoteGroupIds.add(ngId);
    }
  }

  // ── Group TB rows by noteGroupId ──────────────────────────────────────────
  // This gives us the sub-group breakup for each note
  const tbRowsByNG = new Map();
  for (const row of cyTB.rows) {
    const mapping = mappingIndex.get(row.subGrouping.trim().toUpperCase());
    if (!mapping?.noteGroupId) continue;
    if (!activeNoteGroupIds.has(mapping.noteGroupId)) continue;

    const fsLine = fsLineByNG.get(mapping.noteGroupId);
    if (!fsLine) continue;

    const net = displaySign(Number(row.finalNet || 0), fsLine.assetLiability);

    if (!tbRowsByNG.has(mapping.noteGroupId)) {
      tbRowsByNG.set(mapping.noteGroupId, []);
    }
    tbRowsByNG.get(mapping.noteGroupId).push({
      engagementId,
      noteGroupId:   mapping.noteGroupId,
      subGroupNo:    mapping.subGroupNo || null,
      subGroupName:  row.subGrouping,
      accountNumber: row.accountNumber,
      accountName:   row.accountName,
      finalNet:      net,
    });
  }

  // ── Persist: delete old, bulk-insert new ─────────────────────────────────
  await prisma.noteDetail.deleteMany({ where: { engagementId } });

  // Remove NoteGroups that are now suppressed
  const suppressedIds = noteGroups
    .map(ng => ng.noteGroupId)
    .filter(id => !activeNoteGroupIds.has(id) && !id.startsWith('__'));

  if (suppressedIds.length > 0) {
    await prisma.noteGroup.deleteMany({
      where: {
        engagementId,
        noteGroupId: { in: suppressedIds },
        isMandatory: false,
      },
    });
  }

  // Bulk-insert NoteDetails ordered by FSLine displayOrder
  const noteDetailRows = [];
  let displayOrder = 1;

  // Iterate in FSLine display order so note details are ordered correctly
  for (const fsLine of cyFSLines) {
    const ngId = fsLine.noteGroupId;
    if (!ngId || !activeNoteGroupIds.has(ngId)) continue;
    const rows = tbRowsByNG.get(ngId) || [];
    for (const row of rows) {
      noteDetailRows.push({ ...row, displayOrder: displayOrder++ });
    }
  }

  if (noteDetailRows.length > 0) {
    await prisma.noteDetail.createMany({ data: noteDetailRows, skipDuplicates: true });
  }

  // ── Validate: note totals must equal FSLine totals ────────────────────────
  await validateNoteTotals(engagementId, cyTB.id);

  return {
    created:    noteDetailRows.length,
    suppressed: suppressedIds.length,
    notes:      activeNoteGroupIds.size,
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
    include: { noteDetails: { orderBy: [{ displayOrder: 'asc' }] } },
  });

  return noteGroups
    .filter(ng => !ng.noteGroupId?.startsWith('__') && !ng.title?.startsWith('__'))
    .map(ng => ({
      noteNumber:  ng.noteNumber,
      noteGroupId: ng.noteGroupId,
      title:       ng.title,
      isMandatory: ng.isMandatory,
      total:       ng.noteDetails.reduce((s, d) => s + Number(d.finalNet), 0),
      subGroups:   collapseBySubGroup(ng.noteDetails),
    }));
}

// ── Collapse rows into sub-group buckets ──────────────────────────────────────
function collapseBySubGroup(details) {
  const groups = new Map();
  for (const d of details) {
    const key = d.subGroupName || d.accountName || 'Other';
    if (!groups.has(key)) {
      groups.set(key, { subGroupName: key, subGroupNo: d.subGroupNo || '', rows: [], subtotal: 0 });
    }
    const g = groups.get(key);
    g.rows.push({ accountNumber: d.accountNumber || '', accountName: d.accountName || '', finalNet: Number(d.finalNet || 0) });
    g.subtotal += Number(d.finalNet || 0);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.subGroupNo && b.subGroupNo) return a.subGroupNo.localeCompare(b.subGroupNo);
    return a.subGroupName.localeCompare(b.subGroupName);
  });
}

// ── Validate note totals match FSLine totals ──────────────────────────────────
async function validateNoteTotals(engagementId, tbVersionId) {
  const [fsLines, noteDetails] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId, isPriorYear: false } }),
    prisma.noteDetail.findMany({ where: { engagementId } }),
  ]);

  const noteGroupTotals = new Map();
  for (const d of noteDetails) {
    noteGroupTotals.set(d.noteGroupId, (noteGroupTotals.get(d.noteGroupId) || 0) + Number(d.finalNet));
  }

  const records = [];
  for (const line of fsLines) {
    if (!line.noteGroupId) continue;
    const noteTotal = noteGroupTotals.get(line.noteGroupId) || 0;
    const fsTotal   = Number(line.totalFinalNet);
    const diff      = Math.abs(noteTotal - fsTotal);
    records.push({
      engagementId, tbVersionId,
      checkType: 'NOTES_TOTAL',
      status:    diff < 0.01 ? 'PASS' : 'FAIL',
      message:   diff < 0.01
        ? `Note for ${line.groupName} matches FS total`
        : `Mismatch: FS=${fsTotal.toFixed(2)}, Notes=${noteTotal.toFixed(2)}, Diff=${diff.toFixed(2)}`,
      detail: { groupName: line.groupName, fsTotal, noteTotal, diff },
    });
  }

  if (records.length > 0) {
    await prisma.validationLog.createMany({ data: records });
  }
}

module.exports = { generateNotes, getNotes };
