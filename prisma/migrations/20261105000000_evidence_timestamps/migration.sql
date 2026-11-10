-- CreateTable
CREATE TABLE "ChainAnchor" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "chainHash" TEXT NOT NULL,
    "tsaUrl" TEXT NOT NULL,
    "token" BYTEA NOT NULL,
    "genTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChainAnchor_seq_idx" ON "ChainAnchor"("seq");

