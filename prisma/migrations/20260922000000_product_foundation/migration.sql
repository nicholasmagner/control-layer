-- DropForeignKey
ALTER TABLE "AssessmentScore" DROP CONSTRAINT "AssessmentScore_controlId_fkey";

-- AlterTable
ALTER TABLE "Control" ADD COLUMN     "applicable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "naReason" TEXT,
ADD COLUMN     "owner" TEXT;

-- AlterTable
ALTER TABLE "EvidenceArtifact" ADD COLUMN     "chainHash" TEXT,
ADD COLUMN     "collectedBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "fileData" BYTEA,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'automated',
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "seq" SERIAL NOT NULL,
ADD COLUMN     "sha256" TEXT,
ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "acceptReason" TEXT,
ADD COLUMN     "acceptedBy" TEXT,
ADD COLUMN     "checkId" TEXT,
ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Policy";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceName" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceControl" (
    "evidenceId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,

    CONSTRAINT "EvidenceControl_pkey" PRIMARY KEY ("evidenceId","controlId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "CheckRun_provider_startedAt_idx" ON "CheckRun"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "CheckResult_runId_idx" ON "CheckResult"("runId");

-- CreateIndex
CREATE INDEX "CheckResult_checkId_idx" ON "CheckResult"("checkId");

-- CreateIndex
CREATE INDEX "EvidenceControl_controlId_idx" ON "EvidenceControl"("controlId");

-- CreateIndex
CREATE INDEX "AssessmentScore_controlId_evaluatedAt_idx" ON "AssessmentScore"("controlId", "evaluatedAt");

-- Merge duplicate controls (the original seed script was not idempotent and
-- created a second copy of every control each time it ran). Keep the oldest
-- row per (framework, controlId) and repoint its scores before deleting.
WITH ranked AS (
    SELECT "id",
           FIRST_VALUE("id") OVER (PARTITION BY "framework", "controlId" ORDER BY "createdAt", "id") AS keep_id
    FROM "Control"
)
UPDATE "AssessmentScore" s
SET "controlId" = r.keep_id
FROM ranked r
WHERE s."controlId" = r."id" AND r."id" <> r.keep_id;

DELETE FROM "Control" c
USING "Control" k
WHERE c."framework" = k."framework"
  AND c."controlId" = k."controlId"
  AND (k."createdAt", k."id") < (c."createdAt", c."id");

-- CreateIndex
CREATE UNIQUE INDEX "Control_framework_controlId_key" ON "Control"("framework", "controlId");

-- CreateIndex
CREATE INDEX "EventLog_timestamp_idx" ON "EventLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceArtifact_seq_key" ON "EvidenceArtifact"("seq");

-- CreateIndex
CREATE INDEX "EvidenceArtifact_collectedAt_idx" ON "EvidenceArtifact"("collectedAt");

-- CreateIndex
CREATE INDEX "Finding_checkId_resource_status_idx" ON "Finding"("checkId", "resource", "status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScore" ADD CONSTRAINT "AssessmentScore_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CheckRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceControl" ADD CONSTRAINT "EvidenceControl_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceControl" ADD CONSTRAINT "EvidenceControl_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

