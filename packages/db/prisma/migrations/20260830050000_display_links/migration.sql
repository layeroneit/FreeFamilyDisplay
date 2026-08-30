-- Per-board display links: a wall screen opens /d/<token> and renders that
-- board read-only, holding no session. Only the token's SHA-256 is stored.
ALTER TABLE "Board" ADD COLUMN "displayTokenHash" VARCHAR(64);
ALTER TABLE "Board" ADD COLUMN "displayTokenAt" TIMESTAMP(3);
ALTER TABLE "Board" ADD COLUMN "displaySeenAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Board_displayTokenHash_key" ON "Board"("displayTokenHash");
