CREATE TABLE "PortalTeacherMapping" (
 "id" TEXT PRIMARY KEY, "issuer" TEXT NOT NULL, "portalStaffId" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PortalTeacherMapping_issuer_portalStaffId_key" ON "PortalTeacherMapping"("issuer", "portalStaffId");
CREATE UNIQUE INDEX "PortalTeacherMapping_issuer_userId_key" ON "PortalTeacherMapping"("issuer", "userId");
CREATE TABLE "PortalTeacherRequest" (
 "requestId" TEXT PRIMARY KEY, "issuer" TEXT NOT NULL, "portalStaffId" TEXT NOT NULL,
 "mappingId" TEXT NOT NULL REFERENCES "PortalTeacherMapping"("id") ON DELETE RESTRICT,
 "requestHash" TEXT NOT NULL, "jobId" TEXT NOT NULL REFERENCES "OfficeJob"("id") ON DELETE RESTRICT,
 "revision" INTEGER NOT NULL DEFAULT 0, "snapshotHash" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PortalTeacherRequest_jobId_key" ON "PortalTeacherRequest"("jobId");
CREATE TABLE "PortalTeacherDecision" (
 "decisionId" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "PortalTeacherRequest"("requestId") ON DELETE RESTRICT,
 "decisionHash" TEXT NOT NULL, "planVersion" INTEGER NOT NULL, "planHash" TEXT NOT NULL, "decision" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PortalTeacherCommand" (
 "commandId" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "PortalTeacherRequest"("requestId") ON DELETE RESTRICT,
 "commandHash" TEXT NOT NULL, "action" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PortalTeacherNonce" (
 "issuer" TEXT NOT NULL, "nonce" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("issuer", "nonce")
);
