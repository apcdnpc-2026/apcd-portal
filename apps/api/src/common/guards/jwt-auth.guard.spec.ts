import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let superCanActivateSpy: jest.SpyInstance;

  const mockHandler = jest.fn();
  const mockClass = jest.fn();

  const createMockContext = () =>
    ({
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => ({}),
        getNext: () => jest.fn(),
      }),
      getType: () => 'http',
      getArgs: () => [],
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    }) as any;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
    } as any;

    guard = new JwtAuthGuard(reflector);

    // Mock super.canActivate to avoid requiring a real JWT strategy
    superCanActivateSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ── Public route bypass ──────────────────────────────────────────────

  describe('public route bypass', () => {
    it('should return true when @Public() decorator is present', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockContext();

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        mockHandler,
        mockClass,
      ]);
      // super.canActivate should NOT be called for public routes
      expect(superCanActivateSpy).not.toHaveBeenCalled();
    });

    it('should check handler first, then class for metadata', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockContext();

      guard.canActivate(context);

      const callArgs = reflector.getAllAndOverride.mock.calls[0];
      expect(callArgs[0]).toBe(IS_PUBLIC_KEY);
      expect(callArgs[1][0]).toBe(mockHandler);
      expect(callArgs[1][1]).toBe(mockClass);
    });

    it('should not invoke JWT validation when route is public', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockContext();

      guard.canActivate(context);

      expect(superCanActivateSpy).not.toHaveBeenCalled();
    });
  });

  // ── Valid token ──────────────────────────────────────────────────────

  describe('canActivate with valid token', () => {
    it('should delegate to super.canActivate when route is not public', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockContext();

      const result = guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalled();
      expect(superCanActivateSpy).toHaveBeenCalledWith(context);
      expect(result).toBe(true);
    });

    it('should treat undefined metadata as non-public and delegate to super', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext();

      const result = guard.canActivate(context);

      expect(superCanActivateSpy).toHaveBeenCalledWith(context);
      expect(result).toBe(true);
    });

    it('should treat null metadata as non-public and delegate to super', () => {
      reflector.getAllAndOverride.mockReturnValue(null);
      const context = createMockContext();

      const result = guard.canActivate(context);

      expect(superCanActivateSpy).toHaveBeenCalledWith(context);
      expect(result).toBe(true);
    });

    it('should return the value from super.canActivate when it returns a Promise', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockResolvedValue(true);
      const context = createMockContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── Missing token ────────────────────────────────────────────────────

  describe('canActivate with missing token', () => {
    it('should propagate UnauthorizedError when no token is provided', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockImplementation(() => {
        throw new Error('Unauthorized');
      });
      const context = createMockContext();

      expect(() => guard.canActivate(context)).toThrow('Unauthorized');
    });

    it('should propagate rejection from super.canActivate (async missing token)', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockRejectedValue(new Error('Unauthorized'));
      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow('Unauthorized');
    });
  });

  // ── Invalid token ────────────────────────────────────────────────────

  describe('canActivate with invalid token', () => {
    it('should return false when super.canActivate returns false (invalid signature)', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockReturnValue(false);
      const context = createMockContext();

      const result = guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('should propagate error when token has invalid signature', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const context = createMockContext();

      expect(() => guard.canActivate(context)).toThrow('invalid signature');
    });

    it('should propagate error when token is malformed', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockImplementation(() => {
        throw new Error('jwt malformed');
      });
      const context = createMockContext();

      expect(() => guard.canActivate(context)).toThrow('jwt malformed');
    });
  });

  // ── Expired token ────────────────────────────────────────────────────

  describe('canActivate with expired token', () => {
    it('should propagate error when token is expired (sync)', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const context = createMockContext();

      expect(() => guard.canActivate(context)).toThrow('jwt expired');
    });

    it('should propagate rejection when token is expired (async)', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      superCanActivateSpy.mockRejectedValue(new Error('jwt expired'));
      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow('jwt expired');
    });
  });
});
