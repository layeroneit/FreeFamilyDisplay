-- Sub-daily wallpaper rotation. Additive only: every existing board keeps the
-- value it has. Postgres 12+ permits ADD VALUE inside a transaction as long as
-- the new label is not also USED in that transaction, which it is not here.
ALTER TYPE "WallpaperRotation" ADD VALUE IF NOT EXISTS 'EVERY_5_MIN';
ALTER TYPE "WallpaperRotation" ADD VALUE IF NOT EXISTS 'EVERY_15_MIN';
ALTER TYPE "WallpaperRotation" ADD VALUE IF NOT EXISTS 'EVERY_30_MIN';
ALTER TYPE "WallpaperRotation" ADD VALUE IF NOT EXISTS 'HOURLY';
