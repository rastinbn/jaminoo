import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { serializeTweetAuthor } from '@/lib/tweet';
import { TWEET_ACTOR_SELECT } from '@/lib/tweet-db';

const PROFILE_SELECT = {
  ...TWEET_ACTOR_SELECT.select,
  createdAt: true,
  github: true,
};

export const GET = handle(async (req) => {
  const me = await requireUser();
  const username = new URL(req.url).searchParams.get('username')?.trim() ?? '';
  if (!username) return err('A username is required');

  const user = await prisma.user.findUnique({
    where: { username },
    select: PROFILE_SELECT,
  });
  if (!user) return err('User not found', 404);

  const [tweets, replies, media, likes, following, followers, amFollowing, blockRow, blockedByRow, muteRow] = await Promise.all([
    prisma.tweet.count({ where: { authorId: user.id, visibility: 'PUBLIC', replyToId: null } }),
    prisma.tweet.count({ where: { authorId: user.id, visibility: 'PUBLIC', replyToId: { not: null } } }),
    prisma.tweetAsset.count({ where: { tweet: { authorId: user.id, visibility: 'PUBLIC' } } }),
    prisma.tweetLike.count({ where: { tweet: { authorId: user.id, visibility: 'PUBLIC' } } }),
    prisma.tweetFollow.count({ where: { followerId: user.id } }),
    prisma.tweetFollow.count({ where: { followingId: user.id } }),
    prisma.tweetFollow.findUnique({ where: { followerId_followingId: { followerId: me.id, followingId: user.id } }, select: { id: true } }),
    prisma.tweetBlock.findUnique({ where: { blockerId_blockedId: { blockerId: me.id, blockedId: user.id } }, select: { id: true } }),
    prisma.tweetBlock.findUnique({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: me.id } }, select: { id: true } }),
    prisma.tweetMute.findUnique({ where: { muterId_mutedId: { muterId: me.id, mutedId: user.id } }, select: { id: true } }),
  ]);

  return json({
    user: { ...serializeTweetAuthor(user), joinedAt: user.createdAt.toISOString() },
    stats: {
      tweets,
      replies,
      media,
      likes,
      following,
      followers,
      likedCount: likes,
    },
    following: !!amFollowing,
    blocked: !!blockRow,
    blockedBy: !!blockedByRow,
    muted: !!muteRow,
    isMe: user.id === me.id,
  });
});

export const PATCH = handle(async (req) => {
  const me = await requireUser();
  const body = await req.json().catch(() => ({}));

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : undefined;
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 160) : undefined;
  const website = typeof body.website === 'string' ? body.website.trim().slice(0, 120) : undefined;
  const location = typeof body.location === 'string' ? body.location.trim().slice(0, 60) : undefined;

  let bannerPhotoId: string | undefined | null = undefined;
  if (typeof body.bannerPhotoId === 'string') {
    const media = await prisma.media.findUnique({ where: { id: body.bannerPhotoId }, select: { id: true, userId: true, kind: true } });
    if (!media || media.userId !== me.id) return err('Banner image not found', 404);
    if (!media.kind.startsWith('IMAGE')) return err('Banner must be a photo');
    bannerPhotoId = media.id;
  } else if (body.bannerPhotoId === null) {
    bannerPhotoId = null;
  }

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(website !== undefined ? { website } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(bannerPhotoId !== undefined ? { bannerPhotoId } : {}),
    },
    select: PROFILE_SELECT,
  });
  return json({ user: { ...serializeTweetAuthor(updated), joinedAt: updated.createdAt.toISOString() } });
});