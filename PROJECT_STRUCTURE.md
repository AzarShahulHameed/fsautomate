# FinStatement SaaS — Complete Project Structure

```
finstatement-saas/
│
├── README.md
├── PROJECT_STRUCTURE.md
├── .env.example
├── docker-compose.yml
│
├── backend/                          # Node.js + Express API
│   ├── package.json
│   ├── server.js                     # Entry point
│   ├── prisma/
│   │   └── schema.prisma             # Database schema (PostgreSQL)
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                 # Prisma client
│   │   │   └── session.js            # Redis session config
│   │   ├── middleware/
│   │   │   ├── auth.js               # JWT + session guard
│   │   │   ├── tenant.js             # Multi-tenant isolation
│   │   │   └── audit.js              # Audit log middleware
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── client.routes.js
│   │   │   ├── engagement.routes.js
│   │   │   ├── tb.routes.js
│   │   │   ├── mapping.routes.js
│   │   │   ├── fs.routes.js
│   │   │   ├── notes.routes.js
│   │   │   ├── report.routes.js
│   │   │   └── export.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── tb.controller.js
│   │   │   ├── mapping.controller.js
│   │   │   ├── fs.controller.js
│   │   │   ├── notes.controller.js
│   │   │   └── export.controller.js
│   │   ├── services/
│   │   │   ├── tb.service.js         # TB upload + version control
│   │   │   ├── mapping.service.js    # AS master table + IFRS dynamic
│   │   │   ├── fs.service.js         # FS generation engine
│   │   │   ├── notes.service.js      # Notes generation + numbering
│   │   │   ├── validation.service.js # Cross-validation
│   │   │   └── export.service.js     # Word/PDF/Excel export
│   │   └── utils/
│   │       ├── encrypt.js            # AES-256
│   │       └── noteNumbering.js      # Note sequential logic
│   └── seeds/
│       ├── as_master_bs.json         # AS BS grouping (from your Excel)
│       └── as_master_pl.json         # AS P&L grouping (from your Excel)
│
├── frontend/                         # React + Vite
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── store/
│       │   └── index.js              # Zustand store (page state persistence)
│       ├── hooks/
│       │   ├── usePageState.js       # Persist + restore on refresh
│       │   └── useAuth.js
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Clients.jsx
│       │   ├── Engagements.jsx
│       │   ├── TBUpload.jsx
│       │   ├── Mapping.jsx           # TB → FS head mapping UI
│       │   ├── FinancialStatements.jsx
│       │   ├── Notes.jsx
│       │   ├── ReportEditor.jsx
│       │   └── Export.jsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.jsx
│       │   │   └── TopBar.jsx
│       │   ├── tb/
│       │   │   ├── TBTable.jsx
│       │   │   └── VersionHistory.jsx
│       │   ├── mapping/
│       │   │   ├── MappingGrid.jsx   # Inline editable mapping
│       │   │   └── AutoMapBadge.jsx
│       │   ├── fs/
│       │   │   ├── BalanceSheet.jsx
│       │   │   ├── ProfitLoss.jsx
│       │   │   ├── OCI.jsx
│       │   │   └── CashFlow.jsx
│       │   ├── notes/
│       │   │   ├── NotesList.jsx
│       │   │   └── NoteDetail.jsx
│       │   ├── report/
│       │   │   ├── RichEditor.jsx    # TipTap rich text
│       │   │   └── TOCBuilder.jsx    # Drag-reorder TOC
│       │   └── shared/
│       │       ├── MethodBadge.jsx
│       │       └── ValidationAlert.jsx
│       └── api/
│           └── client.js             # Axios instance with interceptors
│
└── HOW_TO_RUN.md
```
