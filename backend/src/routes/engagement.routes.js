// src/routes/engagement.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard, requireRole } = require('../middleware/tenant');
const { prisma } = require('../config/db');

router.use(authGuard);

router.get('/client/:clientId', async (req, res, next) => {
  try {
    // Verify client belongs to firm
    const client = await prisma.client.findFirst({ where: { id: req.params.clientId, firmId: req.firmId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const engagements = await prisma.engagement.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tbVersions: true, fsLines: true, noteGroups: true } },
      },
    });
    res.json(engagements);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    // Support both { clientId, name, ... } and nested { clientId: { clientId, ... } }
    let body = req.body;
    // If clientId is an object (old API mismatch), extract from it
    if (body.clientId && typeof body.clientId === 'object') {
      body = { ...body.clientId, ...body };
    }
    const { clientId, name, method, financialYear, currency } = body;

    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({ error: 'clientId is required and must be a string' });
    }

    const client = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Client" WHERE id=$1 AND "firmId"=$2 AND "isActive"=true LIMIT 1`,
      clientId, req.firmId
    );
    if (!client.length) return res.status(404).json({ error: 'Client not found' });

    const engagement = await prisma.engagement.create({
      data: { clientId, name, method, financialYear, currency: currency || 'INR' },
    });

    // Create default report sections
    const sections = getDefaultSections(engagement.id, method);
    await prisma.reportSection.createMany({ data: sections });

    res.status(201).json(engagement);
  } catch (err) { next(err); }
});

router.get('/:engagementId', engagementGuard, async (req, res, next) => {
  try {
    const engagement = await prisma.engagement.findFirst({
      where: { id: req.params.engagementId, client: { firmId: req.firmId } },
      include: {
        client: true,
        tbVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        _count: { select: { fsLines: true, noteGroups: true, validationLogs: true } },
      },
    });
    res.json(engagement);
  } catch (err) { next(err); }
});

router.patch('/:engagementId/lock', engagementGuard, requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await prisma.engagement.update({ where: { id: req.params.engagementId }, data: { isLocked: req.body.lock } });
    res.json({ locked: req.body.lock });
  } catch (err) { next(err); }
});

// Get validation logs
router.get('/:engagementId/validation', engagementGuard, async (req, res, next) => {
  try {
    const logs = await prisma.validationLog.findMany({
      where: { engagementId: req.params.engagementId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  } catch (err) { next(err); }
});

function getDefaultSections(engagementId, method) {
  const base = [
    { engagementId, sectionType: 'FIRST_PAGE', title: 'Cover Page', displayOrder: 1 },
    { engagementId, sectionType: 'TABLE_OF_CONTENTS', title: 'Table of Contents', displayOrder: 2 },
    { engagementId, sectionType: 'DIRECTOR_REPORT', title: "Director's Report", displayOrder: 3, content: '<p>The Board of Directors presents the Annual Report...</p>' },
    { engagementId, sectionType: 'AUDITOR_REPORT', title: "Auditor's Report", displayOrder: 4, content: '<p>Independent Auditor\'s Report...</p>' },
    { engagementId, sectionType: 'FINANCIAL_STATEMENTS', title: 'Financial Statements', displayOrder: 5, isEditable: false },
    { engagementId, sectionType: 'ACCOUNTING_POLICY', title: 'Significant Accounting Policies', displayOrder: 6, content: '<p>Basis of preparation...</p>' },
    { engagementId, sectionType: 'SUGGESTIONS', title: 'Suggestions / Management Commentary', displayOrder: 7 },
    { engagementId, sectionType: 'NOTES', title: 'Notes to Financial Statements', displayOrder: 8, isEditable: false },
    { engagementId, sectionType: 'THANK_YOU', title: 'Thank You', displayOrder: 9, content: '<p>We thank all stakeholders for their continued trust and support.</p>' },
  ];
  return base;
}

module.exports = router;

// GET /api/engagements/:engagementId/validation-checks
const { getValidationResults } = require('../services/validation.service');
router.get('/:engagementId/validation-checks', authGuard, engagementGuard, async (req, res, next) => {
  try {
    const results = await getValidationResults(req.params.engagementId);
    res.json(results);
  } catch (err) { next(err); }
});

// POST /api/engagements/:engagementId/validation-checks — run checks now
const { runAllChecks: runChecksNow } = require('../services/validation.service');
router.post('/:engagementId/validation-checks', authGuard, engagementGuard, async (req, res, next) => {
  try {
    const latest = await prisma.tBVersion.findFirst({
      where: { engagementId: req.params.engagementId },
      orderBy: { versionNumber: 'desc' },
    });
    const results = await runChecksNow(req.params.engagementId, latest?.id);
    res.json(results);
  } catch (err) { next(err); }
});

// PATCH update engagement
router.patch('/:engagementId', engagementGuard, requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, financialYear, method, currency, status } = req.body;
    await prisma.$executeRawUnsafe(
      `UPDATE "Engagement" SET
        name=$1, "financialYear"=$2, method=$3::\"Method\", currency=$4, status=$5, "updatedAt"=NOW()
       WHERE id=$6 AND "clientId" IN (SELECT id FROM "Client" WHERE "firmId"=$7)`,
      name || req.engagement?.name,
      financialYear || req.engagement?.financialYear,
      method || req.engagement?.method,
      currency || req.engagement?.currency,
      status || req.engagement?.status,
      req.params.engagementId, req.firmId
    );
    res.json({ saved: true });
  } catch (err) { next(err); }
});

// DELETE engagement — soft delete
router.delete('/:engagementId', engagementGuard, requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "Engagement" SET "isActive"=false, "updatedAt"=NOW()
       WHERE id=$1 AND "clientId" IN (SELECT id FROM "Client" WHERE "firmId"=$2)`,
      req.params.engagementId, req.firmId
    );
    res.json({ deleted: true });
  } catch (err) { next(err); }
});
