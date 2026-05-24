'use strict';
const router  = require('express').Router();
const { prisma } = require('../config/db');
const { authGuard } = require('../middleware/tenant');

// GET /api/preferences — get user preferences
router.get('/', authGuard, async (req, res, next) => {
  try {
    let prefs = await prisma.$queryRawUnsafe(
      `SELECT * FROM "UserPreferences" WHERE "userId"=$1 LIMIT 1`, req.user.id
    );
    if (!prefs.length) {
      // Create defaults on first access
      await prisma.$executeRawUnsafe(
        `INSERT INTO "UserPreferences" ("userId") VALUES ($1) ON CONFLICT ("userId") DO NOTHING`,
        req.user.id
      );
      prefs = await prisma.$queryRawUnsafe(
        `SELECT * FROM "UserPreferences" WHERE "userId"=$1 LIMIT 1`, req.user.id
      );
    }
    res.json(prefs[0] || {});
  } catch (err) { next(err); }
});

// PATCH /api/preferences — save user preferences
router.patch('/', authGuard, async (req, res, next) => {
  try {
    const {
      theme, dateFormat, numberFormat, compactMode,
      emailReports, engagementUpdates, validationAlerts, systemUpdates, marketing
    } = req.body;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "UserPreferences" ("userId","theme","dateFormat","numberFormat","compactMode",
       "emailReports","engagementUpdates","validationAlerts","systemUpdates","marketing","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT ("userId") DO UPDATE SET
         "theme"=$2,"dateFormat"=$3,"numberFormat"=$4,"compactMode"=$5,
         "emailReports"=$6,"engagementUpdates"=$7,"validationAlerts"=$8,
         "systemUpdates"=$9,"marketing"=$10,"updatedAt"=NOW()`,
      req.user.id,
      theme || 'light',
      dateFormat || 'DD/MM/YYYY',
      numberFormat || 'en-IN',
      compactMode || false,
      emailReports !== undefined ? emailReports : true,
      engagementUpdates !== undefined ? engagementUpdates : true,
      validationAlerts !== undefined ? validationAlerts : true,
      systemUpdates || false,
      marketing || false
    );
    res.json({ saved: true });
  } catch (err) { next(err); }
});

module.exports = router;
