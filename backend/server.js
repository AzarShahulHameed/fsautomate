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

const app  = express();
const PORT = process.env.PORT || 4000;

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
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',');
app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
    /\.vercel\.app$/,  // allows any vercel preview URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Firm-ID'],
}));

// ─── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Session (in-memory — no Redis needed) ─────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'finstatement-dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure:   false,   // set true only with HTTPS in production
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

// ─── Rate limiting ─────────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many auth attempts' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 500 }));

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
app.listen(PORT, () => console.log(`[FinStatement API] Listening on port ${PORT}`));

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
