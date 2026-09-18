import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

type Ctx = { params: { id: string } };

export const POST = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const tweet = await prisma.tweet.findUnique({ where: { id }, select: { id: true, visibility: true, authorId: true } });
  if (!tweet || tweet.visibility !== 'PUBLIC') return err('Tweet not found', 404);

  const existing = await prisma.tweet.findFirst({ where: { retweetOfId: id, authorId: me.id }, select: { id: true } });
  if (existing) {
    await prisma.tweet.delete({ where: { id: existing.id } });
  } else {
    await prisma.tweet.create({ data: { authorId: me.id, text: '', retweetOfId: id } });
    if (tweet.authorId !== me.id) {
      await prisma.notification.create({
        data: {
          userId: tweet.authorId,
          kind: 'TWEET_RETWEET',
          payload: JSON.stringify({ fromId: me.id, tweetId: id }),
        },
      });
    }
  }
  const retweets = await prisma.tweet.count({ where: { retweetOfId: id } });
  return json({ retweeted: !existing, retweets });
});