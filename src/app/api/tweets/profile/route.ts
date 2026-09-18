import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweetAuthor } from '@/lib/tweet';

export const GET = handle(async (req) => {
  const me = await requireUser();
  const username = new URL(req.url).searchParams.get('username')?.trim() ?? '';
  if (!username) return err('A username is required');

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, avatarId: true, profilePhotoId: true, bio: true, createdAt: true },
  });
  if (!user) return err('User not found', 404);

  const [tweets, following, followers, likedCount] = await Promise.all([
    prisma.tweet.count({ where: { authorId: user.id, visibility: 'PUBLIC' } }),
    prisma.tweetFollow.count({ where: { followerId: user.id } }),
    prisma.tweetFollow.count({ where: { followingId: user.id } }),
    prisma.tweetLike.count({ where: { tweet: { authorId: user.id, visibility: 'PUBLIC' } } }),
  ]);
  const amFollowing = await prisma.tweetFollow.findUnique({
    where: { followerId_followingId: { followerId: me.id, followingId: user.id } },
    select: { id: true },
  });

  return json({
    user: { ...serializeTweetAuthor(user), joinedAt: user.createdAt.toISOString() },
    stats: { tweets, following, followers, likedCount },
    following: !!amFollowing,
    isMe: user.id === me.id,
  });
});