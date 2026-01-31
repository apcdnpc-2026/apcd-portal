import { TransformInterceptor, ApiResponse } from './transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom, throwError } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
    mockContext = {} as ExecutionContext;
  });

  function createCallHandler(data: any): CallHandler {
    return { handle: () => of(data) };
  }

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  // ── Response wrapping in { success: true, data: ... } format ─────────

  describe('wraps response in { success: true, data: ... } format', () => {
    it('should wrap object response data', async () => {
      const handler = createCallHandler({ id: 1, name: 'test' });
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'test' });
      expect(result.timestamp).toBeDefined();
    });

    it('should wrap string data', async () => {
      const handler = createCallHandler('hello world');
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello world');
    });

    it('should wrap number data', async () => {
      const handler = createCallHandler(42);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should wrap boolean data (true)', async () => {
      const handler = createCallHandler(true);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should wrap boolean data (false)', async () => {
      const handler = createCallHandler(false);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('should wrap null data', async () => {
      const handler = createCallHandler(null);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should wrap undefined data', async () => {
      const handler = createCallHandler(undefined);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should wrap array data', async () => {
      const arrayData = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const handler = createCallHandler(arrayData);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toEqual(arrayData);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should wrap empty array data', async () => {
      const handler = createCallHandler([]);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should wrap empty object data', async () => {
      const handler = createCallHandler({});
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should wrap nested object data', async () => {
      const nested = { user: { profile: { name: 'John' } }, roles: ['admin'] };
      const handler = createCallHandler(nested);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.data).toEqual(nested);
    });
  });

  // ── Success field ────────────────────────────────────────────────────

  describe('success field', () => {
    it('should always set success to true', async () => {
      const handler = createCallHandler({ error: true });
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
    });
  });

  // ── Timestamp field ──────────────────────────────────────────────────

  describe('timestamp field', () => {
    it('should include a valid ISO timestamp', async () => {
      const handler = createCallHandler('test');
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  // ── Response shape ───────────────────────────────────────────────────

  describe('response shape', () => {
    it('should have exactly three keys: success, data, timestamp', async () => {
      const handler = createCallHandler('data');
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(Object.keys(result)).toEqual(expect.arrayContaining(['success', 'data', 'timestamp']));
      expect(Object.keys(result)).toHaveLength(3);
    });
  });

  // ── Error propagation ────────────────────────────────────────────────

  describe('error propagation', () => {
    it('should not catch errors from the handler (let them propagate)', async () => {
      const handler: CallHandler = {
        handle: () => throwError(() => new Error('Handler error')),
      };

      await expect(
        lastValueFrom(interceptor.intercept(mockContext, handler)),
      ).rejects.toThrow('Handler error');
    });

    it('should propagate typed errors without wrapping them', async () => {
      const handler: CallHandler = {
        handle: () => throwError(() => new TypeError('Type mismatch')),
      };

      await expect(
        lastValueFrom(interceptor.intercept(mockContext, handler)),
      ).rejects.toThrow(TypeError);
    });
  });

  // ── Large payload ────────────────────────────────────────────────────

  describe('large payload', () => {
    it('should handle large payload', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      const handler = createCallHandler(largeArray);
      const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1000);
    });
  });
});
