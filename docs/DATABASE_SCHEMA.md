# Database Schema — FinStatement SaaS

All tables include `created_at`, `updated_at` (auto-managed by Knex).  
All financial tables include `tenant_id` (UUID FK → tenants) for isolation.

---

## tenants
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            VARCHAR(255) NOT NULL
slug            VARCHAR(100) UNIQUE NOT NULL      -- subdomain key
plan            VARCHAR(50) DEFAULT 'standard'    -- standard | pro | enterprise
is_active       BOOLEAN DEFAULT true
settings        JSONB DEFAULT '{}'                -- tenant-level preferences
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

## users
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
email           VARCHAR(320) UNIQUE NOT NULL
password_hash   VARCHAR(255) NOT NULL             -- bcrypt 12 rounds
full_name       VARCHAR(255) NOT NULL
role            VARCHAR(50) DEFAULT 'preparer'    -- owner|manager|preparer|viewer
is_active       BOOLEAN DEFAULT true
last_login      TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
INDEX (tenant_id, email)
```

## refresh_tokens
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
token_hash      VARCHAR(255) NOT NULL             -- SHA-256 of token
expires_at      TIMESTAMPTZ NOT NULL
revoked_at      TIMESTAMPTZ                       -- null = active
created_at      TIMESTAMPTZ DEFAULT now()
INDEX (user_id, expires_at)
```

## clients
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
name            VARCHAR(500) NOT NULL
registration_no VARCHAR(100)
pan             VARCHAR(20)
gstin           VARCHAR(20)
address         TEXT
country         VARCHAR(100) DEFAULT 'India'
currency        VARCHAR(10) DEFAULT 'INR'
financial_year  VARCHAR(20)                       -- e.g. "2024-25"
method          VARCHAR(20) NOT NULL              -- AS|IND_AS|IFRS|IFRS_SME
industry        VARCHAR(100)
notes           TEXT
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
INDEX (tenant_id)
```

## engagements
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
client_id       UUID NOT NULL REFERENCES clients(id)
name            VARCHAR(255) NOT NULL             -- "FY 2024-25 Audit"
period_start    DATE NOT NULL
period_end      DATE NOT NULL
method          VARCHAR(20) NOT NULL              -- AS|IND_AS|IFRS|IFRS_SME
status          VARCHAR(50) DEFAULT 'draft'       -- draft|in_progress|review|final
assigned_to     UUID[] DEFAULT '{}'               -- user_id array
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
INDEX (tenant_id, client_id)
```

## tb_uploads
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
version         INTEGER NOT NULL                  -- auto-incremented per engagement
filename        VARCHAR(500) NOT NULL
uploaded_by     UUID NOT NULL REFERENCES users(id)
row_count       INTEGER
checksum        VARCHAR(64)                       -- SHA-256 of file
upload_status   VARCHAR(50) DEFAULT 'processing' -- processing|complete|error
error_msg       TEXT
created_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (engagement_id, version)
INDEX (engagement_id)
-- Max 5 versions kept; oldest auto-deleted on 6th upload (enforced in service)
```

## tb_data
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
upload_id       UUID NOT NULL REFERENCES tb_uploads(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
account_number  VARCHAR(100)
account_name    TEXT NOT NULL
grouping        VARCHAR(500)                      -- from TB column (optional)
sub_grouping    VARCHAR(500) NOT NULL             -- from TB column (mandatory)
debit           NUMERIC(20,2) DEFAULT 0
credit          NUMERIC(20,2) DEFAULT 0
net             NUMERIC(20,2) DEFAULT 0
aje             NUMERIC(20,2) DEFAULT 0
final_net       NUMERIC(20,2) DEFAULT 0           -- used for all reporting
row_order       INTEGER                           -- original row sequence
created_at      TIMESTAMPTZ DEFAULT now()
INDEX (upload_id)
INDEX (engagement_id, sub_grouping)
```

## master_grouping
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
statement_type  VARCHAR(10) NOT NULL              -- BS|PL
group_name      VARCHAR(500) NOT NULL             -- FS display line
asset_liability VARCHAR(50)                       -- Assets|Liabilities|Income|Expense
sub_group_no    VARCHAR(50) NOT NULL              -- BS1, PL1, etc. for ordering
sub_group_name  VARCHAR(500) NOT NULL             -- Note sub-group label
note_group_id   VARCHAR(50)                       -- for note numbering
method_applicability VARCHAR(20) NOT NULL DEFAULT 'ALL' -- ALL|AS|IND_AS|IFRS|IFRS_SME
is_oci          BOOLEAN DEFAULT false             -- Ind AS / IFRS OCI line
is_soce         BOOLEAN DEFAULT false             -- SOCE applicable
display_order   INTEGER                           -- for custom ordering
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
INDEX (method_applicability, statement_type)
INDEX (sub_group_no)
```

## tb_mapping
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
tb_data_id      UUID NOT NULL REFERENCES tb_data(id)
sub_grouping    VARCHAR(500) NOT NULL             -- from TB
resolved_grouping VARCHAR(500) NOT NULL           -- final FS head used
master_group_id UUID REFERENCES master_grouping(id) -- null for IFRS dynamic
note_group_id   VARCHAR(100)                      -- assigned note group
note_number     INTEGER                           -- assigned sequential note #
is_manual       BOOLEAN DEFAULT false             -- user overrode auto-mapping
mapped_by       UUID REFERENCES users(id)
mapped_at       TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (engagement_id, tb_data_id)
INDEX (engagement_id)
```

## saved_mappings
```sql
-- Reusable mapping templates (for IFRS dynamic method)
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
client_id       UUID NOT NULL REFERENCES clients(id)
method          VARCHAR(20) NOT NULL
sub_grouping    VARCHAR(500) NOT NULL
fs_head         VARCHAR(500) NOT NULL
note_group_id   VARCHAR(100)
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (tenant_id, client_id, method, sub_grouping)
```

## note_groups
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
note_group_id   VARCHAR(100) NOT NULL             -- e.g. "NG_BORROWINGS"
note_number     INTEGER NOT NULL                  -- sequential assigned number
note_label      VARCHAR(500) NOT NULL             -- "Borrowings"
method          VARCHAR(20) NOT NULL
display_order   INTEGER NOT NULL
created_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (engagement_id, note_group_id)
INDEX (engagement_id)
```

## fs_output
```sql
-- Pre-computed FS lines (rebuilt on each TB upload / re-mapping)
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
statement_type  VARCHAR(10) NOT NULL              -- BS|PL|OCI|SOCE|CF
grouping        VARCHAR(500) NOT NULL
asset_liability VARCHAR(50)
total_final_net NUMERIC(20,2) NOT NULL DEFAULT 0
note_number     INTEGER
display_order   INTEGER
computed_at     TIMESTAMPTZ DEFAULT now()
INDEX (engagement_id, statement_type)
```

## notes_lines
```sql
-- Detail breakup per note
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
note_group_id   VARCHAR(100) NOT NULL
note_number     INTEGER NOT NULL
sub_grouping    VARCHAR(500) NOT NULL
account_name    TEXT NOT NULL
final_net       NUMERIC(20,2) NOT NULL DEFAULT 0
sub_group_no    VARCHAR(50)                       -- for ordering
display_order   INTEGER
computed_at     TIMESTAMPTZ DEFAULT now()
INDEX (engagement_id, note_group_id)
INDEX (engagement_id, note_number)
```

## report_content
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
section         VARCHAR(100) NOT NULL             -- first_page|toc|directors_report|etc.
title           VARCHAR(500)
content         TEXT                              -- rich text HTML (TipTap output)
display_order   INTEGER NOT NULL DEFAULT 0
is_auto         BOOLEAN DEFAULT false             -- auto-generated vs manual
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (engagement_id, section)
INDEX (engagement_id)
```

## toc_items
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
label           VARCHAR(500) NOT NULL
page_ref        VARCHAR(50)
display_order   INTEGER NOT NULL
is_linked       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
```

## validation_log
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
engagement_id   UUID NOT NULL REFERENCES engagements(id)
run_at          TIMESTAMPTZ DEFAULT now()
status          VARCHAR(20) NOT NULL              -- pass|fail|warning
checks          JSONB NOT NULL DEFAULT '[]'       -- array of {rule, status, detail}
triggered_by    UUID REFERENCES users(id)
```

## audit_log
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
user_id         UUID REFERENCES users(id)
action          VARCHAR(100) NOT NULL             -- tb.upload|mapping.save|report.export
entity_type     VARCHAR(100)
entity_id       UUID
old_value       JSONB
new_value       JSONB
ip_address      INET
user_agent      TEXT
created_at      TIMESTAMPTZ DEFAULT now()
INDEX (tenant_id, created_at DESC)
INDEX (tenant_id, entity_type, entity_id)
```

## ui_state
```sql
-- Server-side page state for cross-device persistence
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
tenant_id       UUID NOT NULL REFERENCES tenants(id)
page_key        VARCHAR(200) NOT NULL             -- e.g. "engagement:uuid:mapping"
state_json      JSONB NOT NULL DEFAULT '{}'
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (user_id, page_key)
```
