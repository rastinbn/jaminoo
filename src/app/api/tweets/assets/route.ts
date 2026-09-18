import { handle, json, err, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/upload-storage';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function sniffImage(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 6).toLowerCase() === 'gif89a') return 'image/gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function sniffVideo(buffer: Buffer, declaredMime: string): string | null {
  const mime = declaredMime.split(';')[0].trim().toLowerCase();
  if (!VIDEO_MIMES.has(mime)) return null;
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && (mime === 'video/mp4' || mime === 'video/quicktime')) return mime;
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3 && mime === 'video/webm') return mime;
  return null;
}

export const POST = handle(async (req: Request) => {
  const me = await requireUser();

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return err('No file provided');
  if (file.size <= 0) return err('The selected file is empty');

  const buffer = Buffer.from(await file.arrayBuffer());
  const declaredMime = (file.type || '').split(';')[0].trim().toLowerCase();
  const imageMime = IMAGE_MIMES.has(declaredMime) ? sniffImage(buffer) : null;
  const videoMime = VIDEO_MIMES.has(declaredMime) ? sniffVideo(buffer, declaredMime) : null;
  const mime = imageMime || videoMime;
  if (!mime) return err('Only valid PNG, JPG, GIF, WEBP, MP4, MOV or WEBM files are allowed');
  if (mime.startsWith('image/') && file.size > MAX_IMAGE_BYTES) return err('Images must be smaller than 15 MB');
  if (mime.startsWith('video/') && file.size > MAX_VIDEO_BYTES) return err('Videos must be smaller than 100 MB');

  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : mime === 'image/jpeg' ? 'jpg' : mime === 'video/webm' ? 'webm' : mime === 'video/quicktime' ? 'mov' : 'mp4';
  const id = `${me.id}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const filename = `${id}.${extension}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const record = await prisma.media.create({
    data: { id, userId: me.id, kind: mime.startsWith('image/') ? 'IMAGE_ASSET' : 'VIDEO_ASSET', filename, mime, size: file.size },
  });

  return json({
    asset: {
      id: record.id,
      mime: record.mime,
      size: record.size,
      type: mime.startsWith('image/') ? 'IMAGE' : 'VIDEO',
      url: `/api/media/${record.id}`,
    },
  }, 201);
});