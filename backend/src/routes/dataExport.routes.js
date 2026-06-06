// src/routes/dataExport.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// PDPB/PDPA-compliant firm data export.
// Returns a ZIP archive of all firm data as JSON files.
// Uses Node.js built-in zlib — no external archiver package needed.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const router  = require('express').Router();
const zlib    = require('zlib');
const { authGuard, requireRole } = require('../middleware/tenant');
const { prisma } = require('../config/db');

// GET /api/data-export — download full firm data as ZIP
router.get('/', authGuard, requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const firmId = req.firmId;

    // Fetch all firm data in parallel
    const [firm, clients, engagements, mappings, noteGroups, fsLines, tbVersions, auditLogs] =
      await Promise.all([
        prisma.firm.findUnique({ where: { id: firmId } }),
        prisma.client.findMany({ where: { firmId } }),
        prisma.$queryRawUnsafe(
          `SELECT e.* FROM "Engagement" e JOIN "Client" c ON c.id=e."clientId" WHERE c."firmId"=$1`, firmId
        ),
        prisma.$queryRawUnsafe(
          `SELECT m.* FROM "Mapping" m JOIN "Engagement" e ON e.id=m."engagementId" JOIN "Client" c ON c.id=e."clientId" WHERE c."firmId"=$1`, firmId
        ),
        prisma.$queryRawUnsafe(
          `SELECT ng.* FROM "NoteGroup" ng JOIN "Engagement" e ON e.id=ng."engagementId" JOIN "Client" c ON c.id=e."clientId" WHERE c."firmId"=$1`, firmId
        ),
        prisma.$queryRawUnsafe(
          `SELECT f.* FROM "FSLine" f JOIN "Engagement" e ON e.id=f."engagementId" JOIN "Client" c ON c.id=e."clientId" WHERE c."firmId"=$1 AND f."isPriorYear"=false`, firmId
        ),
        prisma.$queryRawUnsafe(
          `SELECT tv.id,tv."engagementId",tv."versionNumber",tv."isPriorYear",tv."rowCount",tv."uploadedAt" FROM "TBVersion" tv JOIN "Engagement" e ON e.id=tv."engagementId" JOIN "Client" c ON c.id=e."clientId" WHERE c."firmId"=$1`, firmId
        ),
        prisma.auditLog.findMany({ where: { firmId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
      ]);

    // Build the export manifest
    const exportData = {
      exportedAt:   new Date().toISOString(),
      exportedBy:   req.user.email,
      firmId,
      firm:         { id: firm.id, name: firm.name, slug: firm.slug, plan: firm.plan, region: firm.region, currency: firm.currency, createdAt: firm.createdAt },
      summary: {
        clients:     clients.length,
        engagements: engagements.length,
        mappings:    mappings.length,
        noteGroups:  noteGroups.length,
        fsLines:     fsLines.length,
        tbVersions:  tbVersions.length,
        auditLogs:   auditLogs.length,
      },
    };

    // Build individual JSON files as strings
    const files = {
      'manifest.json':     JSON.stringify(exportData, null, 2),
      'clients.json':      JSON.stringify(clients, null, 2),
      'engagements.json':  JSON.stringify(engagements, null, 2),
      'mappings.json':     JSON.stringify(mappings, null, 2),
      'note-groups.json':  JSON.stringify(noteGroups, null, 2),
      'fs-lines.json':     JSON.stringify(fsLines, null, 2),
      'tb-versions.json':  JSON.stringify(tbVersions, null, 2),
      'audit-log.json':    JSON.stringify(auditLogs, null, 2),
    };

    // Build a minimal ZIP archive manually (using deflate per file)
    // Format: local file header + compressed data, then central directory
    const ZIP_STORED   = 0;
    const ZIP_DEFLATED = 8;

    function dosDateTime() {
      const d = new Date();
      const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
      return { date, time };
    }

    function crc32(buf) {
      let crc = 0xFFFFFFFF;
      const table = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
          let c = i;
          for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
          t[i] = c;
        }
        return t;
      })();
      for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function u16le(n) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n, 0); return b; }
    function u32le(n) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; }

    const { date: dosDate, time: dosTime } = dosDateTime();
    const chunks      = [];
    const centralDir  = [];
    let   offset      = 0;

    for (const [name, content] of Object.entries(files)) {
      const filenameBuf  = Buffer.from(name, 'utf8');
      const rawBuf       = Buffer.from(content, 'utf8');
      const compBuf      = zlib.deflateRawSync(rawBuf, { level: 6 });
      const crc          = crc32(rawBuf);
      const useDeflate   = compBuf.length < rawBuf.length;
      const dataBuf      = useDeflate ? compBuf : rawBuf;
      const method       = useDeflate ? ZIP_DEFLATED : ZIP_STORED;

      // Local file header
      const localHeader = Buffer.concat([
        Buffer.from([0x50,0x4B,0x03,0x04]), // signature
        u16le(20),                           // version needed
        u16le(0),                            // general purpose bit flag
        u16le(method),                       // compression method
        u16le(dosTime), u16le(dosDate),      // last mod time/date
        u32le(crc),                          // CRC-32
        u32le(dataBuf.length),               // compressed size
        u32le(rawBuf.length),                // uncompressed size
        u16le(filenameBuf.length),           // filename length
        u16le(0),                            // extra field length
        filenameBuf,
      ]);

      // Central directory entry
      centralDir.push({
        offset,
        name: filenameBuf,
        method,
        crc,
        compSize:   dataBuf.length,
        rawSize:    rawBuf.length,
        localHeader,
      });

      chunks.push(localHeader, dataBuf);
      offset += localHeader.length + dataBuf.length;
    }

    // Central directory
    const cdStart = offset;
    for (const entry of centralDir) {
      const cdEntry = Buffer.concat([
        Buffer.from([0x50,0x4B,0x01,0x02]), // signature
        u16le(20), u16le(20),               // version made by / needed
        u16le(0),                           // general purpose bit flag
        u16le(entry.method),                // compression method
        u16le(dosTime), u16le(dosDate),     // last mod
        u32le(entry.crc),
        u32le(entry.compSize),
        u32le(entry.rawSize),
        u16le(entry.name.length),
        u16le(0), u16le(0),                 // extra / comment
        u16le(0),                           // disk number start
        u16le(0), u16le(0),                 // internal / external attributes
        u32le(0),
        u32le(entry.offset),
        entry.name,
      ]);
      chunks.push(cdEntry);
      offset += cdEntry.length;
    }

    // End of central directory
    const cdSize = offset - cdStart;
    const eocd   = Buffer.concat([
      Buffer.from([0x50,0x4B,0x05,0x06]),
      u16le(0), u16le(0),
      u16le(centralDir.length),
      u16le(centralDir.length),
      u32le(cdSize),
      u32le(cdStart),
      u16le(0),
    ]);
    chunks.push(eocd);

    const zipBuffer = Buffer.concat(chunks);
    const safeName  = (firm?.name || 'firm').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
    const filename  = `${safeName}-data-export-${new Date().toISOString().slice(0,10)}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) { next(err); }
});

module.exports = router;
