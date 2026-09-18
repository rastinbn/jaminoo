import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweet } from '@/lib/tweet';

const MAX_TEXT = 280;
const RELATED_ACTOR = { select: { id: true, username: true, avatarId: true, profilePhotoId: true, bio: true } };
const RELATED_MEDIA = { select: { id: true, mime: true } };

export const GET = handle(async (req) => {
  const me = await requireUser();
  const params = new URL(req.url).searchParams;
  const view = params.get('view') ?? 'home';
  const q = params.get('q')?.trim() ?? '';
  const profile = params.get('profile')?.trim() ?? '';
  const cursor = Number(params.get('cursor') ?? 0);
  const trending = view === 'trending';

  const where: any = { visibility: 'PUBLIC' };
  if (view === 'following') {
    where.author = { tweetFollowers: { some: { followerId: me.id } } };
  } else if (view === 'bookmarks') {
    where.bookmarks = { some: { userId: me.id } };
  } else if (view === 'profile') {
    if (!profile) return err('A username is required for this view');
    where.author = { username: profile };
  }
  if (view !== 'profile' && view !== 'bookmarks') where.replyToId = null;
  if (q) {
    where.OR = [
      { text: { contains: q, mode: 'insensitive' } },
      { author: { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' } } },
    ];
  }
  if (Number.isInteger(cursor) && cursor > 0) where.id = { lt: cursor };

  const orderBy: any = trending ? [{ likes: { _count: 'desc' } }, { id: 'desc' }] : [{ id: 'desc' }];
  const rows = await prisma.tweet.findMany({
    where,
    orderBy,
    take: 15,
    include: {
      author: RELATED_ACTOR,
      media: RELATED_MEDIA,
      _count: { select: { likes: true, retweets: true, replies: true } },
      likes: { where: { userId: me.id }, select: { id: true } },
      bookmarks: { where: { userId: me.id }, select: { id: true } },
    },
  });
  const hasMore = rows.length > 14;
  const page = hasMore ? rows.slice(0, 14) : rows;
  const ids = page.map((t) => t.id);
  const myRetweets = ids.length > 0
    ? await prisma.tweet.findMany({ where: { retweetOfId: { in: ids }, authorId: me.id }, select: { retweetOfId: true } })
    : [];
  const retweetedSet = new Set(myRetweets.map((r) => r.retweetOfId));
  return json({
    tweets: page.map((t) => serializeTweet(t, retweetedSet.has(t.id))),
    nextCursor: hasMore ? String(page[page.length - 1].id) : null,
    hasMore,
  });
});

export const POST = handle(async (req) => {
  const me = await requireUser();
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const replyToId = Number(body.replyToId ?? 0);
  const retweetOfId = Number(body.retweetOfId ?? 0);
  const mediaAssetId = typeof body.mediaAssetId === 'string' ? body.mediaAssetId.trim() : '';

  if (text.length > MAX_TEXT) return err(`Tweets are limited to ${MAX_TEXT} characters`);
  if (!text && !mediaAssetId && !retweetOfId) return err('Say something first');

  let parentTweet: { id: number; visibility: string; authorId: number } | null = null;
  if (replyToId > 0) {
    parentTweet = await prisma.tweet.findUnique({ where: { id: replyToId }, select: { id: true, visibility: true, authorId: true } });
    if (!parentTweet || parentTweet.visibility !== 'PUBLIC') return err('Tweet not found', 404);
  }
  if (retweetOfId > 0) {
    const source = await prisma.tweet.findUnique({ where: { id: retweetOfId }, select: { id: true, visibility: true } });
    if (!source || source.visibility !== 'PUBLIC') return err('Tweet not found', 404);
    if (replyToId > 0) return err('A retweet cannot be a reply');
  }

  let media: { id: string; userId: number; kind: string } | null = null;
  if (mediaAssetId) {
    media = await prisma.media.findUnique({ where: { id: mediaAssetId }, select: { id: true, userId: true, kind: true } });
    if (!media || media.userId !== me.id) return err('Media not found', 404);
    const attached = await prisma.tweet.count({ where: { mediaAssetId } });
    if (attached > 0) return err('This file is already attached to a tweet');
  }

  const tweet = await prisma.tweet.create({
    data: {
      authorId: me.id,
      text,
      mediaAssetId: media ? media.id : null,
      replyToId: replyToId > 0 ? replyToId : null,
      retweetOfId: retweetOfId > 0 ? retweetOfId : null,
    },
    include: {
      author: RELATED_ACTOR,
      media: RELATED_MEDIA,
      _count: { select: { likes: true, retweets: true, replies: true } },
      likes: { where: { userId: me.id }, select: { id: true } },
      bookmarks: { where: { userId: me.id }, select: { id: true } },
    },
  });

  if (parentTweet && parentTweet.authorId !== me.id) {
    await prisma.notification.create({
      data: {
        userId: parentTweet.authorId,
        kind: 'TWEET_REPLY',
        payload: JSON.stringify({ fromId: me.id, tweetId: tweet.id, parentId: parentTweet.id, text: text.slice(0, 120) }),
      },
    });
  }

  return json({ tweet: serializeTweet(tweet, retweetOfId > 0) }, 201);
});