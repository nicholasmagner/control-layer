-- CreateTable
CREATE TABLE "ConnectorConfig" (
    "provider" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "secret" TEXT,
    "connectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorConfig_pkey" PRIMARY KEY ("provider")
);

