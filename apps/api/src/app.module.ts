import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './infrastructure/database/prisma.module';
import { MinioModule } from './infrastructure/storage/minio.module';
import { AdminModule } from './modules/admin/admin.module';
import { ApcdTypesModule } from './modules/apcd-types/apcd-types.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { CommitteeModule } from './modules/committee/committee.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FieldVerificationModule } from './modules/field-verification/field-verification.module';
import { HealthModule } from './modules/health/health.module';
import { InstallationExperienceModule } from './modules/installation-experience/installation-experience.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OemProfileModule } from './modules/oem-profile/oem-profile.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StaffDetailsModule } from './modules/staff-details/staff-details.module';
import { UsersModule } from './modules/users/users.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per minute
      },
    ]),

    // Infrastructure
    PrismaModule,
    MinioModule,

    // Feature modules
    AuthModule,
    UsersModule,
    OemProfileModule,
    ApplicationsModule,
    ApcdTypesModule,
    AttachmentsModule,
    InstallationExperienceModule,
    FieldVerificationModule,
    StaffDetailsModule,
    VerificationModule,
    CommitteeModule,
    PaymentsModule,
    CertificatesModule,
    NotificationsModule,
    AuditLogModule,
    DashboardModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
