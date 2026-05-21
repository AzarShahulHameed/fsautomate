'use strict';
const router  = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { prisma } = require('../config/db');

router.use(authGuard);

// ── Section definitions with defaults per method ─────────────────────────────
const SECTION_DEFAULTS = (method) => [
  { sectionType: 'FIRST_PAGE',          title: 'Front Page',                    displayOrder: 1,  isVisible: true,  isEditable: true  },
  { sectionType: 'TABLE_OF_CONTENTS',   title: 'Table of Contents',             displayOrder: 2,  isVisible: true,  isEditable: false },
  { sectionType: 'DIRECTOR_REPORT',     title: "Directors' Report",             displayOrder: 3,  isVisible: true,  isEditable: true  },
  { sectionType: 'AUDITOR_REPORT',      title: "Independent Auditor's Report",  displayOrder: 4,  isVisible: true,  isEditable: true  },
  { sectionType: 'FINANCIAL_STATEMENTS',title: 'Financial Statements',          displayOrder: 5,  isVisible: true,  isEditable: false },
  { sectionType: 'ACCOUNTING_POLICY',   title: 'Significant Accounting Policies', displayOrder: 6, isVisible: true, isEditable: true  },
  { sectionType: 'SUGGESTIONS',         title: 'General Information',           displayOrder: 7,  isVisible: true,  isEditable: true  },
  { sectionType: 'NOTES',               title: 'Notes to Financial Statements', displayOrder: 8,  isVisible: true,  isEditable: false },
  { sectionType: 'THANK_YOU',           title: 'Thank You',                     displayOrder: 9,  isVisible: true,  isEditable: true  },
];

// GET sections — auto-create if none exist
router.get('/:engagementId/sections', engagementGuard, async (req, res, next) => {
  try {
    let sections = await prisma.reportSection.findMany({
      where: { engagementId: req.params.engagementId },
      orderBy: { displayOrder: 'asc' },
    });

    // Auto-initialize sections if none exist
    if (sections.length === 0) {
      const engagement = await prisma.engagement.findUnique({ where: { id: req.params.engagementId } });
      const defaults   = SECTION_DEFAULTS(engagement?.method || 'AS');
      await prisma.reportSection.createMany({
        data: defaults.map(d => ({ ...d, engagementId: req.params.engagementId, content: '' })),
      });
      sections = await prisma.reportSection.findMany({
        where: { engagementId: req.params.engagementId },
        orderBy: { displayOrder: 'asc' },
      });
    }
    res.json(sections);
  } catch (err) { next(err); }
});

// PUT — save section content + metadata
router.put('/:engagementId/sections/:sectionId', engagementGuard, async (req, res, next) => {
  try {
    const { content, title, isVisible, displayOrder } = req.body;
    const updated = await prisma.reportSection.updateMany({
      where: { id: req.params.sectionId, engagementId: req.params.engagementId },
      data: {
        ...(content       !== undefined && { content }),
        ...(title         !== undefined && { title }),
        ...(isVisible     !== undefined && { isVisible }),
        ...(displayOrder  !== undefined && { displayOrder }),
        updatedAt: new Date(),
      },
    });
    res.json({ saved: true, count: updated.count });
  } catch (err) { next(err); }
});

// PATCH — toggle visibility
router.patch('/:engagementId/sections/:sectionId/visibility', engagementGuard, async (req, res, next) => {
  try {
    const { isVisible } = req.body;
    await prisma.reportSection.updateMany({
      where: { id: req.params.sectionId, engagementId: req.params.engagementId },
      data:  { isVisible },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});

// PATCH — reorder sections
router.patch('/:engagementId/sections/reorder', engagementGuard, async (req, res, next) => {
  try {
    const { order } = req.body; // [{ id, displayOrder }]
    await prisma.$transaction(
      order.map(item => prisma.reportSection.updateMany({
        where: { id: item.id, engagementId: req.params.engagementId },
        data:  { displayOrder: item.displayOrder },
      }))
    );
    res.json({ reordered: true });
  } catch (err) { next(err); }
});

module.exports = router;
