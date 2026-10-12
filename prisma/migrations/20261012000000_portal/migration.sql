CREATE TABLE "PortalOperation" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "planVersion" INTEGER NOT NULL,
  "stepKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "operationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNSUBMITTED',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortalOperation_idempotencyKey_key" ON "PortalOperation"("idempotencyKey");
CREATE UNIQUE INDEX "PortalOperation_operationId_key" ON "PortalOperation"("operationId");
CREATE UNIQUE INDEX "PortalOperation_jobId_planVersion_stepKey_key" ON "PortalOperation"("jobId", "planVersion", "stepKey");
ALTER TABLE "PortalOperation" ADD CONSTRAINT "PortalOperation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OfficeJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
