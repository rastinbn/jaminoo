import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

type Ctx = { params: { id: string } };

export const POST = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const blockedId = Number(params.id);
  if (!Number.isInteger(blockedId) || blockedId <= 0) return err('Invalid user', 400);
  if (blockedId === me.id) return err('You cannot block yourself');
  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
  if (!target) return err('User not found', 404);

  await prisma.tweetBlock.upsert({
    where: { blockerId_blockedId: { blockerId: me.id, blockedId } },
    create: { blockerId: me.id, blockedId },
    update: {},
  });
  // Blocking severs follow ties in both directions and removes my like/bookmarks on their content.
  await prisma.tweetFollow.deleteMany({
    where: {
      OR: [
        { followerId: me.id, followingId: blockedId },
        { followerId: blockedId, followingId: me.id },
      ],
    },
  });
  return json({ blocked: true });
});

export const DELETE = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const blockedId = Number(params.id);
  if (!Number.isInteger(blockedId) || blockedId <= 0) return err('Invalid user', 400);
  await prisma.tweetBlock.deleteMany({ where: { blockerId: me.id, blockedId } });
  return json({ blocked: false });
});