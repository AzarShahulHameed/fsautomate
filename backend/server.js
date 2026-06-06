// server.js — FinStatement SaaS backend entry point
'use strict';

const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');

const { prisma }          = require('./src/config/db');
const { auditMiddleware } = require('./src/middleware/audit');
const authRoutes          = require('./src/routes/auth.routes');
const clientRoutes        = require('./src/routes/client.routes');
const engagementRoutes    = require('./src/routes/engagement.routes');
const tbRoutes            = require('./src/routes/tb.routes');
const mappingRoutes       = require('./src/routes/mapping.routes');
const fsRoutes            = require('./src/routes/fs.routes');
const notesRoutes         = require('./src/routes/notes.routes');
const reportRoutes        = require('./src/routes/report.routes');
const exportRoutes        = require('./src/routes/export.routes');
const schedulesRoutes     = require('./src/routes/schedules.routes');
const uploadRoutes        = require('./src/routes/upload.routes');
const oauthRoutes         = require('./src/routes/oauth.routes');
const dashboardRoutes     = require('./src/routes/dashboard.routes');
const auditRoutes         = require('./src/routes/audit.routes');
const preferencesRoutes   = require('./src/routes/preferences.routes');
const otpRoutes           = require('./src/routes/otp.routes');
const billingRoutes       = require('./src/routes/billing.routes');
const shareRoutes         = require('./src/routes/share.routes');
const dataExportRoutes    = require('./src/routes/dataExport.routes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Fail fast on missing required secrets ─────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const REQUIRED_ENV = ['JWT_SECRET', 'SESSION_SECRET', 'DATABASE_URL'];
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Required for Render/Vercel reverse proxy — fixes rate limiting and cookies
app.set('trust proxy', 1);

// ─── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:'],
    },
  },
}));

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile, Postman, server-to-server)
    if (!origin) return cb(null, true);
    // Allow any vercel.app subdomain
    if (origin.endsWith('.vercel.app')) return cb(null, true);
    // Allow any onrender.com subdomain
    if (origin.endsWith('.onrender.com')) return cb(null, true);
    // Allow explicit list
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Firm-ID'],
}));
// Handle preflight for all routes
app.options('*', cors());

// ─── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Session — Redis-backed with in-memory fallback ────────────────────────
// Redis: survives Render restarts, shared across instances.
// Fallback: in-memory store for local dev (no Redis needed locally).
let sessionStore;
if (process.env.REDIS_URL) {
  try {
    const { createClient }  = require('redis');
    const { RedisStore }    = require('connect-redis');
    const redisClient = createClient({ url: process.env.REDIS_URL, socket: { tls: process.env.REDIS_URL.startsWith('rediss://') } });
    redisClient.connect().catch(e => console.warn('[Redis] Connect warning:', e.message));
    redisClient.on('error', e => console.warn('[Redis] Error:', e.message));
    sessionStore = new RedisStore({ client: redisClient, prefix: 'finstat:sess:' });
    console.log('[Session] Redis store active');
  } catch (e) {
    console.warn('[Session] Redis init failed, falling back to memory store:', e.message);
  }
} else {
  console.log('[Session] No REDIS_URL — using in-memory store (not suitable for production multi-instance)');
}

app.use(session({
  store:             sessionStore, // undefined = default MemoryStore
  secret:            process.env.SESSION_SECRET || 'finstatement-dev-secret',
  resave:            false,
  saveUninitialized: false,
  rolling:           true,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

// ─── Rate limiting — keyed by firmId for multi-tenant fairness ─────────────
// Auth routes: IP-based (firmId not yet available before login)
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  message:  'Too many auth attempts. Try again in 15 minutes.',
}));

// API routes: firmId-based so one firm cannot starve another
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max:      600,
  keyGenerator: (req) => req.firmId || req.ip, // firmId set by authGuard
  skip: (req) => req.method === 'OPTIONS',
}));

// ─── Audit logging ─────────────────────────────────────────────────────────
app.use(auditMiddleware);

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/clients',     clientRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/tb',          tbRoutes);
app.use('/api/mapping',     mappingRoutes);
app.use('/api/fs',          fsRoutes);
app.use('/api/notes',       notesRoutes);
app.use('/api/report',      reportRoutes);
app.use('/api/export',      exportRoutes);
app.use('/api/schedules',   schedulesRoutes);
app.use('/api/upload',      uploadRoutes);
app.use('/api/oauth',       oauthRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/audit',       auditRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/otp',         otpRoutes);
app.use('/api/billing',     billingRoutes);
app.use('/api/share',       shareRoutes);
app.use('/api/public',      shareRoutes);   // public share view — no auth
app.use('/api/data-export', dataExportRoutes);

// ─── 404 ───────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code:  err.code    || 'INTERNAL_ERROR',
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[FinStatement API] Listening on port ${PORT}`);

  // Keep Neon warm — ping every 4 minutes to prevent cold-start latency for users.
  // Neon suspends compute after 5 minutes of inactivity; this prevents suspension.
  if (process.env.NODE_ENV === 'production') {
    const { prisma } = require('./src/config/db');
    setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (e) {
        console.warn('[Keepalive] DB ping failed:', e.message);
      }
    }, 4 * 60 * 1000); // 4 minutes — just under Neon's 5-minute suspend threshold
    console.log('[Keepalive] Neon warm-ping active (every 4 min)');
  }
});

process.on('SIGTERM', async () => {
  const { disconnectDB } = require('./src/config/db');
  await disconnectDB();
  process.exit(0);
});
