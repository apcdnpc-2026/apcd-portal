import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface SendNotificationDto {
  userId: string;
  applicationId?: string;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Send notification to user
   */
  async send(dto: SendNotificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      this.logger.warn(`User ${dto.userId} not found for notification`);
      return;
    }

    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        applicationId: dto.applicationId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
      },
    });

    // Send email if available
    if (user.email) {
      await this.sendEmail(user.email, dto.title, dto.message);
    }

    return notification;
  }

  /**
   * Send application status notification
   */
  async notifyApplicationStatusChange(
    applicationId: string,
    newStatus: string,
    remarks?: string,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        applicant: true,
        oemProfile: true,
      },
    });

    if (!application) return;

    const statusMessages: Record<string, { type: NotificationType; title: string; message: string }> = {
      SUBMITTED: {
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Application Submitted',
        message: `Your application ${application.applicationNumber} has been submitted successfully.`,
      },
      QUERIED: {
        type: NotificationType.APPLICATION_QUERIED,
        title: 'Query on Your Application',
        message: `A query has been raised on your application ${application.applicationNumber}.`,
      },
      APPROVED: {
        type: NotificationType.APPLICATION_APPROVED,
        title: 'Application Approved',
        message: `Your application ${application.applicationNumber} has been approved.`,
      },
      REJECTED: {
        type: NotificationType.APPLICATION_REJECTED,
        title: 'Application Rejected',
        message: `Your application ${application.applicationNumber} has been rejected. ${remarks || ''}`,
      },
    };

    const notificationData = statusMessages[newStatus];
    if (!notificationData) return;

    return this.send({
      userId: application.applicantId,
      applicationId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
    });
  }

  /**
   * Get notifications for user
   */
  async getNotificationsForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Send expiry reminders for certificates
   */
  async sendExpiryReminders() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 60);

    const expiringCerts = await this.prisma.certificate.findMany({
      where: {
        status: 'ACTIVE',
        validUntil: { lte: cutoffDate },
      },
      include: {
        application: {
          include: { applicant: true },
        },
      },
    });

    for (const cert of expiringCerts) {
      const daysUntilExpiry = Math.ceil(
        (cert.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      await this.send({
        userId: cert.application.applicantId,
        applicationId: cert.applicationId,
        type: NotificationType.RENEWAL_REMINDER,
        title: 'Certificate Expiring Soon',
        message: `Your certificate ${cert.certificateNumber} will expire in ${daysUntilExpiry} days.`,
      });
    }

    return expiringCerts.length;
  }

  // Placeholder email sender
  private async sendEmail(to: string, subject: string, body: string) {
    this.logger.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
    // TODO: Implement with nodemailer or email service provider
  }
}
