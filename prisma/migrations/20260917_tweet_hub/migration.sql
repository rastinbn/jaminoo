-- Tweet Hub: tweets, likes, bookmarks and follows.
CREATE TABLE "Tweet" (
    "id" SERIAL NOT NULL,
    "authorId" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "mediaAssetId" TEXT,
    "replyToId" INTEGER,
    "retweetOfId" INTEGER,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tweet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TweetLike" (
    "id" SERIAL NOT NULL,
    "tweetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TweetBookmark" (
    "id" SERIAL NOT NULL,
    "tweetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetBookmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TweetFollow" (
    "id" SERIAL NOT NULL,
    "followerId" INTEGER NOT NULL,
    "followingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetFollow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tweet_authorId_createdAt_idx" ON "Tweet"("authorId", "createdAt");
CREATE INDEX "Tweet_visibility_id_idx" ON "Tweet"("visibility", "id");
CREATE INDEX "Tweet_replyToId_createdAt_idx" ON "Tweet"("replyToId", "createdAt");
CREATE INDEX "Tweet_retweetOfId_createdAt_idx" ON "Tweet"("retweetOfId", "createdAt");
CREATE INDEX "TweetLike_userId_createdAt_idx" ON "TweetLike"("userId", "createdAt");
CREATE INDEX "TweetBookmark_userId_createdAt_idx" ON "TweetBookmark"("userId", "createdAt");
CREATE INDEX "TweetFollow_followingId_createdAt_idx" ON "TweetFollow"("followingId", "createdAt");

CREATE UNIQUE INDEX "TweetLike_tweetId_userId_key" ON "TweetLike"("tweetId", "userId");
CREATE UNIQUE INDEX "TweetBookmark_tweetId_userId_key" ON "TweetBookmark"("tweetId", "userId");
CREATE UNIQUE INDEX "TweetFollow_followerId_followingId_key" ON "TweetFollow"("followerId", "followingId");

ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_retweetOfId_fkey" FOREIGN KEY ("retweetOfId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetLike" ADD CONSTRAINT "TweetLike_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetLike" ADD CONSTRAINT "TweetLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetBookmark" ADD CONSTRAINT "TweetBookmark_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetBookmark" ADD CONSTRAINT "TweetBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetFollow" ADD CONSTRAINT "TweetFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TweetFollow" ADD CONSTRAINT "TweetFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;