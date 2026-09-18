import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { livePublish } from '@/lib/live-publish';
import { msgPayload, storeVoice } from '@/lib/messages';
import { guardVoiceMessage } from '@/lib/chat-moderation';

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

// POST /api/jams/[id]/voice — multipart form with a `voice` audio file (max 60s)
export const POST = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();

  const jam = await prisma.jam.findUnique({ where: { id: params.id }, include: { members: true } });
  if (!jam) return err('Jam not found', 404);
  if (!jam.members.some((m) => m.userId === me.id)) return err('You are not in this jam', 403);
  guardVoiceMessage(req, me.id);

  const form = await req.formData();
  const file = form.get('voice');
  if (!(file instanceof File)) return err('No voice file provided');

  const media = await storeVoice(file, me.id);
  const msg = await prisma.jamMessage.create({
    data: { jamId: jam.id, userId: me.id, kind: 'VOICE', mediaId: media.id },
    include: { user: { select: USER_SELECT }, media: true, reactions: true },
  });
  const payload = msgPayload(msg, me.id);
  livePublish(`jam:${jam.id}`, 'chat:new', { jamId: jam.id, ...payload });
  return json({ ok: true, msg: payload }, 201);
});
