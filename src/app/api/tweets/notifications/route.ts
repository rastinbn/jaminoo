import { handle, json, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

const KINDS = ['TWEET_LIKE', 'TWEET_RETWEET', 'TWEET_REPLY', 'TWEET_FOLLOW', 'TWEET_QUOTE', 'TWEET_MENTION'] as const;

const TYPE_BY_KIND: Record<string, string> = {
  TWEET_LIKE: 'like',
  TWEET_RETWEET: 'retweet',
  TWEET_REPLY: 'reply',
  TWEET_FOLLOW: 'follow',
  TWEET_QUOTE: 'quote',
  TWEET_MENTION: 'mention',
};

export const GET = handle(async (req) => {
  const me = await requireUser();
  const cursor = Number(new URL(req.url).searchParams.get('cursor') ?? 0);
  const where: any = { userId: me.id, kind: { in: [...KINDS] } };
  if (Number.isInteger(cursor) && cursor > 0) where.id = { lt: cursor };

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 25,
    }),
    prisma.notification.count({ where: { userId: me.id, kind: { in: [...KINDS] }, readAt: null } }),
  ]);

  const userIds = Array.from(new Set(rows.map((n) => {
    const payload = safePayload(n.payload);
    return Number(payload.fromId ?? 0);
  }).filter((id) => id > 0)));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, name: true, avatarId: true, profilePhotoId: true, bio: true, website: true, location: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const hasMore = rows.length > 24;
  const page = hasMore ? rows.slice(0, 24) : rows;

  const events = page.map((n) => {
    const payload = safePayload(n.payload);
    const actor = userMap.get(Number(payload.fromId ?? 0));
    return {
      id: n.id,
      type: TYPE_BY_KIND[n.kind] ?? 'reply',
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      tweetId: payload.tweetId ? Number(payload.tweetId) : null,
      tweetText: typeof payload.text === 'string' ? payload.text : '',
      actor: actor
        ? {
            id: actor.id,
            username: actor.username,
            name: actor.name ?? '',
            avatarId: actor.avatarId,
            avatarPhoto: actor.profilePhotoId ? `/api/media/${actor.profilePhotoId}` : null,
            bio: actor.bio ?? '',
            website: actor.website ?? '',
            location: actor.location ?? '',
          }
        : null,
    };
  });

  return json({ events, nextCursor: hasMore ? String(page[page.length - 1].id) : null, hasMore, unread });
});

export const PATCH = handle(async () => {
  const me = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: me.id, kind: { in: [...KINDS] }, readAt: null },
    data: { readAt: new Date() },
  });
  return json({ read: true });
});

function safePayload(raw: string) {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}