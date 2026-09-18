import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { livePublish } from '@/lib/live-publish';
import { getOrCreateConvo, areFriends } from '@/lib/dm';
import { msgPayload } from '@/lib/messages';
import { guardTextMessage } from '@/lib/chat-moderation';

type Ctx = { params: { otherId: string } };

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

// POST /api/dm/[otherId]/send  { text }
export const POST = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const otherId = Number(params.otherId);
  if (!Number.isInteger(otherId) || otherId === me.id) return err('Invalid user');
  const { text } = (await req.json()) as { text?: string };
  if (!text || !text.trim()) return err('Empty message');
  const textClean = text.trim().slice(0, 1000);
  if (!(await areFriends(me.id, otherId))) return err('You can only chat with friends', 403);
  guardTextMessage(req, me.id, textClean);

  const conv = await getOrCreateConvo(me.id, otherId);
  const msg = await prisma.dmMessage.create({
    data: { convId: conv.id, senderId: me.id, kind: 'TEXT', text: textClean },
    include: { sender: { select: USER_SELECT }, media: true, reactions: true },
  });
  const message = msgPayload({ ...msg, userId: msg.senderId, user: msg.sender }, me.id);
  const payload = { userA: conv.userA, userB: conv.userB, message };
  livePublish([`user:${me.id}`, `user:${otherId}`], 'dm:new', payload);
  return json({ ok: true, msg: message }, 201);
});
