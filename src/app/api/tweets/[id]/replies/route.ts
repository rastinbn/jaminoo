import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweet } from '@/lib/tweet';

type Ctx = { params: { id: string } };

const MAX_TEXT = 280;
const RELATED_ACTOR = { select: { id: true, username: true, avatarId: true, profilePhotoId: true, bio: true } };
const RELATED_MEDIA = { select: { id: true, mime: true } };

export const GET = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const parent = await prisma.tweet.findUnique({ where: { id }, select: { id: true, visibility: true } });
  if (!parent || parent.visibility !== 'PUBLIC') return err('Tweet not found', 404);

  const cursor = Number(new URL(req.url).searchParams.get('cursor') ?? 0);
  const where: any = { replyToId: id, visibility: 'PUBLIC' };
  if (Number.isInteger(cursor) && cursor > 0) where.id = { lt: cursor };
  const rows = await prisma.tweet.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 25,
    include: {
      author: RELATED_ACTOR,
      media: RELATED_MEDIA,
      _count: { select: { likes: true, retweets: true, replies: true } },
      likes: { where: { userId: me.id }, select: { id: true } },
      bookmarks: { where: { userId: me.id }, select: { id: true } },
    },
  });
  const hasMore = rows.length > 24;
  const page = hasMore ? rows.slice(0, 24) : rows;
  const ids = page.map((t) => t.id);
  const myRetweets = ids.length > 0
    ? await prisma.tweet.findMany({ where: { retweetOfId: { in: ids }, authorId: me.id }, select: { retweetOfId: true } })
    : [];
  const retweetedSet = new Set(myRetweets.map((r) => r.retweetOfId));
  return json({
    replies: page.map((t) => serializeTweet(t, retweetedSet.has(t.id))),
    nextCursor: hasMore ? String(page[page.length - 1].id) : null,
    hasMore,
  });
});

export const POST = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const parent = await prisma.tweet.findUnique({ where: { id }, select: { id: true, visibility: true, authorId: true } });
  if (!parent || parent.visibility !== 'PUBLIC') return err('Tweet not found', 404);

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const mediaAssetId = typeof body.mediaAssetId === 'string' ? body.mediaAssetId.trim() : '';
  if (!text && !mediaAssetId) return err('Write a reply first');
  if (text.length > MAX_TEXT) return err(`Replies are limited to ${MAX_TEXT} characters`);

  let media: { id: string; userId: number } | null = null;
  if (mediaAssetId) {
    media = await prisma.media.findUnique({ where: { id: mediaAssetId }, select: { id: true, userId: true } });
    if (!media || media.userId !== me.id) return err('Media not found', 404);
  }

  const reply = await prisma.tweet.create({
    data: { authorId: me.id, text, mediaAssetId: media ? media.id : null, replyToId: parent.id },
    include: {
      author: RELATED_ACTOR,
      media: RELATED_MEDIA,
      _count: { select: { likes: true, retweets: true, replies: true } },
      likes: { where: { userId: me.id }, select: { id: true } },
      bookmarks: { where: { userId: me.id }, select: { id: true } },
    },
  });

  if (parent.authorId !== me.id) {
    await prisma.notification.create({
      data: {
        userId: parent.authorId,
        kind: 'TWEET_REPLY',
        payload: JSON.stringify({ fromId: me.id, tweetId: reply.id, parentId: parent.id, text: text.slice(0, 120) }),
      },
    });
  }

  return json({ reply: serializeTweet(reply, false) }, 201);
});