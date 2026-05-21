// src/services/notes.service.js
// ─────────────────────────────────────────────────────────────────────────────
// NOTES GENERATION SERVICE
//
// For each NoteGroup:
//   SELECT SubGroupName, AccountName, FinalNet
//   WHERE note_group_id = current_note
//   ORDER BY sub_group_no
//
// Grouping by SubGroupName = "collapsing" behaviour
// E.g. Borrowings > From Banks, From Others
//
// Validation: Notes total = FS line value
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { prisma } = require('../config/db');

// Flip sign for credit-normal accounts so NoteDetail matches FSLine display
function displaySign(rawAmount, al) {
  const n = Number(rawAmount || 0);
  if (al === 'Liabilities' || al === 'Equity' || al === 'Income') return -n;
  return n;
}

/**
 * Generate NoteDetail lines for all NoteGroups in an engagement.
 * Called after generateFS.
 */
async function generateNotes(engagementId, firmId) {
  // Raw SQL to avoid broken Prisma relation after db pull
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.id FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  const [latest, noteGroups, mappings] = await Promise.all([
    prisma.tBVersion.findFirst({
      where: { engagementId },
      orderBy: { versionNumber: 'desc' },
      include: { rows: true },
    }),
    prisma.noteGroup.findMany({ where: { engagementId } }),
    prisma.mapping.findMany({ where: { engagementId } }),
  ]);

  if (!latest) throw Object.assign(new Error('No TB'), { status: 422 });

  const mappingIndex = new Map(mappings.map(m => [m.subGrouping.trim().toUpperCase(), m]));
  const noteGroupIndex = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));

  // Clear existing note details
  await prisma.noteDetail.deleteMany({ where: { engagementId } });

  const noteDetailRows = [];
  let displayOrder = 1;

  // Build FSLine lookup for assetLiability (to apply correct sign)
  const fsLines = await prisma.fSLine.findMany({ where: { engagementId } });
  const fsLineByNG = new Map(fsLines.map(l => [l.noteGroupId, l.assetLiability]));

  for (const row of latest.rows) {
    const mapping = mappingIndex.get(row.subGrouping.trim().toUpperCase());
    if (!mapping || !mapping.noteGroupId) continue;

    const ng = noteGroupIndex.get(mapping.noteGroupId);
    if (!ng) continue;

    // Apply display sign to match FSLine totalFinalNet
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

  // Run cross-validation: note totals must equal FS line totals
  await validateNoteTotals(engagementId, latest.id);

  return { created: noteDetailRows.length };
}

/**
 * Get notes for display — structured with collapsing by subGroupName
 */
async function getNotes(engagementId, firmId) {
  // Verify access via raw SQL (avoids broken Prisma relation after db pull)
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
      noteDetails: {
        orderBy: [{ displayOrder: 'asc' }],
      },
    },
  });

  // Filter internal placeholders only — keep ALL notes including zero-balance
  const result = noteGroups
    .filter(ng => !ng.noteGroupId?.startsWith('__') && !ng.title?.startsWith('__'))
    .map(ng => ({
      noteNumber:  ng.noteNumber,
      noteGroupId: ng.noteGroupId,
      title:       ng.title,
      isMandatory: ng.isMandatory,
      total:       ng.noteDetails.reduce((sum, d) => sum + Number(d.finalNet), 0),
      subGroups:   collapseBySubGroup(ng.noteDetails),
    }));

  return result;
}

/**
 * Collapse note detail rows into sub-group buckets
 * E.g. From Banks: [row1, row2], From Others: [row3]
 */
function collapseBySubGroup(details) {
  // Group by subGroupName (= TB Sub-Grouping name, e.g. "Cash in Bank", "Cash in Hand")
  // Each group shows as ONE row in the note breakup
  // Individual ledger accounts within each group are shown on second-level expand
  const groups = new Map();
  for (const d of details) {
    // subGroupName is the TB Sub-Grouping name — this is the correct display name
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
  // Sort by subGroupNo then by name
  return [...groups.values()].sort((a, b) => {
    if (a.subGroupNo && b.subGroupNo) return a.subGroupNo.localeCompare(b.subGroupNo);
    return a.subGroupName.localeCompare(b.subGroupName);
  });
}

/**
 * Validate: SUM(noteDetails.finalNet) for each noteGroup = FSLine.totalFinalNet
 */
async function validateNoteTotals(engagementId, tbVersionId) {
  const [fsLines, noteDetails] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId } }),
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
    const fsTotal = Number(line.totalFinalNet);
    const diff = Math.abs(noteTotal - fsTotal);

    validationRecords.push({
      engagementId,
      tbVersionId,
      checkType: 'NOTES_TOTAL',
      status: diff < 0.01 ? 'PASS' : 'FAIL',
      message: diff < 0.01
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
