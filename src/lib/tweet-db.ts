// Shared Tweet Hub query shapes — avoids N+1 and keeps serialization consistent.
import { prisma } from '@/lib/prisma';

export const TWEET_ACTOR_SELECT = {
  select: {
    id: true,
    username: true,
    name: true,
    avatarId: true,
    profilePhotoId: true,
    bannerPhotoId: true,
    bio: true,
    website: true,
    location: true,
  },
};

const QUOTE_NEST_INCLUDE = {
  author: TWEET_ACTOR_SELECT,
  assets: {
    orderBy: { pos: 'asc' as const },
    include: { media: { select: { id: true, mime: true } } },
  },
  _count: { select: { likes: true, retweets: true, replies: true } },
};

export function tweetIncludes(userId: number, withQuoted = true) {
  return {
    author: TWEET_ACTOR_SELECT,
    assets: {
      orderBy: { pos: 'asc' as const },
      include: { media: { select: { id: true, mime: true } } },
    },
    ...(withQuoted ? { quoted: { include: QUOTE_NEST_INCLUDE } } : {}),
    _count: { select: { likes: true, retweets: true, replies: true, quotes: true } },
    likes: { where: { userId }, select: { id: true } },
    bookmarks: { where: { userId }, select: { id: true } },
  };
}

// Ids of authors that must not appear in the timeline: users I blocked,
// users who blocked me, and users I muted.
export async function hiddenAuthorIds(userId: number) {
  const [blocksI, blocksAgainstMe, mutes] = await Promise.all([
    prisma.tweetBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.tweetBlock.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
    prisma.tweetMute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
  ]);
  return Array.from(
    new Set([
      ...blocksI.map((b) => b.blockedId),
      ...blocksAgainstMe.map((b) => b.blockerId),
      ...mutes.map((m) => m.mutedId),
    ])
  );
}