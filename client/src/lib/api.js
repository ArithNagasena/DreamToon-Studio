const BASE = '/api';
let token = localStorage.getItem('cd.token') || null;

export const getToken = () => token;
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('cd.token', t);
  else localStorage.removeItem('cd.token');
}

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message); this.status = status; this.errors = errors || null;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiError('Could not reach the server. Your work is kept in this tab.', 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(data.error || 'Something went wrong.', res.status, data.errors);
  }
  return data;
}

/** Drop empty values so the query string only carries filters in use. */
const qs = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : '';
};

export const api = {
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  login:    (b) => request('/auth/login',    { method: 'POST', body: b }),
  me:       () => request('/auth/me'),
  updateProfile: (b) => request('/auth/profile', { method: 'PATCH', body: b }),
  changePassword: (b) => request('/auth/change-password', { method: 'POST', body: b }),

  catalogue: () => request('/characters/catalogue'),
  list: ({ q = '', type = '', sort = 'updated', createdFrom = '', createdTo = '' } = {}) =>
    request('/characters' + qs({ q, type, sort, createdFrom, createdTo })),
  get:    (id)      => request(`/characters/${id}`),
  create: (b)       => request('/characters', { method: 'POST', body: b }),
  update: (id, b)   => request(`/characters/${id}`, { method: 'PUT', body: b }),
  remove: (id)      => request(`/characters/${id}`, { method: 'DELETE' }),
  restore:(id)      => request(`/characters/${id}/restore`, { method: 'POST' }),
  exportUrl: (id)   => `${BASE}/characters/${id}/export?format=json`,

  templates:      (type = '') => request('/templates' + qs({ type })),
  saveTemplate:   (b)  => request('/templates', { method: 'POST', body: b }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),

  adminUsers: () => request('/admin/users'),
  setUserStatus: (id, status) =>
    request(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
};
