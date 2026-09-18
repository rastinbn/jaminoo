-- Named video playlists for the Video Hub.
CREATE TABLE "UserVideoPlaylist" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVideoPlaylist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserVideoPlaylistItem" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVideoPlaylistItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserVideoPlaylist_userId_name_key" ON "UserVideoPlaylist"("userId", "name");
CREATE UNIQUE INDEX "UserVideoPlaylistItem_playlistId_postId_key" ON "UserVideoPlaylistItem"("playlistId", "postId");

ALTER TABLE "UserVideoPlaylist" ADD CONSTRAINT "UserVideoPlaylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserVideoPlaylistItem" ADD CONSTRAINT "UserVideoPlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "UserVideoPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserVideoPlaylistItem" ADD CONSTRAINT "UserVideoPlaylistItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "VideoPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
