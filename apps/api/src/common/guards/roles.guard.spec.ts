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

  it('should return true when user has the required role', () => {
    const context = createMockExecutionContext({ role: Role.ADMIN });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user has wrong role', () => {
    const context = createMockExecutionContext({ role: Role.OEM });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no user is on the request', () => {
    // Pass null so request.user is null
    const context = createMockExecutionContext(null);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Authentication required');
  });

  it('should return true when user matches any of multiple required roles', () => {
    const context = createMockExecutionContext({ role: Role.COMMITTEE });
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN, Role.COMMITTEE, Role.SUPER_ADMIN]);

    expect(guard.canActivate(context)).toBe(true);
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
});
