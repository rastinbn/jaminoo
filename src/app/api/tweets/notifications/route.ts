import { handle, json, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweetAuthor } from '@/lib/tweet';

const ACTOR = { select: { id: true, username: true, avatarId: true, profilePhotoId: true, bio: true } };

export const GET = handle(async () => {
  const me = await requireUser();
  const myTweets = await prisma.tweet.findMany({
    where: { authorId: me.id },
    select: { id: true, text: true },
    orderBy: { id: 'desc' },
    take: 200,
  });
  const ids = myTweets.map((t) => t.id);

  const [likes, retweets, replies, follows] = await Promise.all([
    ids.length > 0
      ? prisma.tweetLike.findMany({
          where: { tweetId: { in: ids }, userId: { not: me.id } },
          include: { user: ACTOR, tweet: { select: { id: true, text: true } } },
          orderBy: { id: 'desc' },
          take: 30,
        })
      : [],
    ids.length > 0
      ? prisma.tweet.findMany({
          where: { retweetOfId: { in: ids }, authorId: { not: me.id } },
          include: { author: ACTOR, retweetOf: { select: { id: true, text: true } } },
          orderBy: { id: 'desc' },
          take: 30,
        })
      : [],
    ids.length > 0
      ? prisma.tweet.findMany({
          where: { replyToId: { in: ids }, authorId: { not: me.id } },
          include: { author: ACTOR, replyTo: { select: { id: true, text: true } } },
          orderBy: { id: 'desc' },
          take: 30,
        })
      : [],
    prisma.tweetFollow.findMany({
      where: { followingId: me.id, followerId: { not: me.id } },
      include: { follower: ACTOR },
      orderBy: { id: 'desc' },
      take: 30,
    }),
  ]);

  const events: {
    type: 'like' | 'retweet' | 'reply' | 'follow';
    actor: ReturnType<typeof serializeTweetAuthor>;
    tweetId: number | null;
    tweetText: string;
    createdAt: string;
  }[] = [
    ...likes.map((l) => ({ type: 'like' as const, actor: serializeTweetAuthor(l.user), tweetId: l.tweet.id, tweetText: l.tweet.text, createdAt: l.createdAt.toISOString() })),
    ...retweets.map((r) => ({ type: 'retweet' as const, actor: serializeTweetAuthor(r.author), tweetId: r.retweetOf?.id ?? null, tweetText: r.retweetOf?.text ?? '', createdAt: r.createdAt.toISOString() })),
    ...replies.map((r) => ({ type: 'reply' as const, actor: serializeTweetAuthor(r.author), tweetId: r.replyTo?.id ?? null, tweetText: r.text, createdAt: r.createdAt.toISOString() })),
    ...follows.map((f) => ({ type: 'follow' as const, actor: serializeTweetAuthor(f.follower), tweetId: null, tweetText: '', createdAt: f.createdAt.toISOString() })),
  ];
  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ events: events.slice(0, 40) });
});