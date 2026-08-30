-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "theme" VARCHAR(32) NOT NULL DEFAULT 'midnight',
    "style" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardWidget" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "z" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedPayload" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lastError" VARCHAR(255),
    "lastErrorAt" TIMESTAMP(3),

    CONSTRAINT "CachedPayload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Board_userId_updatedAt_idx" ON "Board"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "BoardWidget_boardId_idx" ON "BoardWidget"("boardId");

-- CreateIndex
CREATE INDEX "CachedPayload_kind_fetchedAt_idx" ON "CachedPayload"("kind", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CachedPayload_kind_key_key" ON "CachedPayload"("kind", "key");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardWidget" ADD CONSTRAINT "BoardWidget_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
