import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';

/**
 * Web Push dispatcher. Postgres calls this (pg_net trigger on notifications
 * insert) with the recipient's subscriptions in the payload — so this function
 * needs no database access at all: verify the shared secret, sign with VAPID,
 * fan out. Expired endpoints (404/410) are reported back in the response and
 * cleaned up lazily by the client's next re-sync.
 */

const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:andrew@ndai.pro';
const SECRET = process.env.PUSH_WEBHOOK_SECRET;

interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SECRET || req.headers['x-push-secret'] !== SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  const { title, body, link, subscriptions } = (req.body ?? {}) as {
    title?: string; body?: string; link?: string; subscriptions?: PushSubscriptionPayload[];
  };
  if (!title || !Array.isArray(subscriptions) || subscriptions.length === 0) {
    return res.status(400).json({ error: 'title and subscriptions required' });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const payload = JSON.stringify({ title, body: body ?? '', link: link ?? '/' });
  let sent = 0;
  const expired: string[] = [];

  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 4 });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) expired.push(sub.endpoint);
      // other failures: drop silently — push is best-effort by design
    }
  }));

  return res.status(200).json({ sent, expired });
}
