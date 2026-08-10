(function () {
  const state = {
    user: null,
    settings: null,
    pendingFiles: [],
    detail: null,
  };

  function nav() {
    return document.querySelector('#appNavigator');
  }

  function monthNow() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openExternal(url) {
    if (window.cordova && cordova.InAppBrowser) {
      cordova.InAppBrowser.open(url, '_system');
      return;
    }
    window.open(url, '_blank');
  }

  function inputValue(root, selector) {
    const el = root.querySelector(selector);
    if (!el) return '';
    if (typeof el.value === 'string') return el.value;
    const inner = el.querySelector('input');
    return inner ? inner.value : '';
  }

  async function goPage(name) {
    return nav().resetToPage(name, { animation: 'fade' });
  }

  async function afterAuth(user) {
    state.user = user;
    if (!user.line_friend) {
      await goPage('friend.html');
      return;
    }
    await goPage('home.html');
  }

  async function boot() {
    if (!getToken()) {
      await nav().resetToPage('login.html', { animation: 'none' });
      return;
    }
    try {
      const res = await SumikkoApi.me();
      await afterAuth(res.user);
    } catch (e) {
      console.error('boot me failed', e);
      setToken('');
      await nav().resetToPage('login.html', { animation: 'none' });
    }
  }

  async function onLogin(page) {
    const email = inputValue(page, '#emailInput').trim();
    const password = inputValue(page, '#passwordInput');
    const errEl = page.querySelector('#loginError');
    errEl.textContent = '';
    if (!email || !password) {
      errEl.textContent = 'メールとパスワードを入力してください';
      return;
    }
    try {
      console.log('login start', email, 'origin=', location.origin);
      const res = await SumikkoApi.login(email, password);
      console.log('login ok', res && res.user);
      setToken(res.token);
      await afterAuth(res.user);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      console.error('login failed', msg);
      errEl.textContent = msg;
      errEl.style.whiteSpace = 'pre-wrap';
    }
  }

  async function onLogout() {
    await SumikkoApi.logout();
    state.user = null;
    state.pendingFiles = [];
    await nav().resetToPage('login.html', { animation: 'fade' });
  }

  async function openFriend() {
    const url = (state.user && state.user.add_friend_url) || SumikkoConfig.addFriendUrl;
    openExternal(url);
  }

  async function checkFriend(page) {
    const errEl = page.querySelector('#friendError');
    errEl.textContent = '';
    try {
      const res = await SumikkoApi.me();
      if (res.user.line_friend) await afterAuth(res.user);
      else errEl.textContent = 'まだ友だち追加が反映されていません。';
    } catch (e) {
      errEl.textContent = e.message || String(e);
    }
  }

  async function loadHome(page) {
    const list = page.querySelector('#receiptList');
    const empty = page.querySelector('#homeEmpty');
    const lead = page.querySelector('#homeLead');
    lead.textContent = '履歴（' + monthNow() + '） / 下の＋から撮影できます';
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
      const res = await SumikkoApi.receipts(monthNow());
      const items = res.data || [];
      if (!items.length) {
        empty.style.display = 'block';
        return;
      }
      items.forEach(function (r) {
        const el = document.createElement('ons-list-item');
        el.setAttribute('modifier', 'chevron');
        el.setAttribute('tappable', '');
        el.innerHTML =
          '<div class="center">' +
          '<strong>' + escapeHtml(r.merchant_name || '（店舗名なし）') + '</strong>' +
          '<div class="receipt-meta">' +
          escapeHtml((r.purchased_at || '').slice(0, 10) || '-') +
          ' / ' + escapeHtml(r.status) +
          '</div></div>' +
          '<div class="right receipt-amount">' +
          (r.total_amount != null ? '¥' + Number(r.total_amount).toLocaleString() : '-') +
          '</div>';
        el.onclick = function () {
          openDetail(r.id);
        };
        list.appendChild(el);
      });
    } catch (e) {
      if (e.status === 403 && e.body && e.body.code === 'line_friend_required') {
        await nav().resetToPage('friend.html', { animation: 'fade' });
        return;
      }
      ons.notification.alert(e.message || String(e));
    }
  }

  async function openDetail(id) {
    try {
      const res = await SumikkoApi.receipt(id);
      state.detail = res.data;
      await nav().pushPage('detail.html');
    } catch (e) {
      ons.notification.alert(e.message || String(e));
    }
  }

  function fillDetail(page) {
    const r = state.detail || {};
    page.querySelector('#detailTitle').textContent = r.merchant_name || '（店舗名なし）';
    page.querySelector('#detailDate').textContent =
      (r.purchased_at || '').slice(0, 16).replace('T', ' ') || '-';
    page.querySelector('#detailAmount').textContent =
      r.total_amount != null ? '¥' + Number(r.total_amount).toLocaleString() : '-';
    page.querySelector('#detailStatus').textContent = '状態: ' + (r.status || '-');
    page.querySelector('#detailError').textContent = r.error_message || '';
  }

  async function loadSettings(page) {
    const lead = page.querySelector('#settingsLead');
    const hint = page.querySelector('#settingsHint');
    const err = page.querySelector('#settingsError');
    hint.textContent = '';
    err.textContent = '';
    try {
      state.settings = await SumikkoApi.settings();
      lead.textContent =
        'Claude APIキー ' + (state.settings.has_claude_api_key ? '（登録済み）' : '（未登録）');
    } catch (e) {
      err.textContent = e.message || String(e);
    }
  }

  async function saveKey(page) {
    const key = inputValue(page, '#apiKeyInput').trim();
    const hint = page.querySelector('#settingsHint');
    const err = page.querySelector('#settingsError');
    hint.textContent = '';
    err.textContent = '';
    try {
      const res = await SumikkoApi.saveApiKey(key);
      hint.textContent = res.message || '保存しました';
      await loadSettings(page);
    } catch (e) {
      err.textContent = e.message || String(e);
    }
  }

  function refreshUploadUi(page) {
    const preview = page.querySelector('#previewRow');
    const sendBtn = page.querySelector('#sendBtn');
    preview.innerHTML = '';
    state.pendingFiles.forEach(function (file) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = '';
      preview.appendChild(img);
    });
    sendBtn.disabled = state.pendingFiles.length === 0;
  }

  async function prepareUpload(page) {
    state.pendingFiles = [];
    const select = page.querySelector('#modelSelect');
    const hint = page.querySelector('#uploadHint');
    const err = page.querySelector('#uploadError');
    hint.textContent = '';
    err.textContent = '';
    select.innerHTML = '';
    try {
      state.settings = await SumikkoApi.settings();
      const models = state.settings.models || [];
      models.forEach(function (m) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label + ' / ' + m.name;
        if (m.id === state.settings.default_model) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) {
      err.textContent = e.message || String(e);
    }
    refreshUploadUi(page);
  }

  function addPendingFile(file, page) {
    state.pendingFiles = state.pendingFiles.concat([file]).slice(0, 10);
    page.querySelector('#uploadError').textContent = '';
    refreshUploadUi(page);
  }

  function uriToFile(uri) {
    return fetch(uri)
      .then(function (res) {
        return res.blob();
      })
      .then(function (blob) {
        return new File([blob], 'receipt-' + Date.now() + '.jpg', {
          type: blob.type || 'image/jpeg',
        });
      });
  }

  function pickWithCordova(sourceType, page) {
    navigator.camera.getPicture(
      function (uri) {
        uriToFile(uri)
          .then(function (file) {
            addPendingFile(file, page);
          })
          .catch(function (e) {
            page.querySelector('#uploadError').textContent = e.message || String(e);
          });
      },
      function (message) {
        if (String(message).toLowerCase().indexOf('cancel') >= 0) return;
        page.querySelector('#uploadError').textContent = String(message);
      },
      {
        quality: 85,
        destinationType: Camera.DestinationType.FILE_URI,
        sourceType: sourceType,
        correctOrientation: true,
        encodingType: Camera.EncodingType.JPEG,
        mediaType: Camera.MediaType.PICTURE,
      }
    );
  }

  function pickWithBrowser(page) {
    const input = page.querySelector('#fileFallback');
    input.value = '';
    input.onchange = function () {
      const files = Array.prototype.slice.call(input.files || []);
      files.forEach(function (f) {
        addPendingFile(f, page);
      });
    };
    input.click();
  }

  function pickImage(kind, page) {
    if (navigator.camera && typeof Camera !== 'undefined') {
      const source =
        kind === 'camera' ? Camera.PictureSourceType.CAMERA : Camera.PictureSourceType.PHOTOLIBRARY;
      pickWithCordova(source, page);
      return;
    }
    // ブラウザ / プラグイン未導入時のフォールバック
    pickWithBrowser(page);
  }

  async function sendUpload(page) {
    const model =
      page.querySelector('#modelSelect').value ||
      (state.settings && state.settings.default_model) ||
      'claude-sonnet-5';
    const hint = page.querySelector('#uploadHint');
    const err = page.querySelector('#uploadError');
    hint.textContent = '送信中...';
    err.textContent = '';
    try {
      const res = await SumikkoApi.uploadReceipts(state.pendingFiles, model);
      state.pendingFiles = [];
      hint.textContent = res.message || '送信しました';
      refreshUploadUi(page);
      setTimeout(function () {
        nav().popPage();
      }, 700);
    } catch (e) {
      hint.textContent = '';
      err.textContent = e.message || String(e);
    }
  }

  // 各 ons-page が表示されるときに一度だけ結線する
  document.addEventListener('init', function (event) {
    const page = event.target;

    if (page.id === 'bootPage') {
      boot();
      return;
    }

    if (page.id === 'loginPage') {
      page.querySelector('#loginBtn').onclick = function () {
        onLogin(page);
      };
      return;
    }

    if (page.id === 'friendPage') {
      page.querySelector('#openFriendBtn').onclick = openFriend;
      page.querySelector('#checkFriendBtn').onclick = function () {
        checkFriend(page);
      };
      page.querySelector('#friendLogoutBtn').onclick = onLogout;
      return;
    }

    if (page.id === 'homePage') {
      page.querySelector('#settingsBtn').onclick = function () {
        nav().pushPage('settings.html');
      };
      page.querySelector('#homeLogoutBtn').onclick = onLogout;
      page.querySelector('#uploadFab').onclick = function () {
        nav().pushPage('upload.html');
      };
      loadHome(page);
      return;
    }

    if (page.id === 'uploadPage') {
      page.querySelector('#cameraBtn').onclick = function () {
        pickImage('camera', page);
      };
      page.querySelector('#galleryBtn').onclick = function () {
        pickImage('gallery', page);
      };
      page.querySelector('#sendBtn').onclick = function () {
        sendUpload(page);
      };
      prepareUpload(page);
      return;
    }

    if (page.id === 'detailPage') {
      fillDetail(page);
      return;
    }

    if (page.id === 'settingsPage') {
      page.querySelector('#saveKeyBtn').onclick = function () {
        saveKey(page);
      };
      loadSettings(page);
    }
  });

  // ホームに戻ったときに一覧を更新
  document.addEventListener('show', function (event) {
    const page = event.target;
    if (page.id === 'homePage') loadHome(page);
  });

  // Cordova でもブラウザでも、準備完了後に動かす
  ons.ready(function () {
    // navigator の初期 page=boot.html が init を発火する
  });
})();
