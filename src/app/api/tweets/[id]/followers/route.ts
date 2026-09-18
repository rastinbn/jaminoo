import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { TWEET_ACTOR_SELECT } from '@/lib/tweet-db';

type Ctx = { params: { id: string } };

function toUserRow(u: any, followerIds: Set<number>, queryUserId: number, isMe: boolean) {
  const id = typeof u.followerId === 'number' ? u.follower.id : u.following.id;
  const user = u.follower ?? u.following;
  return {
    id,
    username: user.username,
    name: user.name ?? '',
    avatarId: user.avatarId,
    avatarPhoto: user.profilePhotoId ? `/api/media/${user.profilePhotoId}` : null,
    bio: user.bio ?? '',
    tweets: user._count?.tweets ?? 0,
    followersCount: user._count?.tweetFollowers ?? 0,
    isMe,
    following: followerIds.has(id),
    isTarget: id === queryUserId,
  };
}

async function list(req: Request, { params }: Ctx, mode: 'followers' | 'following') {
  const me = await requireUser();
  const userId = Number(params.id);
  if (!Number.isInteger(userId) || userId <= 0) return err('Invalid user', 400);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return err('User not found', 404);

  const cursor = Number(new URL(req.url).searchParams.get('cursor') ?? 0);

  const followers =
    mode === 'followers'
      ? { follower: { ...TWEET_ACTOR_SELECT, select: { ...TWEET_ACTOR_SELECT.select, _count: { select: { tweets: true, tweetFollowers: true } } } } }
      : { following: { ...TWEET_ACTOR_SELECT, select: { ...TWEET_ACTOR_SELECT.select, _count: { select: { tweets: true, tweetFollowers: true } } } } };

  const where: any = mode === 'followers' ? { followingId: userId } : { followerId: userId };
  if (Number.isInteger(cursor) && cursor > 0) where.id = { lt: cursor };

  const rows = await prisma.tweetFollow.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 26,
    include: followers,
  });
  const hasMore = rows.length > 25;
  const page = hasMore ? rows.slice(0, 25) : rows;

  const ids = page.map((r) => (mode === 'followers' ? r.follower.id : r.following.id));
  const mine = await prisma.tweetFollow.findMany({
    where: { followerId: me.id, followingId: { in: ids } },
    select: { followingId: true },
  });
  const followerSet = new Set(mine.map((m) => m.followingId));

  return json({
    users: page.map((r) => toUserRow(r, followerSet, userId, userId === me.id)),
    nextCursor: hasMore ? String(page[page.length - 1].id) : null,
    hasMore,
  });
}

export const GET = handle(async (req, { params }: Ctx) => list(req, { params }, 'followers'));