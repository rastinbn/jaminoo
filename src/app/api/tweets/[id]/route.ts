import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweet, extractMentions } from '@/lib/tweet';
import { tweetIncludes } from '@/lib/tweet-db';

type Ctx = { params: { id: string } };

const MAX_TEXT = 280;

async function findTweet(id: number, userId: number) {
  const tweet = await prisma.tweet.findFirst({
    where: { id, visibility: 'PUBLIC' },
    include: {
      ...tweetIncludes(userId),
      replyTo: { include: tweetIncludes(userId) },
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

export const PATCH = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const tweet = await prisma.tweet.findUnique({ where: { id }, select: { id: true, authorId: true, retweetOfId: true } });
  if (!tweet) return err('Tweet not found', 404);
  if (tweet.authorId !== me.id) return err('Forbidden', 403);
  if (tweet.retweetOfId) return err('Reposts cannot be edited');

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return err('Tweets need a message');
  if (text.length > MAX_TEXT) return err(`Tweets are limited to ${MAX_TEXT} characters`);

  const updated = await prisma.tweet.update({
    where: { id },
    data: { text },
    include: tweetIncludes(me.id),
  });
  return json({ tweet: serializeTweet(updated, false) });
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