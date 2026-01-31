import { Role } from '@apcd/database';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { ROLES_KEY } from '../decorators/roles.decorator';

import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockHandler = jest.fn();
  const mockClass = jest.fn();

  const createMockExecutionContext = (user?: { role: Role } | null): ExecutionContext =>
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ── No roles metadata (should pass) ─────────────────────────────────

  describe('no roles metadata (should pass)', () => {
    it('should return true when no @Roles() decorator is present (null)', () => {
      const context = createMockExecutionContext();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

      expect(guard.canActivate(context)).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [mockHandler, mockClass]);
    });

    it('should return true when @Roles() decorator has empty array', () => {
      const context = createMockExecutionContext();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when requiredRoles is undefined', () => {
      const context = createMockExecutionContext();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should not check user when no roles are required', () => {
      // Even without a user on the request, should pass when no roles are set
      const context = createMockExecutionContext(null);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  // ── Matching role ────────────────────────────────────────────────────

  describe('matching role', () => {
    it('should return true when user has the required role (ADMIN)', () => {
      const context = createMockExecutionContext({ role: Role.ADMIN });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

      expect(guard.canActivate(context)).toBe(true);
    });

    it.each([
      Role.OEM,
      Role.OFFICER,
      Role.COMMITTEE,
      Role.FIELD_VERIFIER,
      Role.DEALING_HAND,
      Role.ADMIN,
      Role.SUPER_ADMIN,
    ])('should return true when user has the matching role: %s', (role) => {
      const context = createMockExecutionContext({ role });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([role]);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  // ── Non-matching role ────────────────────────────────────────────────

  describe('non-matching role', () => {
    it('should throw ForbiddenException when user has wrong role', () => {
      const context = createMockExecutionContext({ role: Role.OEM });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should include required roles in the error message', () => {
      const requiredRoles = [Role.ADMIN, Role.SUPER_ADMIN];
      const context = createMockExecutionContext({ role: Role.OEM });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);

      try {
        guard.canActivate(context);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const message = (error as ForbiddenException).message;
        expect(message).toContain(Role.ADMIN);
        expect(message).toContain(Role.SUPER_ADMIN);
      }
    });

    it('should throw when OEM tries to access OFFICER-only route', () => {
      const context = createMockExecutionContext({ role: Role.OEM });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OFFICER]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied. Required roles: OFFICER');
    });

    it('should throw when FIELD_VERIFIER tries to access COMMITTEE-only route', () => {
      const context = createMockExecutionContext({ role: Role.FIELD_VERIFIER });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.COMMITTEE]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw when DEALING_HAND tries to access ADMIN/SUPER_ADMIN route', () => {
      const context = createMockExecutionContext({ role: Role.DEALING_HAND });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.ADMIN, Role.SUPER_ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(
        'Access denied. Required roles: ADMIN, SUPER_ADMIN',
      );
    });
  });

  // ── Multiple roles allowed ───────────────────────────────────────────

  describe('multiple roles allowed', () => {
    it('should return true when user matches first of multiple required roles', () => {
      const context = createMockExecutionContext({ role: Role.ADMIN });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.ADMIN, Role.COMMITTEE, Role.SUPER_ADMIN]);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when user matches middle of multiple required roles', () => {
      const context = createMockExecutionContext({ role: Role.COMMITTEE });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.ADMIN, Role.COMMITTEE, Role.SUPER_ADMIN]);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when user matches last of multiple required roles', () => {
      const context = createMockExecutionContext({ role: Role.SUPER_ADMIN });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.ADMIN, Role.COMMITTEE, Role.SUPER_ADMIN]);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw when user role is not in any of the multiple allowed roles', () => {
      const context = createMockExecutionContext({ role: Role.OEM });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.ADMIN, Role.OFFICER, Role.SUPER_ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow all seven roles when all are specified', () => {
      const allRoles = [
        Role.OEM,
        Role.OFFICER,
        Role.COMMITTEE,
        Role.FIELD_VERIFIER,
        Role.DEALING_HAND,
        Role.ADMIN,
        Role.SUPER_ADMIN,
      ];

      for (const role of allRoles) {
        const context = createMockExecutionContext({ role });
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(allRoles);

        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  // ── No user on request ───────────────────────────────────────────────

  describe('no user on request', () => {
    it('should throw ForbiddenException when no user is on the request (null)', () => {
      const context = createMockExecutionContext(null);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Authentication required');
    });

    it('should throw ForbiddenException when user is undefined on request', () => {
      // Pass undefined explicitly so request has no user property
      const context = createMockExecutionContext();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OEM]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Authentication required');
    });
  });

  // ── Reflector usage ──────────────────────────────────────────────────

  describe('reflector usage', () => {
    it('should call reflector.getAllAndOverride with ROLES_KEY and [handler, class]', () => {
      const context = createMockExecutionContext({ role: Role.OEM });
      const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      guard.canActivate(context);

      expect(spy).toHaveBeenCalledWith(ROLES_KEY, [mockHandler, mockClass]);
    });
  });
});
