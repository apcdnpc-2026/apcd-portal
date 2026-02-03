import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { of, lastValueFrom } from 'rxjs';

import { FILTER_FIELDS_KEY } from '../decorators/filter-fields.decorator';

import { FieldFilterInterceptor } from './field-filter.interceptor';

describe('FieldFilterInterceptor', () => {
  let interceptor: FieldFilterInterceptor;
  let reflector: Reflector;

  const mockHandler = jest.fn();
  const mockClass = jest.fn();

  const createMockExecutionContext = (
    user?: { sub?: string; role?: string } | null,
  ): ExecutionContext =>
    ({
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({
        getRequest: () => (user !== undefined ? { user } : {}),
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
      getType: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    }) as unknown as ExecutionContext;

  function createCallHandler<T>(data: T): CallHandler<T> {
    return { handle: () => of(data) };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldFilterInterceptor,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<FieldFilterInterceptor>(FieldFilterInterceptor);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  // ── OEM cannot see internalNotes ─────────────────────────────────────

  describe('OEM cannot see restricted fields', () => {
    it('should filter out internalNotes for OEM user', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const applicationData = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        companyName: 'Test Company',
        internalNotes: 'This is an internal note from the officer',
        status: 'SUBMITTED',
      };

      const handler = createCallHandler(applicationData);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toEqual({
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        companyName: 'Test Company',
        status: 'SUBMITTED',
      });
      expect(result).not.toHaveProperty('internalNotes');
    });

    it('should filter out evaluationScore for OEM user', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        evaluationScore: 85,
        reviewerComments: 'Good documentation provided',
      };

      const handler = createCallHandler(data);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).not.toHaveProperty('evaluationScore');
      expect(result).not.toHaveProperty('reviewerComments');
    });

    it('should filter out auditHistory for OEM user', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        auditHistory: [{ action: 'CREATED', timestamp: '2024-01-01' }],
      };

      const handler = createCallHandler(data);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).not.toHaveProperty('auditHistory');
    });

    it('should filter out ADMIN_ONLY fields for OEM user', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'sess-123',
        systemLogs: ['log1', 'log2'],
      };

      const handler = createCallHandler(data);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).not.toHaveProperty('ipAddress');
      expect(result).not.toHaveProperty('userAgent');
      expect(result).not.toHaveProperty('sessionId');
      expect(result).not.toHaveProperty('systemLogs');
    });
  });

  // ── ADMIN sees all fields ────────────────────────────────────────────

  describe('ADMIN sees all fields', () => {
    it('should return all fields including internalNotes for ADMIN', async () => {
      const context = createMockExecutionContext({ sub: 'admin-1', role: 'ADMIN' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const applicationData = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        companyName: 'Test Company',
        internalNotes: 'This is an internal note',
        evaluationScore: 85,
        reviewerComments: 'Excellent work',
        auditHistory: [{ action: 'CREATED' }],
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'sess-123',
        systemLogs: ['log1'],
      };

      const handler = createCallHandler(applicationData);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toEqual(applicationData);
    });

    it('should return all fields for SUPER_ADMIN', async () => {
      const context = createMockExecutionContext({ sub: 'superadmin-1', role: 'SUPER_ADMIN' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        internalNotes: 'Secret note',
        evaluationScore: 100,
        ipAddress: '10.0.0.1',
        systemLogs: ['critical log'],
      };

      const handler = createCallHandler(data);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toEqual(data);
    });
  });

  // ── Sensitive fields are masked ──────────────────────────────────────

  describe('sensitive fields masking', () => {
    it('should mask panNumber for non-owner OEM', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        userId: 'user-2', // Different user - not the owner
        panNumber: 'ABCDE1234F',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.panNumber).toBe('******234F');
    });

    it('should mask aadhaarNumber for non-owner', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OFFICER' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'user-2',
        email: 'test@example.com',
        passwordHash: 'hash123',
        aadhaarNumber: '123456789012',
        userId: 'user-2',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.aadhaarNumber).toBe('********9012');
    });

    it('should show last 4 digits for masked values', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'record-1',
        userId: 'user-2',
        panNumber: 'ABCDE1234F',
        aadhaarNumber: '123456789012',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      // PAN: 10 chars, show last 4
      expect(result.panNumber).toMatch(/\*+234F$/);
      // Aadhaar: 12 chars, show last 4
      expect(result.aadhaarNumber).toMatch(/\*+9012$/);
    });

    it('should not mask sensitive fields for the owner', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'record-1',
        userId: 'user-1', // Same as requesting user - is the owner
        panNumber: 'ABCDE1234F',
        aadhaarNumber: '123456789012',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.panNumber).toBe('ABCDE1234F');
      expect(result.aadhaarNumber).toBe('123456789012');
    });

    it('should not mask sensitive fields for ADMIN', async () => {
      const context = createMockExecutionContext({ sub: 'admin-1', role: 'ADMIN' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'record-1',
        userId: 'user-2',
        panNumber: 'ABCDE1234F',
        aadhaarNumber: '123456789012',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.panNumber).toBe('ABCDE1234F');
      expect(result.aadhaarNumber).toBe('123456789012');
    });
  });

  // ── Nested objects are filtered ──────────────────────────────────────

  describe('nested objects filtering', () => {
    it('should filter fields in nested objects', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        details: {
          companyName: 'Test Company',
          internalNotes: 'Nested internal note',
          evaluationScore: 75,
        },
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;
      const details = result.details as Record<string, unknown>;

      expect(details.companyName).toBe('Test Company');
      expect(details).not.toHaveProperty('internalNotes');
      expect(details).not.toHaveProperty('evaluationScore');
    });

    it('should filter deeply nested objects', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        level1: {
          level2: {
            level3: {
              publicField: 'visible',
              internalNotes: 'deeply nested secret',
              ipAddress: '192.168.1.1',
            },
          },
        },
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;
      const level1 = result.level1 as Record<string, unknown>;
      const level2 = level1.level2 as Record<string, unknown>;
      const level3 = level2.level3 as Record<string, unknown>;

      expect(level3.publicField).toBe('visible');
      expect(level3).not.toHaveProperty('internalNotes');
      expect(level3).not.toHaveProperty('ipAddress');
    });
  });

  // ── Arrays of objects are filtered ───────────────────────────────────

  describe('arrays of objects filtering', () => {
    it('should filter fields in array items', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = [
        {
          id: 'app-1',
          applicationNumber: 'APCD-2024-001',
          internalNotes: 'Note 1',
          evaluationScore: 80,
        },
        {
          id: 'app-2',
          applicationNumber: 'APCD-2024-002',
          internalNotes: 'Note 2',
          evaluationScore: 90,
        },
      ];

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Array<
        Record<string, unknown>
      >;

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
      });
      expect(result[1]).toEqual({
        id: 'app-2',
        applicationNumber: 'APCD-2024-002',
      });
    });

    it('should filter nested arrays within objects', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        evaluations: [
          { evaluatorId: 'eval-1', score: 85, internalNotes: 'Secret 1' },
          { evaluatorId: 'eval-2', score: 90, internalNotes: 'Secret 2' },
        ],
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;
      const evaluations = result.evaluations as Array<Record<string, unknown>>;

      expect(evaluations).toHaveLength(2);
      expect(evaluations[0]).toEqual({ evaluatorId: 'eval-1', score: 85 });
      expect(evaluations[1]).toEqual({ evaluatorId: 'eval-2', score: 90 });
    });

    it('should handle empty arrays', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        items: [],
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.items).toEqual([]);
    });
  });

  // ── OFFICER role filtering ───────────────────────────────────────────

  describe('OFFICER role', () => {
    it('should allow OFFICER to see internalNotes but not systemLogs', async () => {
      const context = createMockExecutionContext({ sub: 'officer-1', role: 'OFFICER' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        internalNotes: 'Officer can see this',
        evaluationScore: 85,
        systemLogs: ['should not see this'],
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.internalNotes).toBe('Officer can see this');
      expect(result.evaluationScore).toBe(85);
      expect(result).not.toHaveProperty('systemLogs');
    });
  });

  // ── COMMITTEE role filtering ─────────────────────────────────────────

  describe('COMMITTEE role', () => {
    it('should allow COMMITTEE to see evaluation fields', async () => {
      const context = createMockExecutionContext({ sub: 'committee-1', role: 'COMMITTEE' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'app-1',
        applicationNumber: 'APCD-2024-001',
        evaluationScore: 85,
        reviewerComments: 'Committee can see this',
        systemLogs: ['should not see'],
        auditHistory: [{ action: 'CREATED' }],
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.evaluationScore).toBe(85);
      expect(result.reviewerComments).toBe('Committee can see this');
      expect(result).not.toHaveProperty('systemLogs');
    });
  });

  // ── Endpoint-specific configuration ──────────────────────────────────

  describe('endpoint-specific configuration via @FilterFields()', () => {
    it('should apply endpoint-specific exclusions', async () => {
      const context = createMockExecutionContext({ sub: 'admin-1', role: 'ADMIN' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        exclude: ['sensitiveField'],
      });

      const data = {
        id: 'record-1',
        publicField: 'visible',
        sensitiveField: 'should be hidden',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.publicField).toBe('visible');
      expect(result).not.toHaveProperty('sensitiveField');
    });

    it('should apply endpoint-specific masking', async () => {
      const context = createMockExecutionContext({ sub: 'admin-1', role: 'ADMIN' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        mask: ['customSecret'],
      });

      const data = {
        id: 'record-1',
        customSecret: 'SECRETVALUE123',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.customSecret).toBe('********E123');
    });

    it('should apply whitelist mode with include option', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        include: ['id', 'name', 'status'],
      });

      const data = {
        id: 'record-1',
        name: 'Test',
        status: 'ACTIVE',
        secretField: 'hidden',
        anotherField: 'also hidden',
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result).toEqual({
        id: 'record-1',
        name: 'Test',
        status: 'ACTIVE',
      });
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle null data', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const handler = createCallHandler(null);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBeNull();
    });

    it('should handle undefined data', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const handler = createCallHandler(undefined);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBeUndefined();
    });

    it('should pass through primitive values unchanged', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const handler = createCallHandler('simple string');
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('simple string');
    });

    it('should pass through number values unchanged', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const handler = createCallHandler(42);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe(42);
    });

    it('should pass data through unfiltered when no user is present', async () => {
      const context = createMockExecutionContext(null);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'record-1',
        internalNotes: 'secret',
        ipAddress: '192.168.1.1',
      };

      const handler = createCallHandler(data);
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toEqual(data);
    });

    it('should handle empty objects', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const handler = createCallHandler({});
      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toEqual({});
    });

    it('should mask short values with asterisks', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const data = {
        id: 'record-1',
        userId: 'user-2',
        panNumber: 'ABC', // Less than 4 chars
      };

      const handler = createCallHandler(data);
      const result = (await lastValueFrom(interceptor.intercept(context, handler))) as Record<
        string,
        unknown
      >;

      expect(result.panNumber).toBe('****');
    });
  });

  // ── Reflector usage ──────────────────────────────────────────────────

  describe('reflector usage', () => {
    it('should call reflector.getAllAndOverride with FILTER_FIELDS_KEY', async () => {
      const context = createMockExecutionContext({ sub: 'user-1', role: 'OEM' });
      const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const handler = createCallHandler({ id: 'test' });
      await lastValueFrom(interceptor.intercept(context, handler));

      expect(spy).toHaveBeenCalledWith(FILTER_FIELDS_KEY, [mockHandler, mockClass]);
    });
  });
});
