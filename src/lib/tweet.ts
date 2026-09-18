export function serializeTweet(t: any, retweeted = false) {
  return {
    id: t.id,
    text: t.text,
    mediaAssetId: t.mediaAssetId ?? null,
    mediaUrl: t.media ? `/api/media/${t.media.id}` : null,
    mediaMime: t.media ? t.media.mime : null,
    replyToId: t.replyToId ?? null,
    retweetOfId: t.retweetOfId ?? null,
    createdAt: t.createdAt.toISOString(),
    author: {
      id: t.author.id,
      username: t.author.username,
      avatarId: t.author.avatarId,
      avatarPhoto: t.author.profilePhotoId ? `/api/media/${t.author.profilePhotoId}` : null,
      bio: t.author.bio,
    },
    likes: t._count ? t._count.likes ?? 0 : (t.likesCount ?? 0),
    retweets: t._count ? t._count.retweets ?? 0 : (t.retweetsCount ?? 0),
    replies: t._count ? t._count.replies ?? 0 : (t.repliesCount ?? 0),
    liked: (t.likes ?? []).length > 0,
    saved: (t.bookmarks ?? []).length > 0,
    retweeted,
  };
}

export function serializeTweetAuthor(user: any) {
  return {
    id: user.id,
    username: user.username,
    avatarId: user.avatarId,
    avatarPhoto: user.profilePhotoId ? `/api/media/${user.profilePhotoId}` : null,
    bio: user.bio,
  };
}