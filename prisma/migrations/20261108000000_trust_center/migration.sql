-- CreateTable
CREATE TABLE "TrustDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'request',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "reason" TEXT,
    "ndaAccepted" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustRequest_tokenHash_key" ON "TrustRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustRequest_status_createdAt_idx" ON "TrustRequest"("status", "createdAt");

