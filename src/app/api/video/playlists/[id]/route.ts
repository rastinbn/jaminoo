import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

type Ctx = { params: { id: string } };

async function findOwnPlaylist(playlistId: number, userId: number) {
  if (!Number.isInteger(playlistId) || playlistId <= 0) return null;
  return prisma.userVideoPlaylist.findFirst({ where: { id: playlistId, userId }, select: { id: true } });
}

// POST /api/video/playlists/:id — add a post ({ postId })
export const POST = handle(async (request: Request, ctx: Ctx) => {
  try {
    const user = await requireUser();
    const playlistId = Number(ctx.params.id);
    const own = await findOwnPlaylist(playlistId, user.id);
    if (!own) return err('Playlist not found', 404);

    const body = await request.json().catch(() => null) as { postId?: unknown } | null;
    const postId = Number(body?.postId);
    if (!Number.isInteger(postId) || postId <= 0) return err('postId is required', 400);

    const post = await prisma.videoPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return err('Video post not found', 404);

    const itemCount = await prisma.userVideoPlaylistItem.count({ where: { playlistId: own.id } });
    if (itemCount >= 500) return err('Playlist is full (max 500 videos)', 400);

    const item = await prisma.userVideoPlaylistItem.upsert({
      where: { playlistId_postId: { playlistId: own.id, postId } },
      update: {},
      create: { playlistId: own.id, postId },
      select: { id: true, postId: true, createdAt: true },
    });

    return json({ item }, 201);
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Failed to add video to playlist', 400);
  }
});

// DELETE /api/video/playlists/:id — remove a post ({ postId })
export const DELETE = handle(async (request: Request, ctx: Ctx) => {
  try {
    const user = await requireUser();
    const playlistId = Number(ctx.params.id);
    const own = await findOwnPlaylist(playlistId, user.id);
    if (!own) return err('Playlist not found', 404);

    const body = await request.json().catch(() => null) as { postId?: unknown } | null;
    const postId = Number(body?.postId);
    if (!Number.isInteger(postId) || postId <= 0) return err('postId is required', 400);

    await prisma.userVideoPlaylistItem.deleteMany({ where: { playlistId: own.id, postId } });
    return json({ ok: true });
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Failed to remove video from playlist', 400);
  }
});
