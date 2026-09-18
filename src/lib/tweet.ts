function serializeMedia(t: any) {
  const rows = t.assets ?? [];
  return rows
    .filter((a: any) => a?.media)
    .map((a: any) => ({ id: a.media.id, url: `/api/media/${a.media.id}`, mime: a.media.mime }));
}

export interface SerializedTweetMedia {
  id: string;
  url: string;
  mime: string;
}

export interface SerializedTweetAuthor {
  id: number;
  username: string;
  name: string;
  avatarId: number | null;
  avatarPhoto: string | null;
  bannerPhoto: string | null;
  bio: string;
  website: string;
  location: string;
}

export interface SerializedTweet {
  id: number;
  text: string;
  media: SerializedTweetMedia[];
  replyToId: number | null;
  retweetOfId: number | null;
  quotedTweetId: number | null;
  createdAt: string;
  updatedAt: string;
  author: SerializedTweetAuthor;
  quoted: SerializedTweet | null;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  liked: boolean;
  saved: boolean;
  retweeted: boolean;
}

export function serializeTweet(t: any, retweeted = false, depth = 0): SerializedTweet {
  const author = serializeTweetAuthor(t.author);
  const quoted = t.quoted && depth < 1 ? serializeTweet(t.quoted, false, depth + 1) : null;
  return {
    id: t.id,
    text: t.text,
    media: serializeMedia(t),
    replyToId: t.replyToId ?? null,
    retweetOfId: t.retweetOfId ?? null,
    quotedTweetId: t.quotedTweetId ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt?.toISOString() ?? t.createdAt.toISOString(),
    author,
    quoted,
    likes: t._count ? t._count.likes ?? 0 : (t.likesCount ?? 0),
    retweets: t._count ? t._count.retweets ?? 0 : (t.retweetsCount ?? 0),
    replies: t._count ? t._count.replies ?? 0 : (t.repliesCount ?? 0),
    quotes: t._count ? t._count.quotes ?? 0 : (t.quotesCount ?? 0),
    liked: (t.likes ?? []).length > 0,
    saved: (t.bookmarks ?? []).length > 0,
    retweeted,
  };
}

export function serializeTweetAuthor(user: any) {
  return {
    id: user.id,
    username: user.username,
    name: user.name ?? '',
    avatarId: user.avatarId,
    avatarPhoto: user.profilePhotoId ? `/api/media/${user.profilePhotoId}` : null,
    bannerPhoto: user.bannerPhotoId ? `/api/media/${user.bannerPhotoId}` : null,
    bio: user.bio ?? '',
    website: user.website ?? '',
    location: user.location ?? '',
  };
}

// Mentions "@username" at word boundaries. Returns ["alice", "bob"].
export function extractMentions(text: string) {
  return Array.from(new Set(text.match(/(?:^|\s)@([A-Za-z0-9_]{1,30})/g) ?? []))
    .map((m) => m.trim().slice(1))
    .filter(Boolean)
    .slice(0, 15);
}

// Hashtags "#tag". Returns ["tags"].
export function extractHashtags(text: string) {
  return Array.from(new Set(text.match(/(?:^|\s)#([A-Za-z0-9_]{1,40})/g) ?? []))
    .map((m) => m.trim().slice(1))
    .filter(Boolean)
    .slice(0, 15);
}