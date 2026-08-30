-- Wallpaper collections can be filled from a drop folder on the host instead
-- of a share link, and can carry a rights note shown on screen.
ALTER TABLE "WallpaperCollection" ADD COLUMN "sourceFolder" VARCHAR(64);
ALTER TABLE "WallpaperCollection" ADD COLUMN "rightsNote" VARCHAR(300);
