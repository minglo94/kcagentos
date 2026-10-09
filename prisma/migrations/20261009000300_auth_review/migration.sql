-- Preserve email resolution only for pre-credential legacy Google users.
ALTER TABLE "User" ADD COLUMN "googleEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "googleEnabled" = true
WHERE NOT EXISTS (SELECT 1 FROM "LocalCredential" WHERE "userId" = "User"."id")
  AND NOT EXISTS (SELECT 1 FROM "DirectoryIdentity" WHERE "userId" = "User"."id");
CREATE INDEX "LoginAttempt_windowStartedAt_idx" ON "LoginAttempt"("windowStartedAt");
