import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Role, CertificateStatus, PaymentStatus, QueryStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get OEM dashboard data
   */
  async getOemDashboard(userId: string) {
    const [
      applications,
      certificates,
      pendingQueries,
      payments,
    ] = await Promise.all([
      this.prisma.application.findMany({
        where: { applicantId: userId },
        select: {
          id: true,
          applicationNumber: true,
          status: true,
          createdAt: true,
          submittedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.certificate.findMany({
        where: { application: { applicantId: userId } },
        select: {
          id: true,
          certificateNumber: true,
          status: true,
          validUntil: true,
        },
      }),
      this.prisma.query.count({
        where: {
          application: { applicantId: userId },
          status: QueryStatus.OPEN,
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          application: { applicantId: userId },
          status: PaymentStatus.VERIFIED,
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // Count applications by status
    const statusCounts = applications.reduce(
      (acc, app) => {
        acc[app.status] = (acc[app.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Check for expiring certificates
    const now = new Date();
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);

    const expiringCertificates = certificates.filter(
      (cert) =>
        cert.status === CertificateStatus.ACTIVE &&
        cert.validUntil > now &&
        cert.validUntil <= sixtyDaysLater,
    );

    return {
      applications: {
        recent: applications,
        statusCounts,
        total: applications.length,
      },
      certificates: {
        active: certificates.filter((c) => c.status === CertificateStatus.ACTIVE).length,
        expiring: expiringCertificates,
        total: certificates.length,
      },
      pendingQueries,
      totalPayments: payments._sum.totalAmount || 0,
    };
  }

  /**
   * Get Officer dashboard data
   */
  async getOfficerDashboard() {
    const [
      applicationsByStatus,
      pendingPayments,
      pendingFieldVerifications,
      recentApplications,
      todayStats,
    ] = await Promise.all([
      // Applications by status
      this.prisma.application.groupBy({
        by: ['status'],
        _count: true,
      }),
      // Pending payment verifications
      this.prisma.payment.count({
        where: { status: PaymentStatus.VERIFICATION_PENDING },
      }),
      // Pending field verifications
      this.prisma.application.count({
        where: { status: ApplicationStatus.FIELD_VERIFICATION },
      }),
      // Recent applications
      this.prisma.application.findMany({
        select: {
          id: true,
          applicationNumber: true,
          status: true,
          createdAt: true,
          oemProfile: {
            select: { companyName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // Today's stats
      this.getTodayStats(),
    ]);

    const statusMap = applicationsByStatus.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      applicationsByStatus: statusMap,
      totalApplications: Object.values(statusMap).reduce((a, b) => a + b, 0),
      pendingPayments,
      pendingFieldVerifications,
      pendingCommitteeReview: statusMap[ApplicationStatus.COMMITTEE_REVIEW] || 0,
      recentApplications,
      todayStats,
    };
  }

  /**
   * Get Admin dashboard data
   */
  async getAdminDashboard() {
    const [
      officerDashboard,
      userStats,
      certificateStats,
      paymentStats,
    ] = await Promise.all([
      this.getOfficerDashboard(),
      this.getUserStats(),
      this.getCertificateStats(),
      this.getPaymentStats(),
    ]);

    return {
      ...officerDashboard,
      userStats,
      certificateStats,
      paymentStats,
    };
  }

  /**
   * Get Field Verifier dashboard
   */
  async getFieldVerifierDashboard(verifierId: string) {
    const [assigned, completed, upcoming] = await Promise.all([
      this.prisma.fieldReport.count({
        where: { verifierId },
      }),
      this.prisma.fieldReport.count({
        where: { verifierId },
      }),
      this.prisma.fieldReport.findMany({
        where: {
          verifierId,
          visitDate: { gte: new Date() },
        },
        include: {
          application: {
            include: {
              oemProfile: {
                select: { companyName: true, fullAddress: true },
              },
            },
          },
        },
        orderBy: { visitDate: 'asc' },
        take: 10,
      }),
    ]);

    return {
      assignedCount: assigned,
      completedCount: completed,
      upcomingVerifications: upcoming,
    };
  }

  /**
   * Get Committee Member dashboard
   */
  async getCommitteeDashboard(memberId: string) {
    const [pendingReview, myEvaluations, recentApplications] = await Promise.all([
      this.prisma.application.count({
        where: { status: ApplicationStatus.COMMITTEE_REVIEW },
      }),
      this.prisma.committeeEvaluation.count({
        where: { evaluatorId: memberId },
      }),
      this.prisma.application.findMany({
        where: { status: ApplicationStatus.COMMITTEE_REVIEW },
        include: {
          oemProfile: {
            select: { companyName: true },
          },
          evaluations: {
            where: { evaluatorId: memberId },
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
    ]);

    return {
      pendingReview,
      myEvaluations,
      applicationsForReview: recentApplications.map((app) => ({
        ...app,
        hasMyEvaluation: app.evaluations.length > 0,
      })),
    };
  }

  private async getTodayStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [newApplications, submittedApplications, paymentsReceived] = await Promise.all([
      this.prisma.application.count({
        where: { createdAt: { gte: today } },
      }),
      this.prisma.application.count({
        where: { submittedAt: { gte: today } },
      }),
      this.prisma.payment.count({
        where: {
          createdAt: { gte: today },
          status: { in: [PaymentStatus.VERIFIED, PaymentStatus.VERIFICATION_PENDING] },
        },
      }),
    ]);

    return {
      newApplications,
      submittedApplications,
      paymentsReceived,
    };
  }

  private async getUserStats() {
    const [total, byRole, activeToday] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
      this.prisma.user.count({
        where: {
          lastLoginAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total,
      byRole: byRole.reduce(
        (acc, item) => {
          acc[item.role] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      activeToday,
    };
  }

  private async getCertificateStats() {
    const [total, byStatus, issuedThisMonth] = await Promise.all([
      this.prisma.certificate.count(),
      this.prisma.certificate.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.certificate.count({
        where: {
          issuedDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      issuedThisMonth,
    };
  }

  private async getPaymentStats() {
    const [total, verified, pending] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.VERIFIED },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.VERIFICATION_PENDING },
        _sum: { totalAmount: true },
        _count: true,
      }),
    ]);

    return {
      totalAmount: total._sum.totalAmount || 0,
      totalCount: total._count,
      verifiedAmount: verified._sum.totalAmount || 0,
      verifiedCount: verified._count,
      pendingAmount: pending._sum.totalAmount || 0,
      pendingCount: pending._count,
    };
  }
}
