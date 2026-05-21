# FinStatement SaaS — Production-Ready Financial Statement Automation Platform

> Enterprise-grade FS automation supporting AS, Ind AS, IFRS, IFRS SME.  
> Multi-tenant · Zero hardcoding · Works cross-browser · State persists on refresh

---

## Architecture Overview

```
finstatement-saas/
├── backend/                   # Node.js + Express + PostgreSQL
│   ├── src/
│   │   ├── routes/            # All API endpoints
│   │   ├── middleware/        # Auth, tenant isolation, validation
│   │   ├── services/          # Business logic (FS engine, mapping, notes)
│   │   ├── db/                # Knex queries + pool
│   │   └── utils/             # Exporters (PDF/Word/Excel), helpers
│   ├── migrations/            # DB schema migrations (Knex)
│   └── package.json
├── frontend/                  # React 18 + Vite + Zustand
│   ├── src/
│   │   ├── api/               # Axios client (auto tenant header)
│   │   ├── store/             # Zustand slices (persisted to sessionStorage)
│   │   ├── pages/             # Route-level pages
│   │   ├── components/        # Feature components
│   │   └── hooks/             # Custom React hooks
│   └── package.json
└── docs/
    └── DATABASE_SCHEMA.md
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend API | Node.js 20 + Express 5 |
| Database | PostgreSQL 16 |
| ORM/Query | Knex.js |
| Auth | JWT (access 15m + refresh 7d) |
| Session Store | Redis (refresh tokens) |
| File Upload | Multer + xlsx (SheetJS) |
| PDF Export | Puppeteer |
| Word Export | docx.js |
| Excel Export | ExcelJS |
| Frontend | React 18 + Vite |
| State | Zustand + persist middleware |
| Router | React Router v6 (history-based) |
| UI | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Rich Editor | TipTap |
| HTTP Client | Axios (interceptors for JWT refresh) |

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### 1. Clone & Install

```bash
git clone <repo>
cd finstatement-saas

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Environment Setup

**backend/.env**
```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/finstatement
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-256-bit-secret-here
JWT_REFRESH_SECRET=your-256-bit-refresh-secret-here
ENCRYPTION_KEY=your-32-byte-aes256-key-here
ALLOWED_ORIGINS=http://localhost:5173
```

**frontend/.env**
```env
VITE_API_BASE=http://localhost:4000/api/v1
```

### 3. Database Setup

```bash
cd backend
npx knex migrate:latest
npx knex seed:run          # Seeds master grouping table (AS + Ind AS)
```

### 4. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

App runs at **http://localhost:5173**

---

## Deployment (Production)

```bash
# Backend
cd backend && npm run build && npm start

# Frontend
cd frontend && npm run build
# serve dist/ via nginx / Cloudflare Pages
```

**Nginx config**: proxy `/api/*` → `localhost:4000`, serve `/` → `dist/index.html`

---

## Key Design Decisions

### Multi-Tenant Isolation
Every DB table has `tenant_id`. Every query is scoped:  
`WHERE tenant_id = :tenantId` — never crosses clients.

### No Hardcoding
All financial logic is driven by the master grouping table (AS/Ind AS)  
or dynamic user mapping (IFRS/IFRS SME). Zero values in source code.

### State Persistence (Refresh-Safe)
Zustand store uses `persist` middleware with `sessionStorage`.  
React Router uses `history` mode (not hash) — full URL preserved on refresh.  
Auth tokens live in `httpOnly` cookies (XSS-safe).

### AS vs IFRS Split
- **AS / Ind AS**: Lookup against `master_grouping` table with `method_applicability` filter
- **IFRS / IFRS SME**: Dynamic structure built from TB columns; user mapping UI for FS heads

### Note Numbering
Sequential assignment per unique `note_group_id` — never per row.  
Multiple FS lines can share the same note number.

---

## Security Checklist

- [x] JWT access tokens (15 min) + refresh tokens (7 days, Redis-stored)
- [x] httpOnly + Secure + SameSite=Strict cookies
- [x] AES-256-GCM encryption for sensitive TB data at rest
- [x] Row-level tenant isolation (no cross-tenant leakage)
- [x] Helmet.js headers
- [x] Rate limiting (express-rate-limit)
- [x] Input validation (Zod)
- [x] Audit log table for all mutations
- [x] RBAC: Owner / Manager / Preparer / Viewer roles
- [x] TB version control (last 5 versions, auto-purge on 6th upload)
