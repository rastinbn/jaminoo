import { createHash } from 'crypto';
import { rateLimit, rateLimitByUser } from '@/lib/rate-limit';

const TEXT_LIMIT = 8;
const TEXT_WINDOW = 10 * 1000;
const DUPLICATE_LIMIT = 2;
const DUPLICATE_WINDOW = 20 * 1000;
const VOICE_LIMIT = 5;
const VOICE_WINDOW = 60 * 1000;

export function guardTextMessage(req: Request, userId: number, text: string) {
  rateLimitByUser(req, userId, TEXT_LIMIT, TEXT_WINDOW);
  const normalized = text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length < 3) return;
  const fingerprint = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  rateLimit(`chat:duplicate:${userId}:${fingerprint}`, DUPLICATE_LIMIT, DUPLICATE_WINDOW);
}

export function guardVoiceMessage(req: Request, userId: number) {
  rateLimitByUser(req, userId, VOICE_LIMIT, VOICE_WINDOW);
}
