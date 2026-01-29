import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

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
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true when @Public() decorator is present', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      mockHandler,
      mockClass,
    ]);
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

  it('should delegate to super.canActivate when route is not public', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext();

    const result = guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalled();
    // super.canActivate is called (returns mocked true)
    expect(result).toBe(true);
  });

  it('should treat undefined metadata as non-public and delegate to super', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    const result = guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalled();
    // undefined is falsy → delegates to super
    expect(result).toBe(true);
  });
});
