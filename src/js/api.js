const TOKEN_KEY = 'sumikko_token';

export const config = {
  apiBase: 'https://receipt.sumikko-app.com/api',
  addFriendUrl: 'https://line.me/R/ti/p/@930uwhek',
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${config.apiBase}${path}`, { ...options, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text || '不正な応答です' };
  }

  if (!res.ok) {
    const err = new Error(body?.message || 'リクエストに失敗しました');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const SumikkoApi = {
  login(email, password) {
    return api('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, device_name: 'capacitor' }),
    });
  },
  me() {
    return api('/me');
  },
  async logout() {
    try {
      await api('/logout', { method: 'POST' });
    } finally {
      setToken('');
    }
  },
  receipts(month) {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    return api(`/receipts${q}`);
  },
  receipt(id) {
    return api(`/receipts/${id}`);
  },
  settings() {
    return api('/settings');
  },
  saveApiKey(claude_api_key) {
    return api('/settings/api-key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claude_api_key }),
    });
  },
  uploadReceipts(files, model) {
    const fd = new FormData();
    fd.append('model', model);
    files.forEach((file, i) => {
      fd.append('images[]', file, file.name || `receipt-${i}.jpg`);
    });
    return api('/receipts', { method: 'POST', body: fd });
  },
};
