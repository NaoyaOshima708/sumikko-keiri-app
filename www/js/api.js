(function (global) {
  const TOKEN_KEY = 'sumikko_token';

  const config = {
    apiBase: 'https://receipt.sumikko-app.com/api',
    addFriendUrl: 'https://line.me/R/ti/p/@930uwhek',
  };

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function networkError(cause) {
    const origin = (typeof location !== 'undefined' && location.origin) || '(unknown)';
    const detail = (cause && cause.message) || String(cause || '');
    const err = new Error(
      'API通信失敗: ' + detail + '\norigin=' + origin + '\napi=' + config.apiBase
    );
    err.cause = cause;
    err.isNetwork = true;
    return err;
  }

  function request(path, options) {
    options = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const url = config.apiBase + path;
    const method = (options.method || 'GET').toUpperCase();

    // Monacaプレビューでも中身が見えるよう XHR を使う
    return new Promise(function (resolve, reject) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        Object.keys(headers).forEach(function (key) {
          xhr.setRequestHeader(key, headers[key]);
        });
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          const text = xhr.responseText || '';
          let body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch (e) {
            body = { message: text || '不正な応答です' };
          }

          // status 0 = CORS / 通信自体の失敗（Safari だと Load failed）
          if (xhr.status === 0) {
            reject(networkError(new Error('Load failed / status=0（CORSまたは通信遮断）')));
            return;
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            const err = new Error((body && body.message) || 'リクエストに失敗しました');
            err.status = xhr.status;
            err.body = body;
            reject(err);
            return;
          }
          resolve(body);
        };
        xhr.onerror = function () {
          reject(networkError(new Error('xhr.onerror')));
        };
        xhr.send(options.body != null ? options.body : null);
      } catch (e) {
        reject(networkError(e));
      }
    });
  }

  const SumikkoApi = {
    login: function (email, password) {
      return request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, device_name: 'monaca' }),
      });
    },
    me: function () {
      return request('/me');
    },
    logout: async function () {
      try {
        await request('/logout', { method: 'POST' });
      } finally {
        setToken('');
      }
    },
    receipts: function (month) {
      const q = month ? '?month=' + encodeURIComponent(month) : '';
      return request('/receipts' + q);
    },
    receipt: function (id) {
      return request('/receipts/' + id);
    },
    settings: function () {
      return request('/settings');
    },
    saveApiKey: function (claude_api_key) {
      return request('/settings/api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_api_key: claude_api_key }),
      });
    },
    uploadReceipts: function (files, model) {
      const fd = new FormData();
      fd.append('model', model);
      files.forEach(function (file, i) {
        fd.append('images[]', file, file.name || 'receipt-' + i + '.jpg');
      });
      // FormData は Content-Type を付けない（boundary 自動）
      return request('/receipts', { method: 'POST', body: fd });
    },
  };

  global.SumikkoConfig = config;
  global.getToken = getToken;
  global.setToken = setToken;
  global.SumikkoApi = SumikkoApi;
})(window);
