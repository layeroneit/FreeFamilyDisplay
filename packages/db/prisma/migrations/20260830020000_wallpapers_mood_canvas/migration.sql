-- CreateEnum
CREATE TYPE "CanvasPreset" AS ENUM ('LANDSCAPE', 'PORTRAIT', 'ULTRAWIDE');

-- CreateEnum
CREATE TYPE "WallpaperRotation" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "WallpaperOrder" AS ENUM ('SEQUENTIAL', 'SHUFFLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedVersion" VARCHAR(16);

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "canvas" "CanvasPreset" NOT NULL DEFAULT 'LANDSCAPE',
ADD COLUMN     "currentWallpaperId" TEXT,
ADD COLUMN     "lastRotatedAt" TIMESTAMP(3),
ADD COLUMN     "matchPaletteToWallpaper" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scrimOpacityOverride" DOUBLE PRECISION,
ADD COLUMN     "wallpaperCollectionId" TEXT,
ADD COLUMN     "wallpaperOrder" "WallpaperOrder" NOT NULL DEFAULT 'SEQUENTIAL',
ADD COLUMN     "wallpaperRotation" "WallpaperRotation" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "weatherMood" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weatherMoodStrength" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "WallpaperCollection" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "ownerId" TEXT,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" VARCHAR(1024),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WallpaperCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallpaper" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "basePath" VARCHAR(255) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "meanLuminance" DOUBLE PRECISION NOT NULL,
    "luminanceVariance" DOUBLE PRECISION NOT NULL,
    "dominantColors" JSONB NOT NULL,
    "suggestedScrimOpacity" DOUBLE PRECISION NOT NULL,
    "lqip" VARCHAR(2048) NOT NULL,
    "attribution" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallpaper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WallpaperCollection_slug_key" ON "WallpaperCollection"("slug");

-- CreateIndex
CREATE INDEX "WallpaperCollection_ownerId_idx" ON "WallpaperCollection"("ownerId");

-- CreateIndex
CREATE INDEX "Wallpaper_collectionId_sortOrder_idx" ON "Wallpaper"("collectionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_wallpaperCollectionId_fkey" FOREIGN KEY ("wallpaperCollectionId") REFERENCES "WallpaperCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_currentWallpaperId_fkey" FOREIGN KEY ("currentWallpaperId") REFERENCES "Wallpaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallpaper" ADD CONSTRAINT "Wallpaper_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "WallpaperCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
