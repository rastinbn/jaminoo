import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

type Ctx = { params: { id: string } };

const REASONS = ['SPAM', 'HARASSMENT', 'HATE', 'VIOLENCE', 'SEXUAL', 'FRAUD', 'OTHER'] as const;
const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment',
  HATE: 'Hateful content',
  VIOLENCE: 'Violence',
  SEXUAL: 'Sexual content',
  FRAUD: 'Scam or fraud',
  OTHER: 'Something else',
};

export const POST = handle(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid tweet', 400);

  const tweet = await prisma.tweet.findUnique({ where: { id }, select: { id: true, visibility: true } });
  if (!tweet || tweet.visibility !== 'PUBLIC') return err('Tweet not found', 404);

  const body = await req.json().catch(() => ({}));
  const category = typeof body.reason === 'string' ? body.reason.toUpperCase() : '';
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 300) : '';
  if (!REASONS.includes(category as any)) return err('Choose a report reason');

  const existing = await prisma.messageReport.findFirst({
    where: { reporterId: me.id, tweetId: id, status: 'OPEN' },
    select: { id: true },
  });
  if (existing) return err('You already reported this tweet', 409);

  await prisma.messageReport.create({
    data: {
      reporterId: me.id,
      tweetId: id,
      reasonCategory: category,
      reason: details || REASON_LABELS[category],
    },
  });
  return json({ ok: true }, 201);
});