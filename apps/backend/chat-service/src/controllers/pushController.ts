import type { Request, Response } from 'express';
import { pushConfig, removeSubscription, saveSubscription } from '../services/pushService';
import { unreadFor } from '../services/pushNotify';
import { id } from '../validation/commonSchemas';
import { parsed } from '../validation/parse';
import { pushSubscriptionSchema, unsubscribeSchema } from '../validation/pushSchemas';
import { setRunAlerts, wantsRunAlerts } from '../services/runAlerts';
import { pushPreferencesSchema } from '../validation/runAlertSchemas';

/** GET /push/config: whether this server can send notifications, and the public key a browser subscribes with. */
export async function config(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await pushConfig() });
}

/** POST /push/subscriptions. Re-posted on every app start: a push endpoint can be rotated by the browser. */
export async function subscribe(req: Request, res: Response): Promise<void> {
  const { enabled } = await pushConfig();
  if (!enabled) {
    res.json({ success: true, data: { configured: false } });
    return;
  }
  await saveSubscription(req.user!.id, parsed(pushSubscriptionSchema, req.body), req.get('user-agent'));
  res.json({ success: true, data: { configured: true } });
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  await removeSubscription(req.user!.id, parsed(unsubscribeSchema, req.body).endpoint);
  res.json({ success: true });
}

/**
 * GET /push/unread[?conversation=id]: the number of conversations with unread messages, and whether the one named
 * still has some. The service worker asks before showing a push that sat at the push service while the browser was
 * closed, because the message may have been read on another device since.
 */
export async function unread(req: Request, res: Response): Promise<void> {
  const conversation = req.query.conversation === undefined ? undefined : parsed(id, req.query.conversation);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await unreadFor(req.user!.id, conversation) });
}

/** GET /push/preferences: what this person wants pushed besides messages and calls. */
export async function preferences(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { runs: await wantsRunAlerts(req.user!.id) } });
}

export async function savePreferences(req: Request, res: Response): Promise<void> {
  const { runs } = parsed(pushPreferencesSchema, req.body);
  await setRunAlerts(req.user!.id, runs);
  res.json({ success: true, data: { runs } });
}
