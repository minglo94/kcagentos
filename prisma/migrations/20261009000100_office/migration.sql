-- CreateEnum
CREATE TYPE "OfficeStatus" AS ENUM ('PLANNING', 'PENDING_PLAN_APPROVAL', 'QUEUED', 'RUNNING', 'WAITING_INPUT', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OfficeJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "status" "OfficeStatus" NOT NULL DEFAULT 'PLANNING',
    "plan" JSONB,
    "planHash" TEXT,
    "planVersion" INTEGER NOT NULL DEFAULT 0,
    "approvedVersion" INTEGER,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "operationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeEvent" (
    "id" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeApproval" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "planHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeJob_userId_createdAt_idx" ON "OfficeJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficeJob_status_leaseUntil_idx" ON "OfficeJob"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeStep_jobId_key_key" ON "OfficeStep"("jobId", "key");

-- CreateIndex
CREATE INDEX "OfficeEvent_jobId_id_idx" ON "OfficeEvent"("jobId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeApproval_jobId_planVersion_key" ON "OfficeApproval"("jobId", "planVersion");

-- AddForeignKey
ALTER TABLE "OfficeJob" ADD CONSTRAINT "OfficeJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeStep" ADD CONSTRAINT "OfficeStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OfficeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeEvent" ADD CONSTRAINT "OfficeEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OfficeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeApproval" ADD CONSTRAINT "OfficeApproval_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OfficeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
