
'use strict';
 
const xlsx    = require('xlsx');
const crypto  = require('crypto');
const { prisma } = require('../config/db');
const mappingService = require('./mapping.service');
 
const MAX_CY_VERSIONS = 5; // cap only applies to Current Year versions
 
function parseTBBuffer(buffer) {
  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
 
  if (rows.length > 0) {
    console.log('[TB Parser] Columns:', Object.keys(rows[0]));
    console.log('[TB Parser] Row 1 sample:', rows[0]);
  }
 
  return rows.map((r, idx) => {
    const accountNumber = String(
      r['Account Number'] || r['Account_Number'] || r['AccountNumber'] ||
      r['Acct No'] || r['AcctNo'] || r['A/C No'] || r['Sr'] || r['Sr.'] ||
      r['Sr No'] || r['Sr.No'] || idx + 1
    ).trim();
 
    const accountName = String(
      r['Account Name'] || r['Account_Name'] || r['AccountName'] ||
      r['Name'] || r['Description'] || r['Particulars'] || ''
    ).trim();
 
    const grouping = r['Grouping'] || r['Group'] || r['GROUP'] || null;
 
    const subGrouping = String(
      r['Sub Grouping']  || r['Sub-grouping'] || r['Sub-Grouping'] ||
      r['Sub_Grouping']  || r['SubGrouping']  || r['Subgrouping']  ||
      r['SUB GROUPING']  || r['sub grouping'] || r['Sub grouping'] ||
      r['Subgroup']      || r['Sub Group']    || r['sub-grouping'] ||
      r['Sub-grouping '] || // trailing space variant
      ''
    ).trim();
 
    const finalNet = parseFloat(
      r['Final Net']  || r['Final-Net'] || r['FinalNet']  ||
      r['Final_Net']  || r['FINAL NET'] || r['Finalnet']  ||
      r['final net']  || r['final-net'] || r['Final Net ']||
      r['Net']        || 0
    ) || 0;
 
    const debit  = parseFloat(r['Debit']  || r['DEBIT']  || 0) || 0;
    const credit = parseFloat(r['Credit'] || r['CREDIT'] || 0) || 0;
    const net    = parseFloat(r['Net']    || r['NET']    || 0) || 0;
    const aje    = parseFloat(r['Aje'] || r['AJE'] || r['Adjustment'] || 0) || 0;
 
    return { accountNumber: accountNumber || String(idx + 1), accountName, grouping, subGrouping, debit, credit, net, aje, finalNet };
  }).filter(r => r.subGrouping && r.subGrouping.length > 0);
}
 
function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
 
function computeDiffs(oldRows, newRows) {
  const diffs  = [];
  const oldMap = new Map(oldRows.map(r => [r.accountNumber, r]));
  const newMap = new Map(newRows.map(r => [r.accountNumber, r]));
  for (const [acct, oldRow] of oldMap) {
    if (!newMap.has(acct)) diffs.push({ accountNumber: acct, action: 'DELETED', oldFinalNet: oldRow.finalNet, newFinalNet: null });
  }
  for (const [acct, newRow] of newMap) {
    if (!oldMap.has(acct)) diffs.push({ accountNumber: acct, action: 'ADDED', oldFinalNet: null, newFinalNet: newRow.finalNet });
  }
  for (const [acct, newRow] of newMap) {
    const oldRow = oldMap.get(acct);
    if (oldRow && oldRow.finalNet !== newRow.finalNet) {
      diffs.push({ accountNumber: acct, action: 'CHANGED', oldFinalNet: oldRow.finalNet, newFinalNet: newRow.finalNet, fieldChanged: 'finalNet' });
    }
  }
  return diffs;
}
 
async function uploadTB(engagementId, firmId, fileBuffer, uploadedByRef, isPriorYear = false, label = null) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.* FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId" WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
    engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Engagement not found'), { status: 404 });
 
  const hash       = checksum(fileBuffer);
  const parsedRows = parseTBBuffer(fileBuffer);
 
  console.log(`[TB Upload] Valid rows after filter: ${parsedRows.length}, isPriorYear: ${isPriorYear}`);
 
  if (parsedRows.length === 0) {
    throw Object.assign(
      new Error('TB file has no valid rows. Make sure your file has a "Sub-grouping" column with data, and a "Final Net" or "Final-Net" column.'),
      { status: 422 }
    );
  }
 
  return await prisma.$transaction(async (tx) => {
    if (isPriorYear) {
      // ── PRIOR YEAR UPLOAD ──────────────────────────────────────────────
      // PY is a REPLACE operation — delete any existing PY version and create fresh.
      // PY versions are never counted toward the CY version cap.
      // PY versions are never versioned (no incrementing number) and never diffed.
 
      const existingPY = await tx.tBVersion.findMany({
        where: { engagementId, isPriorYear: true },
      });
 
      for (const old of existingPY) {
        await tx.tBVersionDiff.deleteMany({ where: { tbVersionId: old.id } });
        await tx.tBRow.deleteMany({ where: { tbVersionId: old.id } });
        await tx.tBVersion.delete({ where: { id: old.id } });
      }
 
      const pyVersion = await tx.tBVersion.create({
        data: {
          engagementId,
          versionNumber:  0, // 0 = sentinel for "prior year" — never shown as V0
          uploadedByRef,
          rowCount:       parsedRows.length,
          checksum:       hash,
          isPriorYear:    true,
          label:          label || 'Prior Year',
          rows: {
            create: parsedRows.map(r => ({
              engagementId,
              accountNumber: r.accountNumber,
              accountName:   r.accountName,
              grouping:      r.grouping ? String(r.grouping) : null,
              subGrouping:   r.subGrouping,
              debit:         r.debit,
              credit:        r.credit,
              net:           r.net,
              aje:           r.aje,
              finalNet:      r.finalNet,
            })),
          },
        },
      });
 
      return pyVersion;
    } else {
      // ── CURRENT YEAR UPLOAD ────────────────────────────────────────────
      // Only CY versions count toward MAX_CY_VERSIONS cap.
      // Diffs are computed only between consecutive CY versions.
 
      const existingCYVersions = await tx.tBVersion.findMany({
        where: { engagementId, isPriorYear: false },
        orderBy: { versionNumber: 'asc' },
        include: { rows: { select: { accountNumber: true, finalNet: true } } },
      });
 
      if (existingCYVersions.length >= MAX_CY_VERSIONS) {
        const oldest = existingCYVersions[0];
        await tx.tBVersionDiff.deleteMany({ where: { tbVersionId: oldest.id } });
        await tx.tBRow.deleteMany({ where: { tbVersionId: oldest.id } });
        await tx.tBVersion.delete({ where: { id: oldest.id } });
        existingCYVersions.shift();
      }
 
      const newVersionNumber = existingCYVersions.length > 0
        ? existingCYVersions[existingCYVersions.length - 1].versionNumber + 1
        : 1;
 
      const newVersion = await tx.tBVersion.create({
        data: {
          engagementId,
          versionNumber:  newVersionNumber,
          uploadedByRef,
          rowCount:       parsedRows.length,
          checksum:       hash,
          isPriorYear:    false,
          label:          label || `Version ${newVersionNumber}`,
          rows: {
            create: parsedRows.map(r => ({
              engagementId,
              accountNumber: r.accountNumber,
              accountName:   r.accountName,
              grouping:      r.grouping ? String(r.grouping) : null,
              subGrouping:   r.subGrouping,
              debit:         r.debit,
              credit:        r.credit,
              net:           r.net,
              aje:           r.aje,
              finalNet:      r.finalNet,
            })),
          },
        },
      });
 
      if (existingCYVersions.length > 0) {
        const prevRows = existingCYVersions[existingCYVersions.length - 1].rows;
        const diffs    = computeDiffs(
          prevRows.map(r => ({ accountNumber: r.accountNumber, finalNet: Number(r.finalNet) })),
          parsedRows
        );
        if (diffs.length > 0) {
          await tx.tBVersionDiff.createMany({ data: diffs.map(d => ({ ...d, tbVersionId: newVersion.id })) });
        }
      }
 
      return newVersion;
    }
  });
}
 
async function getLatestTBRows(engagementId, firmId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.id FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`, engagementId, firmId
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
 
  return prisma.tBVersion.findFirst({
    where: { engagementId, isPriorYear: false },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
}
 
async function getVersionHistory(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.id, e.method, e."financialYear", e."clientId",
            c.name as "clientName", c."firmId"
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`, engagementId, firmId
  );
  if (!engRows.length) throw Object.assign(new Error('Not found'), { status: 404 });
 
  const versions = await prisma.tBVersion.findMany({
    where: { engagementId },
    orderBy: [{ isPriorYear: 'asc' }, { versionNumber: 'desc' }],
    include: { _count: { select: { rows: true } } },
  });
 
  // Load diffs only for CY versions
  const cyVersionIds = versions.filter(v => !v.isPriorYear).map(v => v.id);
  let diffs = [];
  if (cyVersionIds.length > 0) {
    const ph = cyVersionIds.map((_, i) => `$${i + 1}`).join(',');
    diffs = await prisma.$queryRawUnsafe(
      `SELECT id, "tbVersionId", "accountNumber", "accountName",
              action::text as action, "oldFinalNet", "newFinalNet", "fieldChanged", "createdAt"
       FROM "TBVersionDiff" WHERE "tbVersionId" IN (${ph})
       ORDER BY "createdAt" ASC`,
      ...cyVersionIds
    );
  }
 
  const diffMap = {};
  for (const d of diffs) {
    if (!diffMap[d.tbVersionId]) diffMap[d.tbVersionId] = [];
    diffMap[d.tbVersionId].push(d);
  }
 
  return versions.map(v => ({ ...v, diffs: diffMap[v.id] || [] }));
}
 
// Get previous year TB for same client — called by Prior Year tab
async function getPreviousYearTB(engagementId, firmId) {
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.*, c.id as cid, e."clientId", e."financialYear", e.method
     FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
     WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`, engagementId, firmId
  );
  if (!engRows.length) return null;
  const eng = engRows[0];
 
  const fy = eng.financialYear || '';
  let prevFY = null;
 
  const match1 = fy.match(/(\d{4})-(\d{2,4})/);
  if (match1) {
    const startYear = parseInt(match1[1]);
    const endShort  = parseInt(match1[2]);
    prevFY = `${startYear - 1}-${String(endShort - 1).padStart(match1[2].length, '0')}`;
  }
 
  const match2 = fy.match(/^(\d{4})$/);
  if (match2) {
    prevFY = String(parseInt(match2[1]) - 1);
  }
 
  if (!prevFY) return null;
 
  const prevEngRows = await prisma.$queryRawUnsafe(
    `SELECT e.id, e.name, e."financialYear", e.method
     FROM "Engagement" e
     WHERE e."clientId" = $1 AND e."financialYear" = $2
     ORDER BY e."createdAt" DESC LIMIT 1`,
    eng.clientId, prevFY
  );
 
  if (!prevEngRows.length) return { found: false, prevFY, message: `No engagement found for ${prevFY}` };
 
  const prevEng = prevEngRows[0];
 
  const prevTB = await prisma.tBVersion.findFirst({
    where: { engagementId: prevEng.id, isPriorYear: false },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
 
  if (!prevTB) return { found: false, prevFY, engagementId: prevEng.id, message: `Engagement found for ${prevFY} but no TB uploaded yet` };
 
  return {
    found: true,
    prevFY,
    prevEngagementId: prevEng.id,
    prevEngagementName: prevEng.name,
    tbVersionId: prevTB.id,
    rowCount: prevTB.rowCount,
    uploadedAt: prevTB.uploadedAt,
    rows: prevTB.rows,
    label: `Prior Year — ${prevFY} (auto-loaded from ${prevEng.name})`,
  };
}
 
module.exports = { uploadTB, getLatestTBRows, getVersionHistory, getPreviousYearTB };
 