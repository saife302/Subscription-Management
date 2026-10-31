const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Array<{ field: string; message: string }> = []
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem('subnex_token');
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('subnex_token', token);
  } else {
    localStorage.removeItem('subnex_token');
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return null as T;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errObj = json?.error || {};
    throw new ApiClientError(
      res.status,
      errObj.code || 'INTERNAL',
      errObj.message || `Request failed with status ${res.status}`,
      errObj.details || []
    );
  }

  return json as T;
}

export async function downloadCsvWithAuth(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || 'Failed to download CSV');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
