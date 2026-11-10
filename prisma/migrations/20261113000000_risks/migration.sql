-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Security',
    "owner" TEXT,
    "likelihood" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "treatment" TEXT NOT NULL DEFAULT 'mitigate',
    "treatmentPlan" TEXT,
    "residualLikelihood" INTEGER,
    "residualImpact" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "controls" JSONB NOT NULL DEFAULT '[]',
    "checks" JSONB NOT NULL DEFAULT '[]',
    "libraryKey" TEXT,
    "acceptedBy" TEXT,
    "acceptedReason" TEXT,
    "acceptedUntil" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "completedBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "evidenceId" TEXT,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

