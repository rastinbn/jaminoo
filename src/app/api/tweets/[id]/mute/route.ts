import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

type Ctx = { params: { id: string } };

export const POST = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const mutedId = Number(params.id);
  if (!Number.isInteger(mutedId) || mutedId <= 0) return err('Invalid user', 400);
  if (mutedId === me.id) return err('You cannot mute yourself');
  const target = await prisma.user.findUnique({ where: { id: mutedId }, select: { id: true } });
  if (!target) return err('User not found', 404);

  await prisma.tweetMute.upsert({
    where: { muterId_mutedId: { muterId: me.id, mutedId } },
    create: { muterId: me.id, mutedId },
    update: {},
  });
  return json({ muted: true });
});

export const DELETE = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const mutedId = Number(params.id);
  if (!Number.isInteger(mutedId) || mutedId <= 0) return err('Invalid user', 400);
  await prisma.tweetMute.deleteMany({ where: { muterId: me.id, mutedId } });
  return json({ muted: false });
});