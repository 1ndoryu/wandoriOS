import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '../store';
import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from './client';

describe('generated API transport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authStore.set({ isAuthenticated: true, userId: 'user-1', capability: 'authenticated' }, 'sync');
    document.cookie = 'csrf_token=csrf-test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds cookie credentials and CSRF to generated mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await generatedFetcher<GeneratedResponse<{ ok: boolean }>>(
      '/api/test',
      { method: 'POST', headers: { 'X-Request': 'test' } },
    );

    expect(response.data).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-test');
    expect(new Headers(init.headers).get('X-Request')).toBe('test');
  });

  it('normalizes status failures and clears auth on 401', () => {
    const response: GeneratedResponse<{ message: string }> = {
      data: { message: 'unauthorized' },
      status: 401,
      headers: new Headers(),
    };

    expect(() => unwrapGeneratedResponse(response, [200])).toThrow('API Error: 401');
    expect(authStore.get().capability).toBe('public');
  });
});
