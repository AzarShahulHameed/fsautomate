# FinStatement SaaS — How to Run

Production-ready Financial Statement Automation platform supporting AS, Ind AS, IFRS, IFRS SME.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Option A — Docker (Recommended)](#option-a--docker-recommended)
3. [Option B — Manual Local Setup](#option-b--manual-local-setup)
4. [First-Time Setup After Running](#first-time-setup-after-running)
5. [File Structure](#file-structure)
6. [Key Design Decisions](#key-design-decisions)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Browser (React + Vite + Tailwind)
    │ HTTPS / HTTP
    ▼
Backend (Node.js + Express)
    │
    ├── PostgreSQL  — all persistent data (multi-tenant, firm-isolated)
    ├── Redis       — session store (page state survives refresh + incognito)
    └── Prisma ORM  — type-safe DB access
```

**Multi-tenant isolation**: every DB row carries `firmId`. No cross-firm data ever returned.

**Page state persistence**: current route + engagement context stored in Redis session, not browser storage. Works across incognito windows, new tabs, different machines (same session cookie).

---

## Option A — Docker (Recommended)

### Prerequisites
- Docker Desktop ≥ 24 (Mac/Windows) or Docker + Docker Compose v2 (Linux)

### Steps

```bash
# 1. Clone / enter the project
cd finstatement-saas

# 2. Create .env from template
cp docker-compose.env.example .env

# 3. Edit .env — generate secrets:
openssl rand -hex 64   # paste as JWT_SECRET
openssl rand -hex 64   # paste as SESSION_SECRET (different value)
# also set POSTGRES_PASSWORD to something strong

# 4. Start everything (PostgreSQL, Redis, Backend, Frontend)
docker compose up -d

# 5. Watch logs until backend says "Listening on port 4000"
docker compose logs -f backend
```

### Access
| Service  | URL                         |
|----------|-----------------------------|
| Frontend | http://localhost            |
| API      | http://localhost:4000       |
| Health   | http://localhost:4000/health|

### Stop
```bash
docker compose down          # stop, keep data
docker compose down -v       # stop + wipe all data
```

---

## Option B — Manual Local Setup

### Prerequisites
- Node.js 20+ (`node --version`)
- PostgreSQL 15+ running locally
- Redis 7+ running locally

### 1. PostgreSQL setup

```sql
-- Run as superuser (psql -U postgres)
CREATE USER finstatement_user WITH PASSWORD 'strongpassword';
CREATE DATABASE finstatement_db OWNER finstatement_user;
GRANT ALL PRIVILEGES ON DATABASE finstatement_db TO finstatement_user;
```

### 2. Backend

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env — fill in DATABASE_URL, REDIS_URL, JWT_SECRET, SESSION_SECRET

# Run database migrations (creates all tables)
npx prisma migrate dev --name init

# Seed master grouping data (AS + Ind AS rows from the Excel file)
node seeds/seed.js

# Start backend (development — auto-restarts on changes)
npm run dev

# OR start in production mode
node server.js
```

Backend runs on **http://localhost:4000**

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# VITE_API_BASE_URL=http://localhost:4000

# Start dev server (hot-reload)
npm run dev
```

Frontend runs on **http://localhost:5173**

---

## First-Time Setup After Running

### 1. Register your firm

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firmName": "My Audit Firm",
    "email": "admin@myfirm.com",
    "password": "SecurePass123!",
    "role": "ADMIN"
  }'
```

Or use the Register link on the Login page (if enabled in UI).

### 2. Login at http://localhost (or http://localhost:5173)

### 3. Create a Client → Create an Engagement → Upload TB → Map → Generate FS

---

## File Structure

```
finstatement-saas/
├── docker-compose.yml           # Full stack orchestration
├── docker-compose.env.example   # Environment template for Docker
├── HOW_TO_RUN.md                # This file
│
├── backend/
│   ├── server.js                # Express entry point
│   ├── package.json
│   ├── .env.example
│   ├── Dockerfile
│   ├── prisma/
│   │   └── schema.prisma        # Full DB schema (all 20+ models)
│   ├── seeds/
│   │   └── seed.js              # Seeds MasterGrouping from AS/Ind AS Excel data
│   └── src/
│       ├── config/
│       │   └── db.js            # Prisma client
│       ├── middleware/
│       │   ├── audit.js         # Non-blocking audit log middleware
│       │   └── tenant.js        # authGuard, engagementGuard, requireRole
│       ├── routes/
│       │   ├── auth.routes.js   # /api/auth/*
│       │   ├── client.routes.js # /api/clients/*
│       │   ├── engagement.routes.js
│       │   ├── tb.routes.js     # /api/tb/*  (upload, versions, diff)
│       │   ├── mapping.routes.js # /api/mapping/*
│       │   ├── fs.routes.js     # /api/fs/*
│       │   ├── notes.routes.js  # /api/notes/*
│       │   ├── report.routes.js # /api/report/*
│       │   └── export.routes.js # /api/export/* (Word, Excel blobs)
│       ├── services/
│       │   ├── tb.service.js       # Parse + upload TB, version control
│       │   ├── mapping.service.js  # Auto-map AS/IND_AS (master) + IFRS (heuristic)
│       │   ├── fs.service.js       # Generate FS lines (summary only)
│       │   ├── notes.service.js    # Generate note details + validation
│       │   └── export.service.js   # Word (docx) + Excel export
│       ├── controllers/
│       │   └── tb.controller.js    # TB upload handler
│       └── utils/
│           └── noteNumbering.js    # Assign note numbers per method
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── .env.example
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── main.jsx
        ├── App.jsx              # Router, PrivateRoute, PageStateRestorer
        ├── store/
        │   └── index.js         # Zustand — auth + page state (Redis-backed)
        ├── api/
        │   └── client.js        # Axios + typed API helpers
        ├── components/
        │   └── layout/
        │       └── Layout.jsx   # Sidebar navigation + outlet
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── Clients.jsx
            ├── Engagements.jsx
            ├── TBUpload.jsx         # Drag-drop upload, version history
            ├── Mapping.jsx          # Per-row mapping grid, auto-map, generate FS
            ├── FinancialStatements.jsx  # Summary BS + P&L (no ledger rows)
            ├── Notes.jsx            # Accordion notes with subtotals
            ├── ReportEditor.jsx     # TipTap rich text editor, section reorder
            └── Export.jsx           # Download Word / Excel
```

---

## Key Design Decisions

### 1. Page State Survives Everything
- Auth token → `sessionStorage` (survives F5, not cross-tab)
- Current route + engagement → Redis session (survives incognito, new tab, new device with same session cookie)
- On app mount, `restorePageState()` calls `/api/auth/page-state` and redirects user to where they left off

### 2. Multi-Tenant Isolation
- Every model has `firmId`
- `authGuard` middleware extracts `firmId` from JWT
- `engagementGuard` middleware verifies the engagement belongs to the authenticated firm
- No route returns data without a `firmId` filter

### 3. AS / Ind AS — Unified Master Table
- Single `MasterGrouping` table with `methodApplicability` enum: `ALL | AS | IND_AS | IFRS | IFRS_SME`
- Query: `WHERE methodApplicability IN ('ALL', selectedMethod)`
- Ind AS extensions (OCI, FVTPL, FVOCI, Amortised Cost) seeded with `IND_AS` applicability

### 4. Financial Statements — Summary Only
```sql
SELECT groupName, SUM(finalNet)
FROM TBRow
JOIN Mapping ON ...
WHERE engagementId = :id
GROUP BY groupName
```
No account names, no ledger detail visible in FS view.

### 5. Note Numbering
- AS: Notes 1–2 mandatory (General Info, Policies), Note 3+ = breakups
- Ind AS: Notes 1–4 mandatory, Note 5+ = breakups
- IFRS: Notes 1–4 mandatory, Note 5+ = breakups
- IFRS SME: Notes 1–3 mandatory, Note 4+ = breakups
- Numbers assigned to unique `noteGroupId` values, not individual rows

### 6. TB Version Control
- Max 5 versions per engagement stored
- On 6th upload, oldest is deleted
- Diff computed: added rows, deleted rows, value changes

---

## API Reference (Summary)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create firm + admin user |
| POST | `/api/auth/login` | Login, get JWT |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/auth/me` | Current user |
| PATCH | `/api/auth/page-state` | Save page state to Redis |
| GET | `/api/auth/page-state` | Get saved page state |
| GET | `/api/clients` | List clients for firm |
| POST | `/api/clients` | Create client |
| GET | `/api/engagements/client/:id` | List engagements for client |
| POST | `/api/engagements` | Create engagement |
| POST | `/api/tb/:eid/upload` | Upload TB (Excel/CSV) |
| GET | `/api/tb/:eid/versions` | TB version history |
| GET | `/api/mapping/:eid/status` | Mapping status + unmapped list |
| POST | `/api/mapping/:eid/auto` | Trigger auto-mapping |
| PUT | `/api/mapping/:eid/manual` | Save manual mapping for a row |
| GET | `/api/mapping/master` | Lookup master grouping |
| POST | `/api/fs/:eid/generate` | Generate financial statements |
| GET | `/api/fs/:eid` | Get generated FS |
| POST | `/api/notes/:eid/generate` | Generate notes |
| GET | `/api/notes/:eid` | Get notes |
| GET | `/api/report/:eid/sections` | Get report sections |
| PUT | `/api/report/:eid/sections/:sid` | Save section content |
| GET | `/api/export/:eid/word` | Download Word document |
| GET | `/api/export/:eid/excel` | Download Excel workbook |

---

## Troubleshooting

**Backend won't start — "Cannot find module '@prisma/client'"**
```bash
cd backend && npx prisma generate
```

**"Invalid prisma.X invocation" errors**
```bash
cd backend && npx prisma migrate deploy
```

**Redis connection refused**
```bash
# macOS
brew services start redis
# Linux
sudo systemctl start redis
# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

**Frontend shows blank page after login**
- Check browser console for API errors
- Ensure `VITE_API_BASE_URL` in frontend `.env` matches backend port
- Ensure backend is running and `/health` returns `{"status":"ok"}`

**"CORS error" in browser**
- Set `FRONTEND_URL` in backend `.env` to exactly match the frontend URL (including port)
- No trailing slash

**Page doesn't restore after refresh**
- Redis must be running — page state is stored there
- Check `SESSION_SECRET` is set in backend `.env`

**Seed fails — "already seeded"**
- Safe to re-run: seed.js uses `upsert` not `create`, so duplicates are handled

---

## Production Checklist

- [ ] Change all secrets in `.env` (`JWT_SECRET`, `SESSION_SECRET`, `POSTGRES_PASSWORD`)
- [ ] Set `NODE_ENV=production` in backend
- [ ] Set `secure: true` on session cookie (requires HTTPS)
- [ ] Put backend behind nginx/Caddy with TLS
- [ ] Set `FRONTEND_URL` to your actual domain
- [ ] Enable PostgreSQL SSL: add `?sslmode=require` to `DATABASE_URL`
- [ ] Set Redis password: `redis://:<password>@host:6379`
- [ ] Configure regular PostgreSQL backups
