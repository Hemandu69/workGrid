import { prisma } from '../db/client.js';

export interface NotificationReadState {
  /** Feed-item keys this user has explicitly marked read. */
  readKeys: string[];
  /** Everything created at or before this instant is read. Null when the user has never used "mark all as read". */
  readAllAt: string | null;
}

/**
 * Persistent read state for the notification feed.
 *
 * WorkGrid's feed is a projection over announcements and realtime domain
 * events rather than a stored entity, so there is no notification row to flip
 * an `isRead` flag on. What is persisted here is only the read state itself:
 *
 *   effective read  =  an explicit receipt exists
 *                      OR  notification.createdAt <= user.notificationsReadAllAt
 *
 * Every method derives the user from the authenticated principal passed in by
 * the route — no method accepts a caller-supplied user id, so one user can
 * never read or mutate another user's state.
 */
export class NotificationService {
  static async getReadState(userId: string): Promise<NotificationReadState> {
    const [receipts, user] = await Promise.all([
      prisma.notificationRead.findMany({
        where: { userId },
        select: { notificationKey: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { notificationsReadAllAt: true },
      }),
    ]);

    return {
      readKeys: receipts.map((r) => r.notificationKey),
      readAllAt: user?.notificationsReadAllAt ? user.notificationsReadAllAt.toISOString() : null,
    };
  }

  /**
   * Marks one feed item read for this user. Idempotent by construction — the
   * unique (userId, notificationKey) index turns a repeat call into an update
   * of the existing receipt rather than a duplicate row, so an already-read
   * notification safely stays read.
   */
  static async markRead(userId: string, notificationKey: string): Promise<{ notificationKey: string; readAt: string }> {
    const receipt = await prisma.notificationRead.upsert({
      where: { userId_notificationKey: { userId, notificationKey } },
      // Re-marking an already-read notification must not move its timestamp —
      // that would let a later "mark all as read" prune miss it.
      update: {},
      create: { userId, notificationKey },
      select: { notificationKey: true, readAt: true },
    });

    return { notificationKey: receipt.notificationKey, readAt: receipt.readAt.toISOString() };
  }

  /**
   * Marks everything currently in the feed read, as a single-row update rather
   * than one write per notification.
   *
   * Safe to call repeatedly (it just moves the watermark forward), and a
   * notification that arrives *after* this call stays unread because its
   * createdAt is later than the watermark.
   */
  static async markAllRead(userId: string): Promise<{ readAllAt: string }> {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { notificationsReadAllAt: now },
      });

      // Any receipt at or before the new watermark is now redundant — the
      // watermark already covers it. Pruning keeps this table from growing
      // without bound from realtime feed items whose keys never recur.
      await tx.notificationRead.deleteMany({
        where: { userId, readAt: { lte: now } },
      });
    });

    return { readAllAt: now.toISOString() };
  }
}
