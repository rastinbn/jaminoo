-- Tweet Hub v2: multi-media assets, quote posts, blocks, mutes, rich profiles and tweet reports.

-- Twitter-style media belongs to tweets through a join table so a tweet can carry many images.
CREATE TABLE "TweetAsset" (
    "id" SERIAL NOT NULL,
    "tweetId" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetAsset_pkey" PRIMARY KEY ("id")
);

-- Backfill assets from the legacy single-media column.
INSERT INTO "TweetAsset" ("tweetId", "mediaId", "pos", "createdAt")
SELECT "id", "mediaAssetId", 0, "createdAt"
FROM "Tweet"
WHERE "mediaAssetId" IS NOT NULL;

CREATE TABLE "TweetBlock" (
    "id" SERIAL NOT NULL,
    "blockerId" INTEGER NOT NULL,
    "blockedId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TweetMute" (
    "id" SERIAL NOT NULL,
    "muterId" INTEGER NOT NULL,
    "mutedId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetMute_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tweet" ADD COLUMN "quotedTweetId" INTEGER;
ALTER TABLE "Tweet" DROP COLUMN "mediaAssetId";

ALTER TABLE "User" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "website" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "bannerPhotoId" TEXT;

ALTER TABLE "MessageReport" ADD COLUMN "tweetId" INTEGER;
ALTER TABLE "MessageReport" ADD COLUMN "reasonCategory" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Tweet_quotedTweetId_createdAt_idx" ON "Tweet"("quotedTweetId", "createdAt");
CREATE INDEX "TweetAsset_tweetId_pos_idx" ON "TweetAsset"("tweetId", "pos");
CREATE INDEX "TweetAsset_mediaId_idx" ON "TweetAsset"("mediaId");
CREATE INDEX "TweetBlock_blockedId_createdAt_idx" ON "TweetBlock"("blockedId", "createdAt");
CREATE INDEX "TweetMute_mutedId_createdAt_idx" ON "TweetMute"("mutedId", "createdAt");
CREATE INDEX "MessageReport_tweetId_createdAt_idx" ON "MessageReport"("tweetId", "createdAt");

CREATE UNIQUE INDEX "TweetAsset_tweetId_mediaId_key" ON "TweetAsset"("tweetId", "mediaId");
CREATE UNIQUE INDEX "TweetBlock_blockerId_blockedId_key" ON "TweetBlock"("blockerId", "blockedId");
CREATE UNIQUE INDEX "TweetMute_muterId_mutedId_key" ON "TweetMute"("muterId", "mutedId");
CREATE UNIQUE INDEX "User_bannerPhotoId_key" ON "User"("bannerPhotoId");

ALTER TABLE "TweetAsset" ADD CONSTRAINT "TweetAsset_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetAsset" ADD CONSTRAINT "TweetAsset_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetBlock" ADD CONSTRAINT "TweetBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetBlock" ADD CONSTRAINT "TweetBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetMute" ADD CONSTRAINT "TweetMute_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetMute" ADD CONSTRAINT "TweetMute_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_quotedTweetId_fkey" FOREIGN KEY ("quotedTweetId") REFERENCES "Tweet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_bannerPhotoId_fkey" FOREIGN KEY ("bannerPhotoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE SET NULL ON UPDATE CASCADE;