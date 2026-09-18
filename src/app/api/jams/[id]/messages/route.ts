import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { pubUser } from '@/lib/users';
import { livePublish } from '@/lib/live-publish';
import { msgPayload } from '@/lib/messages';
import { guardTextMessage } from '@/lib/chat-moderation';

type Ctx = { params: { id: string } };

const USER_SELECT = {
  id: true,
  username: true,
  avatarId: true,
  bio: true,
  github: true,
  status: true,
  statusText: true,
  createdAt: true,
  profilePhotoId: true,
} as const;

// GET /api/jams/[id]/messages — poll messages newer than `afterId`
export const GET = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const jam = await prisma.jam.findUnique({ where: { id: params.id }, include: { members: true } });
  if (!jam) return err('Jam not found', 404);
  if (!jam.members.some((m) => m.userId === me.id)) return err('You are not in this jam', 403);

  const afterId = Number(new URL(req.url).searchParams.get('afterId'));
  const messages = await prisma.jamMessage.findMany({
    where: {
      jamId: jam.id,
      ...(Number.isFinite(afterId) && afterId > 0 ? { id: { gt: afterId } } : {}),
    },
    include: {
      user: { select: USER_SELECT },
      media: true,
      reactions: true,
    },
    orderBy: { id: 'asc' },
    take: 200,
  });

  return json({ messages: messages.map((m) => msgPayload(m, me.id)) });
});

// POST /api/jams/[id]/messages  { text }
export const POST = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const { text } = (await req.json()) as { text?: string };
  if (!text || !text.trim()) return err('Empty message');
  const textClean = text.trim().slice(0, 1000);

  const jam = await prisma.jam.findUnique({ where: { id: params.id }, include: { members: true } });
  if (!jam) return err('Jam not found', 404);
  if (!jam.members.some((m) => m.userId === me.id)) return err('You are not in this jam', 403);
  guardTextMessage(req, me.id, textClean);

  const msg = await prisma.jamMessage.create({
    data: { jamId: jam.id, userId: me.id, kind: 'TEXT', text: textClean },
    include: { user: { select: USER_SELECT }, media: true, reactions: true },
  });
  const payload = msgPayload(msg, me.id);
  livePublish(`jam:${jam.id}`, 'chat:new', { jamId: jam.id, ...payload });
  return json({ ok: true, msg: payload }, 201);
});
