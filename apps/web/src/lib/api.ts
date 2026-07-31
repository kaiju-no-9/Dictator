const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }
  return response.json();
}

export const api = {
  projects: {
    list: () => fetchApi<any[]>('/projects'),
    get: (id: string) => fetchApi<any>(`/projects/${id}`),
    create: (data: { title: string; description?: string }) =>
      fetchApi<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  jobs: {
    get: (id: string) => fetchApi<any>(`/jobs/${id}`),
  },
};
