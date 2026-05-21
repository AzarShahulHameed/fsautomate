-- CreateEnum
CREATE TYPE "Method" AS ENUM ('AS', 'IND_AS', 'IFRS', 'IFRS_SME');

-- CreateEnum
CREATE TYPE "MethodApplicability" AS ENUM ('ALL', 'AS', 'IND_AS', 'IFRS', 'IFRS_SME');

-- CreateEnum
CREATE TYPE "AssetLiability" AS ENUM ('Assets', 'Liabilities', 'Income', 'Expenses', 'Equity');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'FIRM_ADMIN', 'MANAGER', 'STAFF', 'CLIENT_VIEW');

-- CreateEnum
CREATE TYPE "TBVersionAction" AS ENUM ('ADDED', 'DELETED', 'CHANGED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PASS', 'FAIL', 'WARNING');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('WORD', 'PDF', 'EXCEL');

-- CreateEnum
CREATE TYPE "ReportSectionType" AS ENUM ('FIRST_PAGE', 'TABLE_OF_CONTENTS', 'DIRECTOR_REPORT', 'AUDITOR_REPORT', 'FINANCIAL_STATEMENTS', 'ACCOUNTING_POLICY', 'SUGGESTIONS', 'NOTES', 'THANK_YOU', 'CUSTOM');

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "pageState" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cin" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "Method" NOT NULL,
    "financialYear" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementUser" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TBVersion" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByRef" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "TBVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TBRow" (
    "id" TEXT NOT NULL,
    "tbVersionId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "grouping" TEXT,
    "subGrouping" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "aje" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "finalNet" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TBVersionDiff" (
    "id" TEXT NOT NULL,
    "tbVersionId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "action" "TBVersionAction" NOT NULL,
    "oldFinalNet" DECIMAL(18,2),
    "newFinalNet" DECIMAL(18,2),
    "fieldChanged" TEXT,

    CONSTRAINT "TBVersionDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterGrouping" (
    "id" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "assetLiability" "AssetLiability" NOT NULL,
    "subGroupNo" TEXT NOT NULL,
    "subGroupName" TEXT NOT NULL,
    "noteGroupId" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "methodApplicability" "MethodApplicability" NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterGrouping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mapping" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "subGrouping" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "subGroupName" TEXT,
    "subGroupNo" TEXT,
    "noteGroupId" TEXT,
    "masterGroupingId" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "isSaved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FSLine" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "tbVersionId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "totalFinalNet" DECIMAL(18,2) NOT NULL,
    "noteGroupId" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "assetLiability" "AssetLiability" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FSLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteGroup" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "noteGroupId" TEXT NOT NULL,
    "noteNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteDetail" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "noteGroupId" TEXT NOT NULL,
    "tbVersionId" TEXT NOT NULL,
    "subGroupNo" TEXT,
    "subGroupName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "finalNet" DECIMAL(18,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "NoteDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSection" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "sectionType" "ReportSectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationLog" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "tbVersionId" TEXT,
    "checkType" TEXT NOT NULL,
    "status" "ValidationStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Firm_slug_key" ON "Firm"("slug");

-- CreateIndex
CREATE INDEX "Firm_slug_idx" ON "Firm"("slug");

-- CreateIndex
CREATE INDEX "User_firmId_idx" ON "User"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "User_firmId_email_key" ON "User"("firmId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_token_idx" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "Client_firmId_idx" ON "Client"("firmId");

-- CreateIndex
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");

-- CreateIndex
CREATE INDEX "Engagement_method_idx" ON "Engagement"("method");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementUser_engagementId_userId_key" ON "EngagementUser"("engagementId", "userId");

-- CreateIndex
CREATE INDEX "TBVersion_engagementId_idx" ON "TBVersion"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "TBVersion_engagementId_versionNumber_key" ON "TBVersion"("engagementId", "versionNumber");

-- CreateIndex
CREATE INDEX "TBRow_tbVersionId_idx" ON "TBRow"("tbVersionId");

-- CreateIndex
CREATE INDEX "TBRow_engagementId_idx" ON "TBRow"("engagementId");

-- CreateIndex
CREATE INDEX "TBRow_subGrouping_idx" ON "TBRow"("subGrouping");

-- CreateIndex
CREATE INDEX "TBVersionDiff_tbVersionId_idx" ON "TBVersionDiff"("tbVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterGrouping_subGroupNo_key" ON "MasterGrouping"("subGroupNo");

-- CreateIndex
CREATE INDEX "MasterGrouping_groupName_idx" ON "MasterGrouping"("groupName");

-- CreateIndex
CREATE INDEX "MasterGrouping_noteGroupId_idx" ON "MasterGrouping"("noteGroupId");

-- CreateIndex
CREATE INDEX "MasterGrouping_methodApplicability_idx" ON "MasterGrouping"("methodApplicability");

-- CreateIndex
CREATE INDEX "MasterGrouping_sheet_idx" ON "MasterGrouping"("sheet");

-- CreateIndex
CREATE INDEX "Mapping_engagementId_idx" ON "Mapping"("engagementId");

-- CreateIndex
CREATE INDEX "Mapping_noteGroupId_idx" ON "Mapping"("noteGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Mapping_engagementId_subGrouping_key" ON "Mapping"("engagementId", "subGrouping");

-- CreateIndex
CREATE INDEX "FSLine_engagementId_idx" ON "FSLine"("engagementId");

-- CreateIndex
CREATE INDEX "FSLine_sheet_idx" ON "FSLine"("sheet");

-- CreateIndex
CREATE INDEX "FSLine_noteGroupId_idx" ON "FSLine"("noteGroupId");

-- CreateIndex
CREATE INDEX "NoteGroup_engagementId_idx" ON "NoteGroup"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteGroup_engagementId_noteGroupId_key" ON "NoteGroup"("engagementId", "noteGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteGroup_engagementId_noteNumber_key" ON "NoteGroup"("engagementId", "noteNumber");

-- CreateIndex
CREATE INDEX "NoteDetail_engagementId_idx" ON "NoteDetail"("engagementId");

-- CreateIndex
CREATE INDEX "NoteDetail_noteGroupId_idx" ON "NoteDetail"("noteGroupId");

-- CreateIndex
CREATE INDEX "NoteDetail_subGroupName_idx" ON "NoteDetail"("subGroupName");

-- CreateIndex
CREATE INDEX "ReportSection_engagementId_idx" ON "ReportSection"("engagementId");

-- CreateIndex
CREATE INDEX "ReportSection_sectionType_idx" ON "ReportSection"("sectionType");

-- CreateIndex
CREATE INDEX "ValidationLog_engagementId_idx" ON "ValidationLog"("engagementId");

-- CreateIndex
CREATE INDEX "ValidationLog_status_idx" ON "ValidationLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_firmId_idx" ON "AuditLog"("firmId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementUser" ADD CONSTRAINT "EngagementUser_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementUser" ADD CONSTRAINT "EngagementUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TBVersion" ADD CONSTRAINT "TBVersion_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TBRow" ADD CONSTRAINT "TBRow_tbVersionId_fkey" FOREIGN KEY ("tbVersionId") REFERENCES "TBVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TBVersionDiff" ADD CONSTRAINT "TBVersionDiff_tbVersionId_fkey" FOREIGN KEY ("tbVersionId") REFERENCES "TBVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FSLine" ADD CONSTRAINT "FSLine_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FSLine" ADD CONSTRAINT "FSLine_noteGroupId_engagementId_fkey" FOREIGN KEY ("noteGroupId", "engagementId") REFERENCES "NoteGroup"("noteGroupId", "engagementId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteGroup" ADD CONSTRAINT "NoteGroup_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDetail" ADD CONSTRAINT "NoteDetail_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDetail" ADD CONSTRAINT "NoteDetail_engagementId_noteGroupId_fkey" FOREIGN KEY ("engagementId", "noteGroupId") REFERENCES "NoteGroup"("engagementId", "noteGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSection" ADD CONSTRAINT "ReportSection_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationLog" ADD CONSTRAINT "ValidationLog_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
