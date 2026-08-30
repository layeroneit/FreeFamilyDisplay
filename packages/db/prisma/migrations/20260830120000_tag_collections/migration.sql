-- Wallpaper collections filled by tag from a public anime image index.
-- Nullable: existing collections keep their link/folder source untouched.
ALTER TABLE "WallpaperCollection" ADD COLUMN "sourceTags" VARCHAR(200);
