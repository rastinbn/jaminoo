import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { livePublish } from '@/lib/live-publish';
import { getOrCreateConvo, areFriends } from '@/lib/dm';
import { msgPayload, storeVoice } from '@/lib/messages';
import { guardVoiceMessage } from '@/lib/chat-moderation';

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

// POST /api/dm/[otherId]/voice — multipart form with a `voice` audio file (max 60s)
export const POST = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const otherId = Number(params.otherId);
  if (!Number.isInteger(otherId) || otherId === me.id) return err('Invalid user');
  if (!(await areFriends(me.id, otherId))) return err('You can only chat with friends', 403);
  guardVoiceMessage(req, me.id);

  const form = await req.formData();
  const file = form.get('voice');
  if (!(file instanceof File)) return err('No voice file provided');

  const media = await storeVoice(file, me.id);
  const conv = await getOrCreateConvo(me.id, otherId);
  const msg = await prisma.dmMessage.create({
    data: { convId: conv.id, senderId: me.id, kind: 'VOICE', mediaId: media.id },
    include: { sender: { select: USER_SELECT }, media: true, reactions: true },
  });
  const message = msgPayload({ ...msg, userId: msg.senderId, user: msg.sender }, me.id);
  const payload = { userA: conv.userA, userB: conv.userB, message };
  livePublish([`user:${me.id}`, `user:${otherId}`], 'dm:new', payload);
  return json({ ok: true, msg: message }, 201);
});
