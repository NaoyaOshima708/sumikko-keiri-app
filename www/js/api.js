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

  function hasNativeHttp() {
    return !!(
      global.cordova &&
      cordova.plugin &&
      cordova.plugin.http &&
      typeof cordova.plugin.http.sendRequest === 'function'
    );
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

  function parseBody(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return { message: text };
    }
  }

  function buildHeaders(extra) {
    const headers = Object.assign({ Accept: 'application/json' }, extra || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function rejectHttp(status, body, reject) {
    const err = new Error((body && body.message) || 'リクエストに失敗しました');
    err.status = status;
    err.body = body;
    reject(err);
  }

  /** Monacaデバッガーは monaca-debugger:// のため CORS で XHR が落ちる。ネイティブHTTPで回避 */
  function requestNative(path, options) {
    options = options || {};
    const http = cordova.plugin.http;
    const url = config.apiBase + path;
    const method = (options.method || 'get').toLowerCase();
    const headers = buildHeaders(options.headers);

    return new Promise(function (resolve, reject) {
      try {
        const req = {
          method: method,
          headers: headers,
        };

        if (options.formData) {
          // multipart: { fields: {model:'...'}, files: { 'images[]': ['file:///...'] } }
          http.setDataSerializer('multipart');
          req.data = options.formData.fields || {};
          if (options.formData.files) req.files = options.formData.files;
        } else if (options.json != null) {
          http.setDataSerializer('json');
          req.data = options.json;
        } else {
          http.setDataSerializer('json');
          req.data = {};
        }

        http.sendRequest(
          url,
          req,
          function (response) {
            const body = parseBody(response.data);
            const status = response.status || 0;
            if (status < 200 || status >= 300) {
              rejectHttp(status, body, reject);
              return;
            }
            resolve(body);
          },
          function (response) {
            const status = (response && response.status) || 0;
            const body = parseBody(response && response.error ? response.error : response && response.data);
            if (status === 0) {
              reject(networkError(new Error((response && response.error) || 'native http status=0')));
              return;
            }
            rejectHttp(status, body || { message: (response && response.error) || 'リクエストに失敗しました' }, reject);
          }
        );
      } catch (e) {
        reject(networkError(e));
      }
    });
  }

  function requestXhr(path, options) {
    options = options || {};
    const headers = buildHeaders(options.headers);
    const url = config.apiBase + path;
    const method = (options.method || 'GET').toUpperCase();

    return new Promise(function (resolve, reject) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        Object.keys(headers).forEach(function (key) {
          // FormData のときは Content-Type を手動設定しない
          if (options.body instanceof FormData && key.toLowerCase() === 'content-type') return;
          xhr.setRequestHeader(key, headers[key]);
        });
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          const body = parseBody(xhr.responseText || '');
          if (xhr.status === 0) {
            reject(networkError(new Error('Load failed / status=0（CORSまたは通信遮断）')));
            return;
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            rejectHttp(xhr.status, body, reject);
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

  function request(path, options) {
    options = options || {};
    if (hasNativeHttp() && !options.forceXhr) {
      if (options.body instanceof FormData) {
        // FormData はネイティブ側では使えないので呼び出し側で formData を渡す
        return requestXhr(path, options);
      }
      return requestNative(path, options);
    }
    return requestXhr(path, options);
  }

  const SumikkoApi = {
    login: function (email, password) {
      const payload = { email: email, password: password, device_name: 'monaca' };
      if (hasNativeHttp()) {
        return requestNative('/login', {
          method: 'post',
          headers: { 'Content-Type': 'application/json' },
          json: payload,
        });
      }
      return requestXhr('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    me: function () {
      if (hasNativeHttp()) return requestNative('/me', { method: 'get' });
      return requestXhr('/me', { method: 'GET' });
    },
    logout: async function () {
      try {
        if (hasNativeHttp()) await requestNative('/logout', { method: 'post', json: {} });
        else await requestXhr('/logout', { method: 'POST' });
      } finally {
        setToken('');
      }
    },
    receipts: function (month) {
      const q = month ? '?month=' + encodeURIComponent(month) : '';
      if (hasNativeHttp()) return requestNative('/receipts' + q, { method: 'get' });
      return requestXhr('/receipts' + q, { method: 'GET' });
    },
    receipt: function (id) {
      if (hasNativeHttp()) return requestNative('/receipts/' + id, { method: 'get' });
      return requestXhr('/receipts/' + id, { method: 'GET' });
    },
    settings: function () {
      if (hasNativeHttp()) return requestNative('/settings', { method: 'get' });
      return requestXhr('/settings', { method: 'GET' });
    },
    saveApiKey: function (claude_api_key) {
      const payload = { claude_api_key: claude_api_key };
      if (hasNativeHttp()) {
        return requestNative('/settings/api-key', {
          method: 'put',
          headers: { 'Content-Type': 'application/json' },
          json: payload,
        });
      }
      return requestXhr('/settings/api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    /**
     * files: File[] または { file?: File, path?: string }[]
     * Monaca実機/デバッガーでは path (file URI) を優先してネイティブアップロード
     */
    uploadReceipts: function (files, model) {
      const items = (files || []).map(function (f) {
        if (f && (f.path || f.file)) return f;
        return { file: f };
      });
      const paths = items.map(function (x) { return x.path; }).filter(Boolean);

      if (hasNativeHttp() && paths.length && paths.length === items.length) {
        return requestNative('/receipts', {
          method: 'post',
          formData: {
            fields: { model: model },
            files: { 'images[]': paths },
          },
        });
      }

      const fd = new FormData();
      fd.append('model', model);
      items.forEach(function (item, i) {
        const file = item.file;
        if (!file) return;
        fd.append('images[]', file, file.name || 'receipt-' + i + '.jpg');
      });
      return requestXhr('/receipts', { method: 'POST', body: fd });
    },
  };

  global.SumikkoConfig = config;
  global.getToken = getToken;
  global.setToken = setToken;
  global.SumikkoApi = SumikkoApi;
  global.SumikkoHasNativeHttp = hasNativeHttp;
})(window);
