import { describe, it, expect, beforeEach } from 'vitest';

describe('api module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exports api instance with correct baseURL', async () => {
    const { api } = await import('./api');
    expect(api).toBeDefined();
    expect(api.defaults.baseURL).toContain('/api');
  });

  it('exports apiGet helper function', async () => {
    const { apiGet } = await import('./api');
    expect(typeof apiGet).toBe('function');
  });

  it('exports apiPost helper function', async () => {
    const { apiPost } = await import('./api');
    expect(typeof apiPost).toBe('function');
  });

  it('exports apiPut helper function', async () => {
    const { apiPut } = await import('./api');
    expect(typeof apiPut).toBe('function');
  });

  it('exports apiDelete helper function', async () => {
    const { apiDelete } = await import('./api');
    expect(typeof apiDelete).toBe('function');
  });

  it('exports uploadFile helper function', async () => {
    const { uploadFile } = await import('./api');
    expect(typeof uploadFile).toBe('function');
  });

  it('has Content-Type json as default header', async () => {
    const { api } = await import('./api');
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('has withCredentials enabled', async () => {
    const { api } = await import('./api');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('has request interceptors registered', async () => {
    const { api } = await import('./api');
    expect((api.interceptors.request as any).handlers.length).toBeGreaterThan(0);
  });

  it('has response interceptors registered', async () => {
    const { api } = await import('./api');
    expect((api.interceptors.response as any).handlers.length).toBeGreaterThan(0);
  });
});
