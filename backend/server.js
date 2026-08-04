// server.js — FinStatement SaaS backend entry point
'use strict';
 
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');
const RedisStore       = require('connect-redis').default;
const { RedisStore: RateLimitRedisStore } = require('rate-limit-redis');
 
const { prisma }               = require('./src/config/db');
const { redisClient, redisEnabled } = require('./src/config/redis');
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
 
const app  = express();
const PORT = process.env.PORT || 4000;
 
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
// Previously trusted ANY *.vercel.app / *.onrender.com origin, which means
// anyone who spins up their own app on those platforms could make
// credentialed requests against this API from a logged-in user's browser.
// Now only exact origins from FRONTEND_URL (comma-separated) plus localhost
// dev are trusted. Add every real deployment URL (prod, preview envs you
// actually use) to FRONTEND_URL explicitly.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s => s.trim()) : []),
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile, Postman, server-to-server)
    if (!origin) return cb(null, true);
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
 
// ─── Session ────────────────────────────────────────────────────────────────
// Was: default express-session MemoryStore. That store logs a hard warning
// that it's "not designed for production" — every restart/deploy logs
// everyone out, and it cannot be shared across more than one server
// instance (a hard blocker for scaling past a single dyno). Now backed by
// Redis when REDIS_URL is set; falls back to MemoryStore only in local dev
// without Redis running, with a console warning so it's never silent.
app.use(session({
  store: redisEnabled ? new RedisStore({ client: redisClient, prefix: 'sess:' }) : undefined,
  secret: process.env.SESSION_SECRET || 'finstatement-dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));
if (!redisEnabled) {
  console.warn('[Session] Using in-memory MemoryStore — fine for local dev only. ' +
    'Set REDIS_URL before deploying more than one instance.');
}
 
// ─── Rate limiting ─────────────────────────────────────────────────────────
// Was: express-rate-limit's default in-memory store, which — same problem —
// resets on every restart and is per-instance, so limits don't hold once
// you run more than one server process behind a load balancer.
function makeRateLimitStore(prefix) {
  if (!redisEnabled) return undefined; // express-rate-limit falls back to its own in-memory store
  return new RateLimitRedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });
}

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, message: 'Too many auth attempts',
  store: makeRateLimitStore('rl-auth:'),
}));
app.use('/api', rateLimit({
  windowMs: 60 * 1000, max: 500,
  store: makeRateLimitStore('rl-api:'),
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
async function start() {
  if (redisEnabled) {
    await redisClient.connectPromise; // wait for the eager connect kicked off in config/redis.js
  }
  app.listen(PORT, () => console.log(`[FinStatement API] Listening on port ${PORT}`));
}
start();
 
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  if (redisEnabled && redisClient?.isOpen) await redisClient.quit();
  process.exit(0);
});