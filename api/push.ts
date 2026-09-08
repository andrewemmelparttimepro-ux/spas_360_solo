import {dispatchPush} from './_lib/push-delivery.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';

/**
 * Web Push dispatcher. Postgres calls this (pg_net trigger on notifications
 * insert) with the recipient's subscriptions in the payload — so this function
 * needs no database access at all: verify the shared secret, sign with VAPID,
 * fan out. Each endpoint outcome is returned to the database receipt reconciler.
 * Expired registrations are removed there; acceptance is not device delivery.
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
  if (typeof title !== 'string' || !title || !Array.isArray(subscriptions) || subscriptions.length === 0 || subscriptions.length > 50
    || subscriptions.some(sub => !sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')
      || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string')) {
    return res.status(400).json({ error: 'title and subscriptions required' });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const payload = JSON.stringify({ title, body: body ?? '', link: link ?? '/' });
  const result=await dispatchPush(subscriptions,sub=>webpush.sendNotification(sub,payload,{TTL:60*60*4,timeout:10000}));
  return res.status(200).json(result);
}
