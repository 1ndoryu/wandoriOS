/* wandori.us — Generated API boundary
 * [297A-8] Auth vía cookie HttpOnly + CSRF token para mutaciones.
 * [018A-36] El cliente manual se retiró; este módulo conserva solo el mutator
 * compartido y la política de errores para Orval. */

import { authStore } from '../store';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface GeneratedResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/* [297A-8] Leer cookie CSRF del browser */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : null;
}

function withSession(options: RequestInit): RequestInit {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (isMutation) {
    const csrf = getCsrfToken();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  return { ...options, credentials: 'include', headers };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text || response.status === 204) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/* [018A-32] Orval uses this single transport so generated clients inherit the
 * same cookie, CSRF, base URL and response-envelope rules. */
export async function generatedFetcher<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...withSession(options),
    signal: options.signal,
  });
  const data = await parseResponseBody(response);
  return { data, status: response.status, headers: response.headers } as T;
}

export function unwrapGeneratedResponse<T>(
  response: GeneratedResponse<unknown>,
  successStatuses: readonly number[],
): T {
  if (successStatuses.includes(response.status)) return response.data as T;
  if (response.status === 401) {
    authStore.set({ isAuthenticated: false, userId: null, capability: 'public' });
  }
  throw new ApiError(response.status, response.data, `API Error: ${response.status}`);
}
