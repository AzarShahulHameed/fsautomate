'use strict';

const xlsx    = require('xlsx');
const crypto  = require('crypto');
const { prisma } = require('../config/db');
const mappingService = require('./mapping.service');

const MAX_VERSIONS = 5;

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
  }).filter(r => r.subGrouping && r.subGrouping.length > 0); // only need subGrouping to be present
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
  const engagement = engRows[0];

  const hash       = checksum(fileBuffer);
  const parsedRows = parseTBBuffer(fileBuffer);

  console.log(`[TB Upload] Valid rows after filter: ${parsedRows.length}`);

  if (parsedRows.length === 0) {
    throw Object.assign(
      new Error('TB file has no valid rows. Make sure your file has a "Sub-grouping" column with data, and a "Final Net" or "Final-Net" column.'),
      { status: 422 }
    );
  }

  return await prisma.$transaction(async (tx) => {
    const existingVersions = await tx.tBVersion.findMany({
      where: { engagementId },
      orderBy: { versionNumber: 'asc' },
      include: { rows: { select: { accountNumber: true, finalNet: true } } },
    });

    if (existingVersions.length >= MAX_VERSIONS) {
      const oldest = existingVersions[0];
      await tx.tBVersionDiff.deleteMany({ where: { tbVersionId: oldest.id } });
      await tx.tBRow.deleteMany({ where: { tbVersionId: oldest.id } });
      await tx.tBVersion.delete({ where: { id: oldest.id } });
      existingVersions.shift();
    }

    const newVersionNumber = existingVersions.length > 0
      ? existingVersions[existingVersions.length - 1].versionNumber + 1
      : 1;

    const newVersion = await tx.tBVersion.create({
      data: {
        engagementId,
        versionNumber:  newVersionNumber,
        uploadedByRef,
        rowCount:       parsedRows.length,
        checksum:       hash,
        isPriorYear:    isPriorYear || false,
        label:          label || (isPriorYear ? 'Prior Year' : `Version ${newVersionNumber}`),
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

    if (existingVersions.length > 0) {
      const prevRows = existingVersions[existingVersions.length - 1].rows;
      const diffs    = computeDiffs(
        prevRows.map(r => ({ accountNumber: r.accountNumber, finalNet: Number(r.finalNet) })),
        parsedRows
      );
      if (diffs.length > 0) {
        await tx.tBVersionDiff.createMany({ data: diffs.map(d => ({ ...d, tbVersionId: newVersion.id })) });
      }
    }

    return newVersion;
  });
}

async function getLatestTBRows(engagementId, firmId) {
  const engagement = await prisma.engagement.findFirst({
    where: { id: engagementId, client: { firmId } },
  });
  if (!engagement) throw Object.assign(new Error('Not found'), { status: 404 });

  return prisma.tBVersion.findFirst({
    where: { engagementId },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
}

async function getVersionHistory(engagementId, firmId) {
  const engagement = await prisma.engagement.findFirst({
    where: { id: engagementId, client: { firmId } },
  });
  if (!engagement) throw Object.assign(new Error('Not found'), { status: 404 });

  return prisma.tBVersion.findMany({
    where: { engagementId },
    orderBy: { versionNumber: 'desc' },
    include: { diffs: true, _count: { select: { rows: true } } },
  });
}

module.exports = { uploadTB, getLatestTBRows, getVersionHistory };
