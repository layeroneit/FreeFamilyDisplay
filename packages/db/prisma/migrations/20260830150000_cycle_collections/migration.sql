-- Weekly theme rotation (the outer loop). Additive and off by default, so
-- every existing board keeps the single collection it is already showing.
ALTER TABLE "Board" ADD COLUMN "cycleCollections" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Board" ADD COLUMN "lastCollectionRotatedAt" TIMESTAMP(3);
