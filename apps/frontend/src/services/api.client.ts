import { useAuthStore } from '../store/auth.store';
import { API_URL } from '../lib/constants';

const resolveApiUrl = (endpoint: string, prefix: string) => {
  return `${API_URL}${prefix}/${endpoint.replace(/^\/+/, '')}`;
};

export interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  status: number;
}

const isUnauthorizedResponse = (status: number, error: string | null) =>
  status === 401 || /invalid or expired token/i.test(error || '');

function clearAuthAndRedirect(message?: string) {
  useAuthStore.getState().clearAuth();
  if (typeof window === 'undefined' || window.location.pathname === '/login' || window.location.pathname === '/admin/login') return;
  if (message) {
    window.sessionStorage.setItem('account-restriction-message', message);
    void fetch(resolveApiUrl('/auth/refresh', ''), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
      keepalive: true,
    }).catch((error: unknown) => {
      console.error('Unable to clear the revoked session cookie', error);
    });
  }
  window.location.replace(window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login');
}

let authHydration: Promise<void> | null = null;
let tokenRefresh: Promise<string | null> | null = null;

async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return useAuthStore.getState().accessToken;

  if (!useAuthStore.getState().hasHydrated) {
    authHydration ??= Promise.resolve().then(() => useAuthStore.persist.rehydrate()).then(() => undefined).catch((error) => {
      console.error('Unable to hydrate persisted authentication state', error);
    }).finally(() => {
      authHydration = null;
    });
    await authHydration;
  }

  const currentToken = useAuthStore.getState().accessToken;
  if (currentToken) return currentToken;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const saved = storage.getItem('auth-storage');
      if (!saved) continue;
      const parsed = JSON.parse(saved) as { state?: { accessToken?: unknown; isAuthenticated?: unknown } };
      if (
        parsed.state?.isAuthenticated === true &&
        typeof parsed.state.accessToken === 'string' &&
        parsed.state.accessToken
      ) {
        return parsed.state.accessToken;
      }
    } catch (error) {
      console.error('Unable to read persisted authentication state', error);
    }
  }
  return null;
}

async function refreshAccessToken(): Promise<string | null> {
  tokenRefresh ??= (async () => {
    try {
      const response = await fetch(resolveApiUrl('/auth/refresh', ''), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== 'object') return null;
      const record = payload as { accessToken?: unknown; data?: { accessToken?: unknown } };
      const accessToken = typeof record.accessToken === 'string'
        ? record.accessToken
        : typeof record.data?.accessToken === 'string'
          ? record.data.accessToken
          : null;
      if (accessToken) {
        useAuthStore.setState({ accessToken, isAuthenticated: true });
        return accessToken;
      }
      return null;
    } catch (error) {
      console.error('Unable to refresh access token', error);
      return null;
    } finally {
      tokenRefresh = null;
    }
  })();
  return tokenRefresh;
}

const shouldRefreshAuthentication = (prefix: string, endpoint: string) =>
  prefix !== '/admin' && !/^\/?auth\/(login|register|refresh|verify-email|forgot-password|reset-password)(\/|$|\?)/.test(endpoint);

const isPaginatedEnvelope = (value: unknown): value is { data: unknown[]; total: number; page: number; limit: number; totalPages: number } => {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) return false;
  const response = value as { total?: unknown; page?: unknown; limit?: unknown; totalPages?: unknown };
  return [response.total, response.page, response.limit, response.totalPages].every((field) => typeof field === 'number');
};

class ApiClient {
  constructor(private readonly prefix = '') {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = resolveApiUrl(endpoint, this.prefix);
    try {
      const sendRequest = async (token: string | null) => {
        const headers = new Headers(options.headers || {});
        headers.set('Content-Type', 'application/json');
        headers.set('Accept', 'application/json');
        if (token) headers.set('Authorization', `Bearer ${token}`);
        else headers.delete('Authorization');

        const response = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
        });
        let body: any = null;
        try {
          body = await response.json();
        } catch {
          if (!response.ok) body = { message: response.statusText || 'API Request Failed' };
        }
        return { response, body };
      };

      let token = await getAccessToken();
      let { response, body } = await sendRequest(token);
      if (
        isUnauthorizedResponse(response.status, typeof body?.message === 'string' ? body.message : null) &&
        body?.error !== 'ACCOUNT_LOCKED' &&
        shouldRefreshAuthentication(this.prefix, endpoint)
      ) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          token = refreshedToken;
          ({ response, body } = await sendRequest(token));
        } else if (token || useAuthStore.getState().isAuthenticated) {
          clearAuthAndRedirect();
        }
      }

      if (isUnauthorizedResponse(response.status, typeof body?.message === 'string' ? body.message : null) &&
        (token || useAuthStore.getState().isAuthenticated)) {
        clearAuthAndRedirect(body?.error === 'ACCOUNT_LOCKED' ? body.message : undefined);
      }

      const error = response.ok
        ? null
        : (body?.message || body?.error || response.statusText || 'API Request Failed');
      const data = response.ok
        ? (isPaginatedEnvelope(body) ? body : body?.data || body) as T
        : null;
      return { data, error, status: response.status };
    } catch {
      return { data: null, error: 'Cannot connect to backend API server', status: 0 };
    }
  }

  async get<T>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, body: any, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async upload<T>(endpoint: string, formData: FormData) {
    const token = await getAccessToken();
    const headers = new Headers({ Accept: 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);

    try {
      let response = await fetch(resolveApiUrl(endpoint, this.prefix), {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include'
      });
      let json = await response.json().catch(() => null);
      if (
        isUnauthorizedResponse(response.status, typeof json?.message === 'string' ? json.message : null) &&
        shouldRefreshAuthentication(this.prefix, endpoint)
      ) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          headers.set('Authorization', `Bearer ${refreshedToken}`);
          response = await fetch(resolveApiUrl(endpoint, this.prefix), {
            method: 'POST', body: formData, headers, credentials: 'include',
          });
          json = await response.json().catch(() => null);
        } else if (token || useAuthStore.getState().isAuthenticated) {
          clearAuthAndRedirect();
        }
      }
      const result = {
        data: response.ok ? ((json?.data || json) as T) : null,
        error: response.ok ? null : (json?.message || json?.error || 'Upload failed'),
        status: response.status
      } as ApiResponse<T>;
      if (isUnauthorizedResponse(result.status, result.error) && (token || useAuthStore.getState().isAuthenticated)) {
        clearAuthAndRedirect();
      }
      return result;
    } catch {
      return { data: null, error: 'Cannot connect to backend API server', status: 0 } as ApiResponse<T>;
    }
  }

  async put<T>(endpoint: string, body: any, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
  }

  async patch<T>(endpoint: string, body: any, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  }

  async delete<T>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export const adminApiClient = new ApiClient('/admin');
