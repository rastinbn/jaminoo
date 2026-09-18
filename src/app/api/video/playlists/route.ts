import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeVideoPost } from '@/lib/video-post';

const postInclude = {
  author: { select: { id: true, username: true, avatarId: true, profilePhotoId: true } },
  asset: { select: { id: true } },
  thumbnailAsset: { select: { id: true } },
  _count: { select: { likes: true, saves: true, comments: true } },
  likes: { select: { id: true, userId: true } },
  saves: { select: { id: true, userId: true } },
} as const;

type PlaylistRow = {
  id: number;
  name: string;
  desc: string;
  isPublic: boolean;
  createdAt: Date;
  items: { id: number; pos: number; post: any }[];
};

function playlistPayload(playlist: PlaylistRow, meId: number) {
  return {
    id: playlist.id,
    name: playlist.name,
    desc: playlist.desc,
    isPublic: playlist.isPublic,
    createdAt: playlist.createdAt.toISOString(),
    items: playlist.items
      .slice()
      .sort((a, b) => a.pos - b.pos || a.id - b.id)
      .map((item) => ({
        id: item.id,
        pos: item.pos,
        post: serializeVideoPost({
          ...item.post,
          liked: item.post.likes.some((l: { userId: number }) => l.userId === meId),
          saved: item.post.saves.some((s: { userId: number }) => s.userId === meId),
        }),
      })),
  };
}

// GET /api/video/playlists — my playlists (with items), or a single one with ?id=
export const GET = handle(async (req) => {
  const me = await requireUser();
  const id = Number(new URL(req.url).searchParams.get('id') ?? 0);
  if (Number.isInteger(id) && id > 0) {
    const playlist = await prisma.userVideoPlaylist.findFirst({
      where: { id, OR: [{ userId: me.id }, { isPublic: true }] },
      include: { items: { include: { post: { include: postInclude } } } },
    });
    if (!playlist) return err('Playlist not found', 404);
    return json({ playlist: playlistPayload(playlist, me.id) });
  }
  const playlists = await prisma.userVideoPlaylist.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: { pos: 'asc' }, include: { post: { include: postInclude } } } },
  });
  return json({ playlists: playlists.map((playlist) => playlistPayload(playlist, me.id)) });
});

export const POST = handle(async (req) => {
  const me = await requireUser();
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const desc = typeof body.desc === 'string' ? body.desc.trim().slice(0, 240) : '';
  const isPublic = body.isPublic === true;
  if (!name) return err('Playlist name is required');
  const exists = await prisma.userVideoPlaylist.findUnique({ where: { userId_name: { userId: me.id, name } }, select: { id: true } });
  if (exists) return err('Playlist already exists', 409);
  const playlist = await prisma.userVideoPlaylist.create({ data: { userId: me.id, name, desc, isPublic } });
  return json({ playlist: { ...playlist, createdAt: playlist.createdAt.toISOString(), items: [] } }, 201);
});
