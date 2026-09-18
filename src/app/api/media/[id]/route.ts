import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { UPLOAD_DIR } from '@/lib/upload-storage';

type Ctx = { params: { id: string } };

async function canAccessMedia(meId: number, mediaId: string, isAdmin = false) {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      userId: true,
      profileUser: { select: { id: true } },
      messages: { select: { jamId: true } },
      dmMessages: { select: { convId: true } },
      videoPosts: { where: { visibility: 'PUBLIC' }, select: { id: true } },
      videoThumbnails: { where: { visibility: 'PUBLIC' }, select: { id: true } },
      tweetAssets: { where: { tweet: { visibility: 'PUBLIC' } }, select: { id: true } },
    },
  });
  if (!media) return false;
  if (isAdmin) return true;
  if (media.userId === meId) return true;
  if (media.videoPosts.length > 0 || media.videoThumbnails.length > 0 || media.tweetAssets.length > 0) return true;

  if (media.profileUser) {
    const otherId = media.profileUser.id;
    if (otherId === meId) return true;
    const friend = await prisma.friendRequest.findFirst({
      where: { status: 'FRIENDS', OR: [{ fromId: meId, toId: otherId }, { fromId: otherId, toId: meId }] },
      select: { id: true },
    });
    if (friend) return true;
    const shared = await prisma.jamMember.count({
      where: { userId: meId, jam: { members: { some: { userId: otherId } } } },
    });
    if (shared > 0) return true;
    const publicJam = await prisma.jam.count({
      where: { ownerId: otherId, type: 'PUBLIC', closed: false },
    });
    if (publicJam > 0) return true;
    return false;
  }

  if (media.messages.length > 0) {
    const member = await prisma.jamMember.findUnique({
      where: { jamId_userId: { jamId: media.messages[0].jamId, userId: meId } },
    });
    return !!member;
  }

  if (media.dmMessages.length > 0) {
    const conv = await prisma.conversation.findUnique({ where: { id: media.dmMessages[0].convId } });
    return !!conv && (conv.userA === meId || conv.userB === meId);
  }

  return false;
}

export const GET = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const media = await prisma.media.findUnique({ where: { id: params.id } });
  if (!media) return err('Not found', 404);
  if (!(await canAccessMedia(me.id, media.id, me.isAdmin))) return err('Forbidden', 403);
  const fpath = path.join(UPLOAD_DIR, media.filename);
  try {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(fpath);
    const range = req.headers.get('range');
    let start = 0;
    let end = buffer.length - 1;
    let status = 200;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.length}` } });
      if (match[1]) start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
      if (!match[1] && match[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(0, buffer.length - suffixLength);
        end = buffer.length - 1;
      }
      end = Math.min(end, buffer.length - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= buffer.length) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.length}` } });
      }
      status = 206;
    }

    const body = buffer.subarray(start, end + 1);
    const headers: Record<string, string> = {
      'Content-Type': media.mime,
      'Content-Length': String(body.length),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': media.kind.endsWith('_ASSET') ? 'public, max-age=3600' : 'private, max-age=3600',
    };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${buffer.length}`;
    return new NextResponse(new Uint8Array(body), { status, headers });
  } catch {
    return err('File missing', 404);
  }
});

export const DELETE = handle(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const media = await prisma.media.findUnique({ where: { id: params.id } });
  if (!media) return err('Not found', 404);
  // only owner may delete
  if (media.userId !== me.id) return err('Forbidden', 403);
  await prisma.media.delete({ where: { id: media.id } });
  try {
    await unlink(path.join(UPLOAD_DIR, media.filename));
  } catch {
    // file already gone — treat as success
  }
  return json({ ok: true });
});
