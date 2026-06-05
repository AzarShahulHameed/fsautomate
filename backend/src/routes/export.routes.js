// src/routes/export.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { exportWord, exportExcel, exportPDFData } = require('../services/export.service');
 
router.use(authGuard);
 
// GET /api/export/:engagementId/word
router.get('/:engagementId/word', engagementGuard, async (req, res, next) => {
  try {
    const buffer = await exportWord(req.params.engagementId, req.firmId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    // Build readable filename from engagement data
    const engForName = await require('../config/db').prisma.$queryRawUnsafe(
      `SELECT e."financialYear", e.method, c.name as "clientName"
       FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
       WHERE e.id = $1 LIMIT 1`, req.params.engagementId
    ).catch(()=>[]);
    const nameParts = engForName[0];
    const safeClient = (nameParts?.clientName||'').replace(/[^a-zA-Z0-9]/g,'-').slice(0,30);
    const safeFY     = (nameParts?.financialYear||'').replace(/[^a-zA-Z0-9-]/g,'');
    const wordFile   = safeClient && safeFY ? `${safeClient}-FY${safeFY}.docx` : `financial-statements-${req.params.engagementId}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${wordFile}"`);
    res.send(buffer);
  } catch (err) { next(err); }
});
 
// GET /api/export/:engagementId/excel
router.get('/:engagementId/excel', engagementGuard, async (req, res, next) => {
  try {
    const buffer = await exportExcel(req.params.engagementId, req.firmId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const engForExcel = await require('../config/db').prisma.$queryRawUnsafe(
      `SELECT e."financialYear", c.name as "clientName" FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId" WHERE e.id = $1 LIMIT 1`, req.params.engagementId
    ).catch(()=>[]);
    const excelName = engForExcel[0]
      ? `${(engForExcel[0].clientName||'').replace(/[^a-zA-Z0-9]/g,'-').slice(0,30)}-FY${(engForExcel[0].financialYear||'').replace(/[^a-zA-Z0-9-]/g,'')}.xlsx`
      : `financial-statements-${req.params.engagementId}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${excelName}"`);
    res.send(buffer);
  } catch (err) { next(err); }
});
 
// GET /api/export/:engagementId/pdf-data — returns data for client-side PDF
router.get('/:engagementId/pdf-data', engagementGuard, async (req, res, next) => {
  try {
    const data = await exportPDFData(req.params.engagementId, req.firmId);
    res.json(data);
  } catch (err) { next(err); }
});
 
module.exports = router;