// src/middleware/audit.js
// ─────────────────────────────────────────────────────────────────────────────
// Records every mutating API action to AuditLog with a human-readable
// description field. Reads engagement/client names from response body
// when available to produce meaningful messages like:
// "Generated Financial Statements for ABC Pvt Ltd (FY2024-25)"
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { prisma } = require('../config/db');

// Route → human description template
// :entityName and :fy are replaced with actual values if available
const ACTION_MAP = {
  'POST /api/auth/invite':                      'Invited a new team member',
  'POST /api/auth/register':                    'Registered new firm',
  'POST /api/clients':                          'Created client',
  'PUT /api/clients':                           'Updated client details',
  'DELETE /api/clients':                        'Deleted client',
  'POST /api/engagements':                      'Created engagement',
  'DELETE /api/engagements':                    'Deleted engagement',
  'PATCH /api/engagements:status':              'Updated engagement status',
  'POST /api/engagements:users':                'Assigned user to engagement',
  'DELETE /api/engagements:users':              'Removed user from engagement',
  'POST /api/tb:upload':                        'Uploaded Trial Balance',
  'POST /api/mapping':                          'Saved mapping',
  'POST /api/fs:generate':                      'Generated Financial Statements',
  'POST /api/notes:generate':                   'Generated Notes to Financial Statements',
  'PATCH /api/notes:content':                   'Updated note disclosure text',
  'PUT /api/report':                            'Updated report section',
  'PATCH /api/report:visibility':               'Toggled section visibility',
  'PATCH /api/report:reorder':                  'Reordered report sections',
  'POST /api/schedules:ppe':                    'Updated PPE schedule',
  'POST /api/schedules:intangibles':            'Updated Intangibles schedule',
  'POST /api/schedules:deferred-tax':           'Updated Deferred Tax schedule',
  'POST /api/schedules:related-party':          'Updated Related Party disclosures',
  'POST /api/schedules:eps':                    'Updated EPS data',
  'POST /api/schedules:contingencies':          'Updated Contingencies',
  'POST /api/share':                            'Created client share link',
  'DELETE /api/share:links':                    'Revoked client share link',
  'POST /api/billing:create-order':             'Initiated plan upgrade',
  'POST /api/billing:verify-payment':           'Completed plan upgrade',
  'PATCH /api/auth:password':                   'Changed password',
  'PATCH /api/auth:profile':                    'Updated profile',
  'PATCH /api/auth:firm':                       'Updated firm details',
  'PATCH /api/auth:role':                       'Changed user role',
  'PATCH /api/auth:deactivate':                 'Changed user active status',
};

function describeAction(method, path, params, body, responseBody) {
  // Normalize path to a pattern key
  const parts = path.split('/').filter(Boolean); // ['api','engagements','abc123','generate']
  const base  = parts.slice(0, 3).join('/');      // 'api/engagements/abc123'
  const action = parts[3] || '';                   // 'generate'

  // Try exact match first
  const exactKey = `${method} /${parts.slice(0,2).join('/')}${action?':'+action:''}`;

  // Build description
  const clientName     = responseBody?.client?.name || responseBody?.clientName || body?.name || '';
  const engName        = responseBody?.name || body?.name || '';
  const fy             = responseBody?.financialYear || body?.financialYear || '';
  const engContext     = engName && fy ? ` — ${engName} (FY${fy})` : engName ? ` — ${engName}` : '';
  const clientContext  = clientName ? ` — ${clientName}` : '';

  const template = ACTION_MAP[exactKey] || ACTION_MAP[`${method} /${parts.slice(0,2).join('/')}`];

  if (template) {
    const suffix = template.toLowerCase().includes('engagement') ? engContext
                 : template.toLowerCase().includes('financial') ? engContext
                 : template.toLowerCase().includes('note')      ? engContext
                 : template.toLowerCase().includes('client')    ? clientContext
                 : clientContext || engContext;
    return template + suffix;
  }

  // Fallback
  const entityType = parts[1] || 'resource';
  const verbMap    = { POST:'Created', PUT:'Updated', PATCH:'Updated', DELETE:'Deleted' };
  return `${verbMap[method] || method} ${entityType}${clientContext || engContext}`;
}

async function auditMiddleware(req, res, next) {
  const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!MUTATING.includes(req.method) || !req.user) return next();

  // Capture response body for context
  const originalJson = res.json.bind(res);
  let responseBody   = null;
  res.json = function(body) {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', async () => {
    try {
      if (res.statusCode < 400) {
        const description = describeAction(
          req.method, req.path, req.params, req.body, responseBody
        );

        await prisma.auditLog.create({
          data: {
            firmId:      req.user?.firmId || 'unknown',
            userId:      req.user?.id    || null,
            action:      req.method,
            entityType:  req.path.split('/')[2] || 'unknown',
            entityId:    req.params?.engagementId || req.params?.id || responseBody?.id || null,
            description,
            ipAddress:   req.ip,
            userAgent:   req.headers['user-agent']?.slice(0, 200),
          },
        });
      }
    } catch (_) { /* never crash on audit */ }
  });

  next();
}

module.exports = { auditMiddleware };
