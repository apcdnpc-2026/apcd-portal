import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

export type MockPrismaService = DeepMockProxy<PrismaClient>;

export function createMockPrismaService(): MockPrismaService {
  return mockDeep<PrismaClient>();
}
