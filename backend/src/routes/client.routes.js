'use strict';
const router = require('express').Router();
const { enforceClientLimit } = require('../middleware/planGuard');
const { authGuard, requireRole } = require('../middleware/tenant');
const { prisma } = require('../config/db');

router.use(authGuard);

// GET all clients
router.get('/', async (req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      where: { firmId: req.firmId, isActive: true, deletedAt: null },
      include: { _count: { select: { engagements: true } } },
      orderBy: { name: 'asc' },
    });
    // Add region display based on country field
    const enriched = clients.map(c => ({
      ...c,
      region: c.country === 'UAE' ? 'UAE' : 'India',
      tradeLicense: c.country === 'UAE' ? c.cin : null,
      vatNumber:    c.country === 'UAE' ? c.pan : null,
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[Client GET Error]', err.message);
    next(err);
  }
});

// POST create client
router.post('/', requireRole('FIRM_ADMIN', 'MANAGER'), enforceClientLimit, async (req, res, next) => {
  try {
    const { name, address, cin, pan, gstin, tradeLicense, vatNumber, region } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name is required' });

    const isUAE = region === 'UAE';

    const client = await prisma.client.create({
      data: {
        firmId:  req.firmId,
        name,
        country: isUAE ? 'UAE' : 'India',
        cin:     isUAE ? (tradeLicense || null) : (cin  || null),
        pan:     isUAE ? (vatNumber    || null) : (pan  || null),
        gstin:   isUAE ? null : (gstin || null),
        address: address || null,
      },
    });

    res.status(201).json({
      ...client,
      region:       isUAE ? 'UAE' : 'India',
      tradeLicense: isUAE ? tradeLicense : null,
      vatNumber:    isUAE ? vatNumber    : null,
    });
  } catch (err) {
    console.error('[Client Create Error]', err.message);
    next(err);
  }
});

// GET single client
router.get('/:id', async (req, res, next) => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
      include: { engagements: { orderBy: { createdAt: 'desc' } } },
    });
    if (!client) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...client,
      region: client.country === 'UAE' ? 'UAE' : 'India',
    });
  } catch (err) { next(err); }
});

// PUT update client
router.put('/:id', requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, address, cin, pan, gstin, country } = req.body;
    await prisma.client.updateMany({
      where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
      data: {
        ...(name    !== undefined && { name }),
        ...(address !== undefined && { address }),
        ...(cin     !== undefined && { cin }),
        ...(pan     !== undefined && { pan }),
        ...(gstin   !== undefined && { gstin }),
        ...(country !== undefined && { country }),
      },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});

// DELETE /api/clients/:id — soft delete
router.delete('/:id', requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findFirst({
      where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    await prisma.client.update({
      where: { id: req.params.id },
    });
    res.json({ deleted: true, recoverable: true });
  } catch (err) { next(err); }
});

module.exports = router;
