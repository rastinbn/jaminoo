import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

type Ctx = { params: { id: string } };

export const POST = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);
  const tweet = await prisma.tweet.findUnique({ where: { id }, select: { id: true, visibility: true } });
  if (!tweet || tweet.visibility !== 'PUBLIC') return err('Tweet not found', 404);

  const existing = await prisma.tweetBookmark.findUnique({ where: { tweetId_userId: { tweetId: id, userId: me.id } } });
  if (existing) {
    await prisma.tweetBookmark.delete({ where: { id: existing.id } });
  } else {
    await prisma.tweetBookmark.create({ data: { tweetId: id, userId: me.id } });
  }
  const saved = await prisma.tweetBookmark.count({ where: { tweetId: id } });
  return json({ saved: !existing, saves: saved });
});