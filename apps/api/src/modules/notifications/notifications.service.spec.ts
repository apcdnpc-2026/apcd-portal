import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, NotificationType } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { EmailService } from './channels/email.service';
import { NotificationsService } from './notifications.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-1',
  email: 'oem@test.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'OEM',
};

const mockUserNoEmail = {
  id: 'user-2',
  email: null,
  firstName: 'No',
  lastName: 'Email',
  role: 'OEM',
};

const mockNotification = {
  id: 'notif-1',
  userId: 'user-1',
  applicationId: 'app-1',
  type: NotificationType.APPLICATION_SUBMITTED,
  title: 'Application Submitted',
  message: 'Your application APCD-2025-0001 has been submitted successfully.',
  isRead: false,
  createdAt: new Date('2025-06-15T10:00:00Z'),
};

const mockApplication = {
  id: 'app-1',
  applicationNumber: 'APCD-2025-0001',
  applicantId: 'user-1',
  applicant: mockUser,
  oemProfile: { companyName: 'Test Corp' },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: DeepMockProxy<PrismaClient>;
  let emailService: { sendEmail: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();
    const mockEmailService = { sendEmail: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = mockPrisma;
    emailService = mockEmailService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // send()
  // =========================================================================

  describe('send', () => {
    it('should create notification and send email when user has email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.notification.create.mockResolvedValue(mockNotification as any);

      const result = await service.send({
        userId: 'user-1',
        applicationId: 'app-1',
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Application Submitted',
        message: 'Your application has been submitted.',
      });

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          applicationId: 'app-1',
          type: NotificationType.APPLICATION_SUBMITTED,
          title: 'Application Submitted',
          message: 'Your application has been submitted.',
        },
      });
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        'oem@test.com',
        'Application Submitted',
        'Your application has been submitted.',
      );
    });

    it('should create notification but skip email when user has no email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserNoEmail as any);
      prisma.notification.create.mockResolvedValue(mockNotification as any);

      await service.send({
        userId: 'user-2',
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Test',
        message: 'Test message',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should return undefined when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.send({
        userId: 'nonexistent',
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Test',
        message: 'Test message',
      });

      expect(result).toBeUndefined();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should not throw when email sending fails', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.notification.create.mockResolvedValue(mockNotification as any);
      emailService.sendEmail.mockRejectedValue(new Error('SMTP connection failed'));

      // Should not throw - email errors are caught internally
      const result = await service.send({
        userId: 'user-1',
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Test',
        message: 'Test',
      });

      expect(result).toEqual(mockNotification);
    });
  });

  // =========================================================================
  // notifyApplicationStatusChange()
  // =========================================================================

  describe('notifyApplicationStatusChange', () => {
    beforeEach(() => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.notification.create.mockResolvedValue(mockNotification as any);
    });

    it('should send SUBMITTED notification', async () => {
      await service.notifyApplicationStatusChange('app-1', 'SUBMITTED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          applicationId: 'app-1',
          type: NotificationType.APPLICATION_SUBMITTED,
          title: 'Application Submitted',
        }),
      });
    });

    it('should send QUERIED notification', async () => {
      await service.notifyApplicationStatusChange('app-1', 'QUERIED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: NotificationType.APPLICATION_QUERIED,
          title: 'Query on Your Application',
        }),
      });
    });

    it('should send APPROVED notification', async () => {
      await service.notifyApplicationStatusChange('app-1', 'APPROVED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: NotificationType.APPLICATION_APPROVED,
          title: 'Application Approved',
        }),
      });
    });

    it('should send REJECTED notification with remarks', async () => {
      await service.notifyApplicationStatusChange('app-1', 'REJECTED', 'Incomplete documents');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: NotificationType.APPLICATION_REJECTED,
          title: 'Application Rejected',
          message: expect.stringContaining('Incomplete documents'),
        }),
      });
    });

    it('should send REJECTED notification without remarks', async () => {
      await service.notifyApplicationStatusChange('app-1', 'REJECTED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: NotificationType.APPLICATION_REJECTED,
        }),
      });
    });

    it('should return undefined when application is not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      const result = await service.notifyApplicationStatusChange('nonexistent', 'SUBMITTED');

      expect(result).toBeUndefined();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should return undefined for unknown status', async () => {
      const result = await service.notifyApplicationStatusChange('app-1', 'UNKNOWN_STATUS');

      expect(result).toBeUndefined();
    });

    it('should include applicationNumber in message for SUBMITTED status', async () => {
      await service.notifyApplicationStatusChange('app-1', 'SUBMITTED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          message: expect.stringContaining('APCD-2025-0001'),
        }),
      });
    });
  });

  // =========================================================================
  // getNotificationsForUser()
  // =========================================================================

  describe('getNotificationsForUser', () => {
    it('should return all notifications for user by default', async () => {
      prisma.notification.findMany.mockResolvedValue([mockNotification] as any);

      const result = await service.getNotificationsForUser('user-1');

      expect(result).toEqual([mockNotification]);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should return only unread notifications when unreadOnly is true', async () => {
      prisma.notification.findMany.mockResolvedValue([mockNotification] as any);

      await service.getNotificationsForUser('user-1', true);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should not include isRead filter when unreadOnly is false', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotificationsForUser('user-1', false);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should return empty array when user has no notifications', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      const result = await service.getNotificationsForUser('user-no-notif');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // markAsRead()
  // =========================================================================

  describe('markAsRead', () => {
    it('should mark a specific notification as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.markAsRead('notif-1', 'user-1');

      expect(result).toEqual({ count: 1 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { isRead: true },
      });
    });

    it('should return count 0 when notification does not belong to user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.markAsRead('notif-1', 'other-user');

      expect(result).toEqual({ count: 0 });
    });
  });

  // =========================================================================
  // markAllAsRead()
  // =========================================================================

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read for a user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 } as any);

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ count: 5 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      });
    });

    it('should return count 0 when user has no unread notifications', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ count: 0 });
    });
  });

  // =========================================================================
  // getUnreadCount()
  // =========================================================================

  describe('getUnreadCount', () => {
    it('should return the count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });

    it('should return 0 when user has no unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(0);
    });
  });
});
