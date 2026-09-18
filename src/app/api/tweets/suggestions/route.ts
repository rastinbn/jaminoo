import { handle, json, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { hiddenAuthorIds } from '@/lib/tweet-db';

export const GET = handle(async () => {
  const me = await requireUser();
  const [following, hidden] = await Promise.all([
    prisma.tweetFollow.findMany({ where: { followerId: me.id }, select: { followingId: true } }),
    hiddenAuthorIds(me.id),
  ]);
  const exclude = Array.from(new Set([me.id, ...following.map((f) => f.followingId), ...hidden]));
  const users = await prisma.user.findMany({
    where: { id: { notIn: exclude } },
    select: {
      id: true,
      username: true,
      name: true,
      avatarId: true,
      profilePhotoId: true,
      bio: true,
      _count: { select: { tweets: true, tweetFollowers: true } },
    },
    orderBy: { id: 'desc' },
    take: 6,
  });
  return json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      avatarId: u.avatarId,
      avatarPhoto: u.profilePhotoId ? `/api/media/${u.profilePhotoId}` : null,
      bio: u.bio,
      tweets: u._count.tweets,
      followers: u._count.tweetFollowers,
    })),
  });
});