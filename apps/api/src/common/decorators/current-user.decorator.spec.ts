import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser, JwtPayload } from './current-user.decorator';

// Helper to extract the factory function from a param decorator
function getParamDecoratorFactory(decorator: Function) {
  class TestClass {
    test(@decorator() _value: any) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'test');
  return args[Object.keys(args)[0]].factory;
}

function getParamDecoratorFactoryWithData(decorator: Function, data: any) {
  class TestClass {
    test(@decorator(data) _value: any) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'test');
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentUser Decorator', () => {
  const mockUser: JwtPayload = {
    sub: 'user-uuid-123',
    email: 'test@example.com',
    role: 'OEM',
  };

  function createMockContext(user: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  // ── Full user extraction ─────────────────────────────────────────────

  describe('full user extraction (no data key)', () => {
    it('should extract the full user object when no data key is specified', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const ctx = createMockContext(mockUser);
      const result = factory(undefined, ctx);

      expect(result).toEqual(mockUser);
    });

    it('should return full user object including all JwtPayload fields', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const ctx = createMockContext(mockUser);
      const result = factory(undefined, ctx) as JwtPayload;

      expect(result).toHaveProperty('sub');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('role');
    });

    it('should return the user as-is from request.user (including extra properties)', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const userWithExtra = { ...mockUser, extra: 'data' };
      const ctx = createMockContext(userWithExtra);
      const result = factory(undefined, ctx);

      expect(result).toEqual(userWithExtra);
    });
  });

  // ── Specific field extraction ────────────────────────────────────────

  describe('specific field extraction', () => {
    it('should extract sub field when data is "sub"', () => {
      const factory = getParamDecoratorFactoryWithData(CurrentUser, 'sub');
      const ctx = createMockContext(mockUser);
      const result = factory('sub', ctx);

      expect(result).toBe('user-uuid-123');
    });

    it('should extract email field when data is "email"', () => {
      const factory = getParamDecoratorFactoryWithData(CurrentUser, 'email');
      const ctx = createMockContext(mockUser);
      const result = factory('email', ctx);

      expect(result).toBe('test@example.com');
    });

    it('should extract role field when data is "role"', () => {
      const factory = getParamDecoratorFactoryWithData(CurrentUser, 'role');
      const ctx = createMockContext(mockUser);
      const result = factory('role', ctx);

      expect(result).toBe('OEM');
    });

    it('should return undefined for unset property key', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const ctx = createMockContext(mockUser);
      const result = factory('nonexistent' as any, ctx);

      expect(result).toBeUndefined();
    });
  });

  // ── Different role types ─────────────────────────────────────────────

  describe('user with different roles', () => {
    const allRoles = ['OEM', 'OFFICER', 'COMMITTEE', 'FIELD_VERIFIER', 'DEALING_HAND', 'ADMIN', 'SUPER_ADMIN'];

    it.each(allRoles)('should extract user with role: %s', (role) => {
      const user: JwtPayload = { sub: 'id-1', email: 'a@b.com', role };
      const factory = getParamDecoratorFactory(CurrentUser);
      const ctx = createMockContext(user);
      const result = factory(undefined, ctx);

      expect(result).toEqual(user);
      expect(result.role).toBe(role);
    });

    it.each(allRoles)('should extract role field for role: %s', (role) => {
      const user: JwtPayload = { sub: 'id-1', email: 'a@b.com', role };
      const factory = getParamDecoratorFactoryWithData(CurrentUser, 'role');
      const ctx = createMockContext(user);
      const result = factory('role', ctx);

      expect(result).toBe(role);
    });
  });

  // ── UUID format sub ──────────────────────────────────────────────────

  describe('UUID format sub', () => {
    it('should work with different sub formats (UUID)', () => {
      const uuidUser: JwtPayload = {
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'uuid@test.com',
        role: 'OEM',
      };
      const factory = getParamDecoratorFactoryWithData(CurrentUser, 'sub');
      const ctx = createMockContext(uuidUser);
      const result = factory('sub', ctx);

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // ── JwtPayload interface ─────────────────────────────────────────────

  describe('JwtPayload interface', () => {
    it('JwtPayload interface should have correct shape', () => {
      const payload: JwtPayload = {
        sub: 'abc-123',
        email: 'user@test.com',
        role: 'ADMIN',
      };

      expect(typeof payload.sub).toBe('string');
      expect(typeof payload.email).toBe('string');
      expect(typeof payload.role).toBe('string');
    });
  });
});
