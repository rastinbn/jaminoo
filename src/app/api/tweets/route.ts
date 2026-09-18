import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { serializeTweet, extractMentions } from '@/lib/tweet';
import { tweetIncludes, hiddenAuthorIds } from '@/lib/tweet-db';

const MAX_TEXT = 280;
const MAX_MEDIA = 4;

export const GET = handle(async (req) => {
  const me = await requireUser();
  const params = new URL(req.url).searchParams;
  const view = params.get('view') ?? 'home';
  const q = params.get('q')?.trim() ?? '';
  const profile = params.get('profile')?.trim() ?? '';
  const tab = params.get('tab')?.trim() ?? 'posts';
  const cursor = Number(params.get('cursor') ?? 0);
  const trending = view === 'trending';

  const hidden = await hiddenAuthorIds(me.id);

  // -- user search results -------------------------------------------
  let users: unknown[] = [];
  if (q) {
    const userQuery = q.replace(/^@/, '').trim();
    if (userQuery.length >= 2) {
      const excluded = Array.from(new Set([...hidden, me.id]));
      const rows = await prisma.user.findMany({
        where: {
          NOT: excluded.length > 0 ? { id: { in: excluded } } : undefined,
          OR: [{ username: { contains: userQuery, mode: 'insensitive' } }, { name: { contains: userQuery, mode: 'insensitive' } }],
        },
        take: 6,
        include: {
          _count: { select: { tweets: true } },
          tweetFollowers: { select: { id: true } },
        },
      });
      users = rows.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        avatarId: u.avatarId,
        avatarPhoto: u.profilePhotoId ? `/api/media/${u.profilePhotoId}` : null,
        bio: u.bio,
        tweets: u._count.tweets,
        followers: u.tweetFollowers.length,
      }));
    }
  }

  // -- tweet feed -----------------------------------------------------
  let where: any = { visibility: 'PUBLIC' };
  if (hidden.length > 0) where.authorId = { notIn: hidden };

  if (view === 'following') {
    where.author = { is: { tweetFollowers: { some: { followerId: me.id } } } };
  } else if (view === 'bookmarks') {
    where.bookmarks = { some: { userId: me.id } };
  } else if (view === 'profile') {
    if (!profile) return err('A username is required for this view');
    where.author = { is: { username: profile } };
    if (tab === 'replies') {
      where.replyToId = { not: null };
    } else if (tab === 'media') {
      where.assets = { some: { media: { kind: { in: ['IMAGE_ASSET', 'VIDEO_ASSET'] } } } };
    } else if (tab === 'likes') {
      const target = await prisma.user.findUnique({ where: { username: profile }, select: { id: true } });
      if (!target) return err('User not found', 404);
      where.likes = { some: { userId: target.id } };
    }
  }

  if ((view !== 'profile' || tab === 'posts') && view !== 'bookmarks') where.replyToId = null;

  if (q) {
    where.AND = [
      {
        OR: [
          { text: { contains: q, mode: 'insensitive' } },
          { author: { is: { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' } } } },
        ],
      },
    ];
  }
  if (Number.isInteger(cursor) && cursor > 0) where.id = { lt: cursor };

  const orderBy: any = trending ? [{ likes: { _count: 'desc' } }, { id: 'desc' }] : [{ id: 'desc' }];
  const rows = await prisma.tweet.findMany({
    where,
    orderBy,
    take: 15,
    include: tweetIncludes(me.id),
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
    users,
  });
});

export const POST = handle(async (req) => {
  const me = await requireUser();
  rateLimit(`tweets:post:${me.id}`, 30, 60 * 1000);

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const replyToId = Number(body.replyToId ?? 0);
  const retweetOfId = Number(body.retweetOfId ?? 0);
  const quotedTweetId = Number(body.quotedTweetId ?? 0);
  const legacyMedia = typeof body.mediaAssetId === 'string' ? body.mediaAssetId.trim() : '';
  const rawMediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.filter((m: unknown) => typeof m === 'string') : [];
  const mediaIds = [...rawMediaIds, ...(legacyMedia && !rawMediaIds.includes(legacyMedia) ? [legacyMedia] : [])];

  if (text.length > MAX_TEXT) return err(`Tweets are limited to ${MAX_TEXT} characters`);
  if (mediaIds.length > MAX_MEDIA) return err(`A tweet can carry up to ${MAX_MEDIA} photos or videos`);
  if (!text && mediaIds.length === 0 && !retweetOfId && !quotedTweetId) return err('Say something first');
  if (replyToId > 0 && retweetOfId > 0) return err('A retweet cannot be a reply');
  if (quotedTweetId > 0 && retweetOfId > 0) return err('A quote cannot be a retweet');
  if (quotedTweetId > 0 && !text) return err('Add a comment to quote this tweet');

  let parentTweet: { id: number; visibility: string; authorId: number } | null = null;
  if (replyToId > 0) {
    parentTweet = await prisma.tweet.findUnique({ where: { id: replyToId }, select: { id: true, visibility: true, authorId: true } });
    if (!parentTweet || parentTweet.visibility !== 'PUBLIC') return err('Tweet not found', 404);
  }
  let quoted: { id: number; visibility: string; authorId: number } | null = null;
  if (quotedTweetId > 0) {
    quoted = await prisma.tweet.findUnique({ where: { id: quotedTweetId }, select: { id: true, visibility: true, authorId: true } });
    if (!quoted || quoted.visibility !== 'PUBLIC') return err('Tweet not found', 404);
  }
  if (retweetOfId > 0) {
    const source = await prisma.tweet.findUnique({ where: { id: retweetOfId }, select: { id: true, visibility: true } });
    if (!source || source.visibility !== 'PUBLIC') return err('Tweet not found', 404);
  }

  // Blocked users cannot reply to or quote the blocker's content; same the other way.
  const blockedIds = (await hiddenAuthorIds(me.id)).filter((id) => id !== me.id);
  if (parentTweet && blockedIds.includes(parentTweet.authorId)) return err('You cannot reply to this user', 403);
  if (quoted && blockedIds.includes(quoted.authorId)) return err('You cannot quote this user', 403);

  const uniqueMedia = Array.from(new Set(mediaIds));
  let media: { id: string; userId: number }[] = [];
  if (uniqueMedia.length > 0) {
    media = await prisma.media.findMany({ where: { id: { in: uniqueMedia } }, select: { id: true, userId: true } });
    if (media.length !== uniqueMedia.length) return err('Media not found', 404);
    if (media.some((m) => m.userId !== me.id)) return err('Media does not belong to you', 403);
    const already = await prisma.tweetAsset.count({ where: { mediaId: { in: uniqueMedia } } });
    if (already > 0) return err('A file is already attached to a tweet');
  }

  const tweet = await prisma.tweet.create({
    data: {
      authorId: me.id,
      text,
      replyToId: replyToId > 0 ? replyToId : null,
      retweetOfId: retweetOfId > 0 ? retweetOfId : null,
      quotedTweetId: quotedTweetId > 0 ? quotedTweetId : null,
    },
    include: tweetIncludes(me.id),
  });

  if (media.length > 0) {
    await prisma.tweetAsset.createMany({
      data: media.map((m, index) => ({ tweetId: tweet.id, mediaId: m.id, pos: index })),
    });
    tweet.assets = [];
  }

  // Fetch fresh assets after attach so the response carries media.
  const fresh =
    media.length > 0
      ? await prisma.tweet.findUnique({ where: { id: tweet.id }, include: tweetIncludes(me.id) })
      : null;

  const notifyQueue: { userId: number; kind: string; payload: string }[] = [];
  if (parentTweet && parentTweet.authorId !== me.id) {
    notifyQueue.push({ userId: parentTweet.authorId, kind: 'TWEET_REPLY', payload: JSON.stringify({ fromId: me.id, tweetId: tweet.id, parentId: parentTweet.id, text: text.slice(0, 120) }) });
  }
  if (quoted && quoted.authorId !== me.id) {
    notifyQueue.push({ userId: quoted.authorId, kind: 'TWEET_QUOTE', payload: JSON.stringify({ fromId: me.id, tweetId: tweet.id, quotedId: quoted.id, text: text.slice(0, 120) }) });
  }
  if (text) {
    const mentionNames = extractMentions(text).filter((name) => name.toLowerCase() !== me.username.toLowerCase());
    if (mentionNames.length > 0) {
      const mentioned = await prisma.user.findMany({ where: { username: { in: mentionNames } }, select: { id: true, username: true } });
      for (const target of mentioned) {
        if (target.id === me.id) continue;
        if (parentTweet && target.id === parentTweet.authorId) continue;
        notifyQueue.push({ userId: target.id, kind: 'TWEET_MENTION', payload: JSON.stringify({ fromId: me.id, tweetId: tweet.id, username: target.username, text: text.slice(0, 120) }) });
      }
    }
  }
  for (const item of notifyQueue) {
    await prisma.notification.create({ data: { userId: item.userId, kind: item.kind, payload: item.payload } });
  }

  const result = fresh ?? tweet;
  return json({ tweet: serializeTweet(result, retweetOfId > 0) }, 201);
});