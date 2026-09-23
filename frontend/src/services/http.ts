/**
 * HTTP client for the (upcoming) EduTrack API.
 *
 * - Prefixes VITE_API_URL
 * - Sends the bearer token and tenant code on every request (multi-tenant routing)
 * - Normalises errors into `ApiError` and signs the user out on 401
 * - Times out slow requests (mobile networks) instead of hanging the UI
 */
import { env } from '@/config/env';
import { useSessionStore } from '@/store/sessionStore';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, { body, timeoutMs = 15_000, headers, ...init }: RequestOptions = {}): Promise<T> {
  const { token, tenantCode } = useSessionStore.getState();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantCode ? { 'X-Tenant': tenantCode } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) useSessionStore.getState().signOut();
    const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
    if (!res.ok) {
      const message = (data as { message?: string } | undefined)?.message ?? `Request failed (${res.status})`;
      throw new ApiError(message, res.status, data);
    }
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('The server took too long to respond.', 408);
    if (e instanceof TypeError) throw new ApiError('You appear to be offline.', 0);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
};
