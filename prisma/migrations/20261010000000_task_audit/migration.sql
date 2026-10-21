CREATE TABLE "TaskAttempt" (
 "id" TEXT PRIMARY KEY, "invocationKey" TEXT NOT NULL, "actorId" TEXT NOT NULL,
 "parentId" TEXT, "jobId" TEXT, "stepId" TEXT, "policy" JSONB NOT NULL,
 "executor" TEXT NOT NULL, "model" TEXT, "status" TEXT NOT NULL DEFAULT 'RUNNING',
 "errorCode" TEXT, "leaseToken" TEXT, "planVersion" INTEGER,
 "deadline" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "TaskAttempt_invocationKey_key" ON "TaskAttempt"("invocationKey");
CREATE INDEX "TaskAttempt_actorId_createdAt_idx" ON "TaskAttempt"("actorId", "createdAt");
CREATE INDEX "TaskAttempt_jobId_status_idx" ON "TaskAttempt"("jobId", "status");
CREATE INDEX "TaskAttempt_status_deadline_idx" ON "TaskAttempt"("status", "deadline");
CREATE TABLE "TaskArtifact" (
 "id" TEXT PRIMARY KEY, "attemptId" TEXT NOT NULL REFERENCES "TaskAttempt"("id"),
 "direction" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "ref" TEXT NOT NULL,
 "sha256" TEXT NOT NULL, "bytes" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "TaskArtifact_ref_key" ON "TaskArtifact"("ref");
CREATE UNIQUE INDEX "TaskArtifact_attemptId_direction_sequence_key" ON "TaskArtifact"("attemptId", "direction", "sequence");

ALTER TABLE "OfficeJob" ADD COLUMN "executionPolicy" JSONB, ADD COLUMN "policyHash" TEXT;
