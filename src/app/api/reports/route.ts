import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { rateLimitByUser } from '@/lib/rate-limit';
import { isReportReasonCode } from '@/lib/report-reasons';

export const POST = handle(async (req) => {
  const me = await requireUser();
  const body = await req.json().catch(() => ({}));
  const jamMessageId = body.jamMessageId == null ? null : Number(body.jamMessageId);
  const dmMessageId = body.dmMessageId == null ? null : Number(body.dmMessageId);
  const category = typeof body.category === 'string' ? body.category.trim().toUpperCase() : '';
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 240) : '';
  const legacyReason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  if (category && !isReportReasonCode(category)) return err('Invalid report category');
  const reason = category ? `${category}${details ? `: ${details}` : ''}` : legacyReason;
  if (!reason || (jamMessageId == null && dmMessageId == null) || (jamMessageId != null && dmMessageId != null)) return err('Invalid report');
  if (jamMessageId != null && !Number.isInteger(jamMessageId)) return err('Invalid message');
  if (dmMessageId != null && !Number.isInteger(dmMessageId)) return err('Invalid message');

  rateLimitByUser(req, me.id, 12, 10 * 60 * 1000);

  if (jamMessageId != null) {
    const message = await prisma.jamMessage.findUnique({ where: { id: jamMessageId }, select: { userId: true, jamId: true } });
    if (!message) return err('Message not found', 404);
    if (message.userId === me.id) return err('You cannot report your own message');
    const membership = await prisma.jamMember.findUnique({ where: { jamId_userId: { jamId: message.jamId, userId: me.id } } });
    if (!membership) return err('You are not in this jam', 403);
  }

  if (dmMessageId != null) {
    const message = await prisma.dmMessage.findUnique({ where: { id: dmMessageId }, select: { senderId: true, conv: { select: { userA: true, userB: true } } } });
    if (!message) return err('Message not found', 404);
    if (message.senderId === me.id) return err('You cannot report your own message');
    if (message.conv.userA !== me.id && message.conv.userB !== me.id) return err('Message not found', 404);
  }

  const target = jamMessageId != null ? { jamMessageId } : { dmMessageId };
  const existing = await prisma.messageReport.findFirst({ where: { reporterId: me.id, status: 'OPEN', ...target } });
  if (existing) return json({ report: { id: existing.id, status: existing.status }, duplicate: true });

  const report = await prisma.messageReport.create({ data: { reporterId: me.id, jamMessageId, dmMessageId, reason } });
  return json({ report: { id: report.id, status: report.status } }, 201);
});
