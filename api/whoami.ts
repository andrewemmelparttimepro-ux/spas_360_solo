import type { VercelRequest, VercelResponse } from '@vercel/node';

/** The caller's public IP, stamped onto time-clock punches so an owner can see where a punch came from. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded ?? '';
  const ip = raw.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ip });
}
