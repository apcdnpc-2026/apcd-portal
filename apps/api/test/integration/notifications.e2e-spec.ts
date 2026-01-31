import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemToken: string;
  let oemUserId: string;
  let secondOemToken: string;
  let secondOemUserId: string;

  const password = 'Str0ng@Pass!';

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    await cleanDatabase(prisma);

    const passwordHash = await bcrypt.hash(password, 12);

    // Create first OEM user
    const oemUser = await prisma.user.create({
      data: {
        email: 'oem-notif@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Notified',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create second OEM user (for isolation tests)
    const secondOemUser = await prisma.user.create({
      data: {
        email: 'oem-notif-2@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Other',
        isActive: true,
        isVerified: true,
      },
    });
    secondOemUserId = secondOemUser.id;

    // Create sample notifications for the first OEM user
    await prisma.notification.createMany({
      data: [
        {
          userId: oemUserId,
          title: 'Application Submitted',
          message: 'Your application APCD-2025-0001 has been submitted successfully.',
          type: 'APPLICATION_UPDATE',
          isRead: false,
        },
        {
          userId: oemUserId,
          title: 'Query Raised',
          message: 'A query has been raised on your application APCD-2025-0001.',
          type: 'QUERY',
          isRead: false,
        },
        {
          userId: oemUserId,
          title: 'Payment Verified',
          message: 'Your payment for application APCD-2025-0001 has been verified.',
          type: 'PAYMENT',
          isRead: true,
        },
        {
          userId: oemUserId,
          title: 'Application Approved',
          message: 'Congratulations! Your application APCD-2025-0001 has been approved.',
          type: 'APPLICATION_UPDATE',
          isRead: false,
        },
      ],
    });

    // Create a notification for the second user (should not be visible to first)
    await prisma.notification.create({
      data: {
        userId: secondOemUserId,
        title: 'Other User Notification',
        message: 'This belongs to a different user.',
        type: 'APPLICATION_UPDATE',
        isRead: false,
      },
    });

    // Login both users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-notif@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const secondOemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-notif-2@test.com', password });
    secondOemToken = secondOemLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Get Notifications ────────────────────────────────────────────────────────

  describe('GET /api/notifications', () => {
    it('should return all notifications for the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data || res.body)).toBe(true);

      const notifications = res.body.data || res.body;
      expect(notifications.length).toBe(4);

      // Each notification should have expected properties
      for (const notif of notifications) {
        expect(notif).toHaveProperty('id');
        expect(notif).toHaveProperty('title');
        expect(notif).toHaveProperty('message');
        expect(notif).toHaveProperty('type');
        expect(notif).toHaveProperty('isRead');
        expect(notif).toHaveProperty('createdAt');
        expect(notif.userId).toBe(oemUserId);
      }
    });

    it('should not include notifications from other users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      const notifications = res.body.data || res.body;
      const otherUserNotif = notifications.find(
        (n: any) => n.title === 'Other User Notification',
      );
      expect(otherUserNotif).toBeUndefined();
    });

    it('second user should only see their own notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${secondOemToken}`)
        .expect(200);

      const notifications = res.body.data || res.body;
      expect(notifications.length).toBe(1);
      expect(notifications[0].title).toBe('Other User Notification');
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/notifications')
        .expect(401);
    });
  });

  // ─── Get Unread Count ──────────────────────────────────────────────────────────

  describe('GET /api/notifications/unread-count', () => {
    it('should return the count of unread notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('count');
      // 3 unread out of 4 total (one was created with isRead: true)
      expect(res.body.count).toBe(3);
    });

    it('second user should have 1 unread notification', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${secondOemToken}`)
        .expect(200);

      expect(res.body.count).toBe(1);
    });
  });

  // ─── Mark Single Notification as Read ──────────────────────────────────────────

  describe('PUT /api/notifications/:id/read', () => {
    let notificationId: string;

    beforeAll(async () => {
      const notification = await prisma.notification.findFirst({
        where: { userId: oemUserId, isRead: false, title: 'Query Raised' },
      });
      notificationId = notification!.id;
    });

    it('should mark a single notification as read', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Verify the notification is now read in the database
      const updated = await prisma.notification.findUnique({
        where: { id: notificationId },
      });
      expect(updated!.isRead).toBe(true);
    });

    it('unread count should decrease after marking as read', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      // Was 3, now should be 2 after marking one as read
      expect(res.body.count).toBe(2);
    });

    it('should return 404 for nonexistent notification', async () => {
      await request(app.getHttpServer())
        .put('/api/notifications/00000000-0000-0000-0000-000000000000/read')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(404);
    });

    it('should not allow marking another user notification as read', async () => {
      const otherNotif = await prisma.notification.findFirst({
        where: { userId: secondOemUserId },
      });

      await request(app.getHttpServer())
        .put(`/api/notifications/${otherNotif!.id}/read`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(404);
    });
  });

  // ─── Mark All Notifications as Read ────────────────────────────────────────────

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read for the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('updatedCount');
      expect(res.body.updatedCount).toBeGreaterThanOrEqual(2);
    });

    it('unread count should be 0 after marking all as read', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body.count).toBe(0);
    });

    it('should not affect other user notifications', async () => {
      // Second user's notification should still be unread
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${secondOemToken}`)
        .expect(200);

      expect(res.body.count).toBe(1);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .put('/api/notifications/read-all')
        .expect(401);
    });
  });
});
