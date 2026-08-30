-- AlterTable
ALTER TABLE "WallpaperCollection" DROP COLUMN "sourceUrl",
ADD COLUMN     "lastError" VARCHAR(255),
ADD COLUMN     "sourceMask" VARCHAR(200),
ADD COLUMN     "sourceSecret" VARCHAR(2048);
