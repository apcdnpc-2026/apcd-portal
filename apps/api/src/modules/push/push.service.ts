import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;

  constructor(private prisma: PrismaService) {
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@apcd-portal.gov.in';

    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webpush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
      this.logger.log('VAPID credentials configured');
    } else {
      this.logger.warn('VAPID credentials not configured - push notifications disabled');
    }
  }

  /**
   * Get VAPID public key for client subscription
   */
  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  /**
   * Subscribe a user to push notifications
   */
  async subscribe(userId: string, subscription: PushSubscriptionData, userAgent?: string) {
    const { endpoint, keys } = subscription;

    // Upsert subscription (update if endpoint exists, create if not)
    const pushSubscription = await this.prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint,
        },
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    });

    this.logger.log(`User ${userId} subscribed to push notifications`);
    return pushSubscription;
  }

  /**
   * Unsubscribe a user from push notifications
   */
  async unsubscribe(userId: string, endpoint: string) {
    const deleted = await this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });

    this.logger.log(`User ${userId} unsubscribed from push notifications`);
    return { deleted: deleted.count > 0 };
  }

  /**
   * Send notification to a specific user
   */
  async sendNotification(userId: string, payload: NotificationPayload) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No push subscriptions found for user ${userId}`);
      return { sent: 0, failed: 0 };
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendToSubscription(sub, payload)),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Push notification sent to user ${userId}: ${sent} successful, ${failed} failed`,
    );
    return { sent, failed };
  }

  /**
   * Send notification to all subscribed users (admin broadcast)
   */
  async sendToAll(payload: NotificationPayload) {
    const subscriptions = await this.prisma.pushSubscription.findMany();

    if (subscriptions.length === 0) {
      this.logger.debug('No push subscriptions found for broadcast');
      return { sent: 0, failed: 0 };
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendToSubscription(sub, payload)),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Broadcast push notification: ${sent} successful, ${failed} failed`);
    return { sent, failed };
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
      },
    });
  }

  /**
   * Send to a single subscription and handle errors
   */
  private async sendToSubscription(
    subscription: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: NotificationPayload,
  ) {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    } catch (error: unknown) {
      const webPushError = error as { statusCode?: number; message?: string };

      // Handle expired/invalid subscriptions (410 Gone or 404 Not Found)
      if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
        this.logger.warn(`Removing expired subscription: ${subscription.id}`);
        await this.prisma.pushSubscription.delete({
          where: { id: subscription.id },
        });
      } else {
        this.logger.error(
          `Failed to send push notification: ${webPushError.message || 'Unknown error'}`,
        );
      }
      throw error;
    }
  }
}
