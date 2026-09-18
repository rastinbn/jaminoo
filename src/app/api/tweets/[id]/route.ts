import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweet } from '@/lib/tweet';

type Ctx = { params: { id: string } };

const RELATED_ACTOR = { select: { id: true, username: true, avatarId: true, profilePhotoId: true, bio: true } };
const RELATED_MEDIA = { select: { id: true, mime: true } };

async function findTweet(id: number, userId: number) {
  const tweet = await prisma.tweet.findFirst({
    where: { id, visibility: 'PUBLIC' },
    include: {
      author: RELATED_ACTOR,
      media: RELATED_MEDIA,
      replyTo: {
        include: {
          author: RELATED_ACTOR,
          media: RELATED_MEDIA,
          _count: { select: { likes: true, retweets: true, replies: true } },
          likes: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
        },
      },
      _count: { select: { likes: true, retweets: true, replies: true } },
      likes: { where: { userId }, select: { id: true } },
      bookmarks: { where: { userId }, select: { id: true } },
    },
  });
  if (!tweet) return null;
  const myRetweet = await prisma.tweet.findFirst({ where: { retweetOfId: tweet.id, authorId: userId }, select: { id: true } });
  const retweeted = !!myRetweet;
  const replyParent = tweet.replyTo ? serializeTweet(tweet.replyTo, false) : null;
  return { tweet: serializeTweet(tweet, retweeted), replyParent };
}

export const GET = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const found = await findTweet(id, me.id);
  if (!found) return err('Tweet not found', 404);
  return json(found);
});

export const DELETE = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const tweet = await prisma.tweet.findUnique({ where: { id }, select: { id: true, authorId: true } });
  if (!tweet) return err('Tweet not found', 404);
  if (tweet.authorId !== me.id && !me.isAdmin) return err('Forbidden', 403);
  await prisma.tweet.delete({ where: { id } });
  return json({ ok: true });
});