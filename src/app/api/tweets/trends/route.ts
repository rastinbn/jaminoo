import { handle, json, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const GET = handle(async () => {
  await requireUser();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await prisma.tweet.findMany({
    where: { visibility: 'PUBLIC', replyToId: null, createdAt: { gte: since } },
    select: { text: true },
    orderBy: { id: 'desc' },
    take: 800,
  });
  const counts = new Map<string, number>();
  for (const tweet of recent) {
    const matches = tweet.text.match(/#([\p{L}\p{N}_]+)/gu) ?? [];
    for (const raw of matches) {
      const tag = raw.slice(1);
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const trends = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
  return json({ trends });
});