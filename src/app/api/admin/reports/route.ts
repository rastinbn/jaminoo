import { handle, json, requireAdmin } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? '';
  const q = url.searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const per = Math.min(50, Math.max(1, Number(url.searchParams.get('per') ?? 25)));
  const where: any = {};
  if (status) where.status = status;
  if (q) where.OR = [{ reason: { contains: q } }, { reporter: { username: { contains: q } } }];
  const [reports, total] = await Promise.all([
    prisma.messageReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * per,
      take: per,
      include: {
        reporter: { select: { id: true, username: true } },
        jamMessage: { select: { id: true, text: true, user: { select: { username: true } }, jam: { select: { name: true } } } },
        dmMessage: { select: { id: true, text: true, sender: { select: { username: true } } } },
        videoPost: { select: { id: true, title: true, author: { select: { username: true } } } },
        tweet: { select: { id: true, text: true, author: { select: { username: true } } } },
      },
    }),
    prisma.messageReport.count({ where }),
  ]);
  return json({
    rows: reports.map((report) => ({
      id: report.id,
      status: report.status,
      reason: report.reasonCategory ? `${report.reasonCategory}: ${report.reason}` : report.reason,
      createdAt: report.createdAt.toISOString(),
      reporter: report.reporter.username,
      message: report.jamMessage ?? report.dmMessage ?? report.videoPost ?? report.tweet,
      kind: report.jamMessage ? 'jam' : report.dmMessage ? 'dm' : report.videoPost ? 'video' : 'tweet',
    })),
    total,
    page,
    per,
  });
});

export const PATCH = handle(async (req) => {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';
  if (!Number.isInteger(id) || !['OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED'].includes(status)) return json({ error: 'Invalid report update' }, 400);
  const report = await prisma.messageReport.update({ where: { id }, data: { status } });
  return json({ report });
});
