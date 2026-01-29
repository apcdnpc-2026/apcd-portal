import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

/**
 * Bootstraps a real NestJS application for integration testing.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

/**
 * Cleans all data from the test database in dependency-safe order.
 */
export async function cleanDatabase(prisma: PrismaService) {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.evaluationScore.deleteMany(),
    prisma.committeeEvaluation.deleteMany(),
    prisma.fieldReport.deleteMany(),
    prisma.queryResponse.deleteMany(),
    prisma.query.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.staffDetail.deleteMany(),
    prisma.installationExperience.deleteMany(),
    prisma.fieldVerificationSite.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.applicationApcd.deleteMany(),
    prisma.contactPerson.deleteMany(),
    prisma.applicationStatusHistory.deleteMany(),
    prisma.application.deleteMany(),
    prisma.oemProfile.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
