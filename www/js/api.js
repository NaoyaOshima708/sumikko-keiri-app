(function (global) {
  const TOKEN_KEY = 'sumikko_token';

  const config = {
    apiBase: 'https://receipt.sumikko-app.com/api',
    addFriendUrl: 'https://line.me/R/ti/p/@930uwhek',
    // 解析モデル（UIでは選択させず、ここだけ変えれば一括変更）
    defaultModel: 'claude-sonnet-5',
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

  function parseBody(data) {
    if (data == null || data === '') return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch (e) {
      return { message: String(data) };
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

  function requestNative(path, options) {
    options = options || {};
    const http = cordova.plugin.http;
    const url = config.apiBase + path;
    const method = (options.method || 'get').toLowerCase();
    const headers = buildHeaders(options.headers || {});

    // json serializer が Content-Type を付けるので二重指定しない
    delete headers['Content-Type'];
    delete headers['content-type'];

    return new Promise(function (resolve, reject) {
      try {
        const req = { method: method, headers: headers };

        if (options.formData) {
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
            const raw = response && (response.error || response.data);
            const body = parseBody(raw);
            if (status === 0) {
              reject(networkError(new Error((response && response.error) || 'native http status=0')));
              return;
            }
            rejectHttp(status, body || { message: String(raw || 'リクエストに失敗しました') }, reject);
          }
        );
      } catch (e) {
        reject(networkError(e));
      }
    });
  }

  function requestXhr(path, options) {
    options = options || {};
    const headers = buildHeaders(options.headers || {});
    const url = config.apiBase + path;
    const method = (options.method || 'GET').toUpperCase();

    return new Promise(function (resolve, reject) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        Object.keys(headers).forEach(function (key) {
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

  /**
   * CORS 通過後は XHR 優先。失敗時だけネイティブHTTPへ。
   * （advanced-http の PUT が環境によって壊れる対策）
   */
  function jsonRequest(method, path, jsonData) {
    const upper = method.toUpperCase();
    const xhrOpts = {
      method: upper,
      headers: { 'Content-Type': 'application/json' },
      body: jsonData != null ? JSON.stringify(jsonData) : null,
    };

    return requestXhr(path, xhrOpts).catch(function (err) {
      if (!err.isNetwork || !hasNativeHttp()) throw err;
      console.warn('XHR failed, fallback native', upper, path, err.message);
      return requestNative(path, {
        method: upper.toLowerCase(),
        json: jsonData != null ? jsonData : {},
      });
    });
  }

  function getRequest(path) {
    return requestXhr(path, { method: 'GET' }).catch(function (err) {
      if (!err.isNetwork || !hasNativeHttp()) throw err;
      console.warn('XHR failed, fallback native GET', path, err.message);
      return requestNative(path, { method: 'get' });
    });
  }

  const SumikkoApi = {
    login: function (email, password) {
      return jsonRequest('POST', '/login', {
        email: email,
        password: password,
        device_name: 'monaca',
      });
    },
    me: function () {
      return getRequest('/me');
    },
    logout: async function () {
      try {
        await jsonRequest('POST', '/logout', {});
      } finally {
        setToken('');
      }
    },
    // month: 'YYYY-MM' / ''（空文字＝全期間） / 省略時はAPI既定（当月）
    // page: ページ番号（1始まり）
    receipts: function (monthOrOpts, page) {
      let month;
      let pageNum = page;
      if (monthOrOpts && typeof monthOrOpts === 'object') {
        month = monthOrOpts.month;
        pageNum = monthOrOpts.page;
      } else {
        month = monthOrOpts;
      }
      const params = [];
      if (typeof month === 'string') {
        params.push('month=' + encodeURIComponent(month));
      }
      if (pageNum) {
        params.push('page=' + encodeURIComponent(pageNum));
      }
      const q = params.length ? '?' + params.join('&') : '';
      return getRequest('/receipts' + q);
    },
    receipt: function (id) {
      return getRequest('/receipts/' + id);
    },
    settings: function () {
      return getRequest('/settings');
    },
    saveApiKey: function (claude_api_key) {
      return jsonRequest('PUT', '/settings/api-key', { claude_api_key: claude_api_key });
    },
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
      let count = 0;
      items.forEach(function (item, i) {
        const file = item.file;
        if (!file) return;
        const name = file.name || 'receipt-' + i + '.jpg';
        // iOS: File だと FormData.append が落ちることがある → 素の Blob に切り直す
        const blob =
          file instanceof Blob
            ? file.slice(0, file.size, file.type || 'image/jpeg')
            : null;
        if (!blob) {
          throw new Error('画像データが Blob ではありません');
        }
        fd.append('images[]', blob, name);
        count += 1;
      });
      if (!count) {
        return Promise.reject(new Error('送信できる画像がありません'));
      }
      return requestXhr('/receipts', { method: 'POST', body: fd });
    },
  };

  global.SumikkoConfig = config;
  global.getToken = getToken;
  global.setToken = setToken;
  global.SumikkoApi = SumikkoApi;
  global.SumikkoHasNativeHttp = hasNativeHttp;
})(window);
