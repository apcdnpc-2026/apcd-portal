import { TransformInterceptor, ApiResponse } from './transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;
  let mockContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
    mockContext = {} as ExecutionContext;
  });

  function createCallHandler(data: any): CallHandler {
    return { handle: () => of(data) };
  }

  it('should wrap response data in { success: true, data, timestamp }', async () => {
    const handler = createCallHandler({ id: 1, name: 'test' });
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1, name: 'test' });
    expect(result.timestamp).toBeDefined();
  });

  it('should include a valid ISO timestamp', async () => {
    const handler = createCallHandler('test');
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should handle null data', async () => {
    const handler = createCallHandler(null);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should handle undefined data', async () => {
    const handler = createCallHandler(undefined);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it('should handle array data', async () => {
    const arrayData = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const handler = createCallHandler(arrayData);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toEqual(arrayData);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should handle empty array data', async () => {
    const handler = createCallHandler([]);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle string data', async () => {
    const handler = createCallHandler('hello world');
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toBe('hello world');
  });

  it('should handle number data', async () => {
    const handler = createCallHandler(42);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
  });

  it('should handle boolean data', async () => {
    const handler = createCallHandler(true);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toBe(true);
  });

  it('should handle nested object data', async () => {
    const nested = { user: { profile: { name: 'John' } }, roles: ['admin'] };
    const handler = createCallHandler(nested);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.data).toEqual(nested);
  });

  it('should always set success to true', async () => {
    const handler = createCallHandler({ error: true });
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
  });

  it('should have exactly three keys in the response', async () => {
    const handler = createCallHandler('data');
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(Object.keys(result)).toEqual(expect.arrayContaining(['success', 'data', 'timestamp']));
    expect(Object.keys(result)).toHaveLength(3);
  });

  it('should handle large payload', async () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const handler = createCallHandler(largeArray);
    const result = await lastValueFrom(interceptor.intercept(mockContext, handler));

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1000);
  });
});
