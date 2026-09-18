import { handle, json, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const GET = handle(async () => {
  const me = await requireUser();
  const following = await prisma.tweetFollow.findMany({ where: { followerId: me.id }, select: { followingId: true } });
  const exclude = [me.id, ...following.map((f) => f.followingId)];
  const users = await prisma.user.findMany({
    where: { id: { notIn: exclude } },
    select: {
      id: true,
      username: true,
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
      avatarId: u.avatarId,
      avatarPhoto: u.profilePhotoId ? `/api/media/${u.profilePhotoId}` : null,
      bio: u.bio,
      tweets: u._count.tweets,
      followers: u._count.tweetFollowers,
    })),
  });
});