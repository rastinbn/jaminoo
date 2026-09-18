import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweet, extractMentions } from '@/lib/tweet';
import { tweetIncludes, hiddenAuthorIds } from '@/lib/tweet-db';

type Ctx = { params: { id: string } };

const MAX_TEXT = 280;
const MAX_MEDIA = 4;

export const GET = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const parent = await prisma.tweet.findUnique({ where: { id }, select: { id: true, visibility: true, authorId: true } });
  if (!parent || parent.visibility !== 'PUBLIC') return err('Tweet not found', 404);
  const hidden = await hiddenAuthorIds(me.id);

  const cursor = Number(new URL(req.url).searchParams.get('cursor') ?? 0);
  const where: any = { replyToId: id, visibility: 'PUBLIC' };
  if (hidden.length > 0) where.authorId = { notIn: hidden };
  if (Number.isInteger(cursor) && cursor > 0) where.id = { lt: cursor };
  const rows = await prisma.tweet.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 25,
    include: tweetIncludes(me.id),
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

  const hidden = await hiddenAuthorIds(me.id);
  if (hidden.includes(parent.authorId)) return err('You cannot reply to this user', 403);

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const legacyMedia = typeof body.mediaAssetId === 'string' ? body.mediaAssetId.trim() : '';
  const rawMediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.filter((m: unknown) => typeof m === 'string') : [];
  const mediaIds = Array.from(new Set([...rawMediaIds, ...(legacyMedia && !rawMediaIds.includes(legacyMedia) ? [legacyMedia] : [])]));
  if (!text && mediaIds.length === 0) return err('Write a reply first');
  if (text.length > MAX_TEXT) return err(`Replies are limited to ${MAX_TEXT} characters`);
  if (mediaIds.length > MAX_MEDIA) return err(`A reply can carry up to ${MAX_MEDIA} photos or videos`);

  let media: { id: string; userId: number }[] = [];
  if (mediaIds.length > 0) {
    media = await prisma.media.findMany({ where: { id: { in: mediaIds } }, select: { id: true, userId: true } });
    if (media.length !== mediaIds.length) return err('Media not found', 404);
    if (media.some((m) => m.userId !== me.id)) return err('Media does not belong to you', 403);
    const already = await prisma.tweetAsset.count({ where: { mediaId: { in: mediaIds } } });
    if (already > 0) return err('A file is already attached to a tweet');
  }

  const reply = await prisma.tweet.create({
    data: { authorId: me.id, text, replyToId: parent.id },
    include: tweetIncludes(me.id),
  });

  if (media.length > 0) {
    await prisma.tweetAsset.createMany({
      data: media.map((m, index) => ({ tweetId: reply.id, mediaId: m.id, pos: index })),
    });
  }

  const notifyQueue: { userId: number; kind: string; payload: string }[] = [];
  if (parent.authorId !== me.id) {
    notifyQueue.push({ userId: parent.authorId, kind: 'TWEET_REPLY', payload: JSON.stringify({ fromId: me.id, tweetId: reply.id, parentId: parent.id, text: text.slice(0, 120) }) });
  }
  if (text) {
    const mentionNames = extractMentions(text).filter((name) => name.toLowerCase() !== me.username.toLowerCase());
    if (mentionNames.length > 0) {
      const mentioned = await prisma.user.findMany({ where: { username: { in: mentionNames } }, select: { id: true, username: true } });
      for (const target of mentioned) {
        if (target.id === me.id || target.id === parent.authorId) continue;
        notifyQueue.push({ userId: target.id, kind: 'TWEET_MENTION', payload: JSON.stringify({ fromId: me.id, tweetId: reply.id, username: target.username, text: text.slice(0, 120) }) });
      }
    }
  }
  for (const item of notifyQueue) {
    await prisma.notification.create({ data: { userId: item.userId, kind: item.kind, payload: item.payload } });
  }

  const fresh = media.length > 0
    ? await prisma.tweet.findUnique({ where: { id: reply.id }, include: tweetIncludes(me.id) })
    : reply;
  return json({ reply: serializeTweet(fresh ?? reply, false) }, 201);
});