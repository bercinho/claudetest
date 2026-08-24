import "server-only";

import crypto from "node:crypto";
import webpush from "web-push";
import { getDb, getSettings, setSetting } from "./db";
import type { Role } from "./types";

/**
 * Web Push. The VAPID key pair is generated once and kept in `settings`, so a
 * home install needs no configuration; set `VAPID_PUBLIC_KEY` and
 * `VAPID_PRIVATE_KEY` in the environment to pin it instead.
 */

export type Vapid = { publicKey: string; privateKey: string; subject: string };

function readVapid(): Vapid {
  const subject = process.env.PUSH_CONTACT?.trim() || "mailto:family-hq@localhost";

  const fromEnv = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateFromEnv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (fromEnv && privateFromEnv) return { publicKey: fromEnv, privateKey: privateFromEnv, subject };

  const db = getDb();
  const row = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('vapid_public_key', 'vapid_private_key')")
    .all() as { key: string; value: string }[];
  const stored = new Map(row.map((r) => [r.key, r.value]));

  const publicKey = stored.get("vapid_public_key");
  const privateKey = stored.get("vapid_private_key");
  if (publicKey && privateKey) return { publicKey, privateKey, subject };

  const generated = webpush.generateVAPIDKeys();
  setSetting("vapid_public_key", generated.publicKey);
  setSetting("vapid_private_key", generated.privateKey);
  return { publicKey: generated.publicKey, privateKey: generated.privateKey, subject };
}

/** The key the browser needs in order to subscribe. Safe to hand to the client. */
export function publicKey(): string {
  return readVapid().publicKey;
}

export type Subscription = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
};

export function saveSubscription(args: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, label)
       VALUES (@userId, @endpoint, @p256dh, @auth, @label)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         label = excluded.label,
         failures = 0`,
    )
    .run(args);
}

export function removeSubscription(endpoint: string): void {
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function subscriptionCount(userId: number): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").get(userId) as { n: number }
  ).n;
}

export function hasSubscription(endpoint: string, userId: number): boolean {
  return (
    getDb()
      .prepare("SELECT 1 FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
      .get(endpoint, userId) !== undefined
  );
}

export type Message = {
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  url?: string;
  /** Notifications sharing a tag replace one another instead of stacking up. */
  tag?: string;
};

async function sendTo(subscription: Subscription, message: Message): Promise<boolean> {
  const vapid = readVapid();
  const db = getDb();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(message),
      {
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 6 * 60 * 60,
      },
    );
    db.prepare("UPDATE push_subscriptions SET last_sent_at = datetime('now'), failures = 0 WHERE id = ?").run(
      subscription.id,
    );
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410 mean the browser threw the subscription away; stop trying.
    if (status === 404 || status === 410) {
      db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(subscription.id);
    } else {
      db.prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?").run(subscription.id);
    }
    return false;
  }
}

function subscriptionsFor(userIds: number[]): Subscription[] {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT id, user_id, endpoint, p256dh, auth, label FROM push_subscriptions
        WHERE user_id IN (${placeholders})`,
    )
    .all(...userIds) as Subscription[];
}

/**
 * Sends to every device belonging to the given people. Failures are swallowed:
 * a notification that does not arrive must never break the action that caused
 * it, so this is always called without awaiting the result.
 */
export function push(userIds: number[], message: Message): void {
  const subscriptions = subscriptionsFor(userIds);
  if (subscriptions.length === 0) return;

  void Promise.allSettled(subscriptions.map((subscription) => sendTo(subscription, message)));
}

/** Everyone in a role, optionally excluding the person who caused the event. */
export function usersInRole(role: Role, exceptUserId?: number): number[] {
  const rows = getDb()
    .prepare("SELECT id FROM users WHERE role = ? AND active = 1")
    .all(role) as { id: number }[];
  return rows.map((r) => r.id).filter((id) => id !== exceptUserId);
}

/** Used by the settings page to show what would be sent. */
export async function sendTest(userId: number): Promise<number> {
  const subscriptions = subscriptionsFor([userId]);
  const settings = getSettings();
  const results = await Promise.all(
    subscriptions.map((subscription) =>
      sendTo(subscription, {
        title: settings.familyName,
        body: "Notifications are working.",
        url: "/",
        tag: "test",
      }),
    ),
  );
  return results.filter(Boolean).length;
}

/** Opaque token for a companion device. Returned once, stored only as a hash. */
export function newDeviceToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
