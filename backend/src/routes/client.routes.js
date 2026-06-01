'use strict';
const router = require('express').Router();
const { authGuard, requireRole } = require('../middleware/tenant');
const { prisma } = require('../config/db');

router.use(authGuard);

// GET all clients
router.get('/', async (req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      where: { firmId: req.firmId, isActive: true },
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
router.post('/', requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
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
      where: { id: req.params.id, firmId: req.firmId },
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
    const { name, address, cin, pan, gstin, tradeLicense, vatNumber, region, email, phone } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required' });

    // Check duplicate name (excluding current client)
    const dupName = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Client" WHERE LOWER(TRIM(name))=$1 AND "firmId"=$2 AND id!=$3 AND "isActive"=true LIMIT 1`,
      name.trim().toLowerCase(), req.firmId, req.params.id
    );
    if (dupName.length) return res.status(409).json({ error: `Another client named "${name.trim()}" already exists.` });

    await prisma.$executeRawUnsafe(
      `UPDATE "Client" SET name=$1, address=$2, cin=$3, pan=$4, gstin=$5,
       "tradeLicense"=$6, "vatNumber"=$7, region=$8, email=$9, phone=$10, "updatedAt"=NOW()
       WHERE id=$11 AND "firmId"=$12`,
      name.trim(),
      address || null,
      cin ? cin.trim().toUpperCase() : null,
      pan ? pan.trim().toUpperCase() : null,
      gstin ? gstin.trim().toUpperCase() : null,
      tradeLicense ? tradeLicense.trim() : null,
      vatNumber ? vatNumber.trim() : null,
      region || 'India',
      email ? email.trim().toLowerCase() : null,
      phone ? phone.trim() : null,
      req.params.id, req.firmId
    );
    const updated = await prisma.$queryRawUnsafe(
      `SELECT * FROM "Client" WHERE id=$1 AND "firmId"=$2 LIMIT 1`,
      req.params.id, req.firmId
    );
    res.json(updated[0] || { saved: true });
  } catch (err) { next(err); }
});

// DELETE client — soft delete (sets isActive=false)
router.delete('/:id', requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Check if client has active engagements
    const engagements = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Engagement" WHERE "clientId"=$1 AND "isActive"=true LIMIT 1`,
      req.params.id
    );
    if (engagements.length) {
      return res.status(400).json({ error: 'Cannot delete client with active engagements. Archive all engagements first.' });
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "Client" SET "isActive"=false, "updatedAt"=NOW() WHERE id=$1 AND "firmId"=$2`,
      req.params.id, req.firmId
    );
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
