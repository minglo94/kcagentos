ALTER TABLE "User" ADD COLUMN "authRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "LocalCredential" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  CONSTRAINT "LocalCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LocalCredential_username_key" ON "LocalCredential"("username");
CREATE TABLE "DirectoryIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "directoryId" TEXT NOT NULL,
  "objectGuid" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "DirectoryIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DirectoryIdentity_directoryId_objectGuid_key" ON "DirectoryIdentity"("directoryId", "objectGuid");
CREATE INDEX "DirectoryIdentity_userId_idx" ON "DirectoryIdentity"("userId");
CREATE TABLE "LoginAttempt" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL
);
