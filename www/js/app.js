(function () {
  const state = {
    user: null,
    settings: null,
    pendingFiles: [],
    detail: null,
    historyMonth: null, // 'YYYY-MM'（Web版の対象月と同じ）
  };

  function nav() {
    return document.querySelector('#appNavigator');
  }

  function monthNow() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // Web版 Format::monthJa 相当
  function formatMonthJa(month) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return '全期間';
    const parts = month.split('-');
    return parts[0] + '年' + parts[1] + '月';
  }

  function shiftMonth(ym, delta) {
    const parts = String(ym || monthNow()).split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Web版と同じラベル
  function statusLabel(status) {
    const map = {
      pending: '解析待ち',
      processing: '解析中',
      completed: '解析完了',
      failed: '解析失敗',
    };
    const key = String(status || '').toLowerCase();
    return map[key] || status || '-';
  }

  function receiptSortDate(r) {
    return (r && (r.purchased_at || r.created_at)) || '';
  }

  // Web版どおり対象月で取得（レシート日付基準。ページネーションも追従）
  async function fetchReceiptsForMonth(month) {
    const byId = {};
    let page = 1;
    let lastPage = 1;
    const maxPages = 60;

    do {
      const res = await SumikkoApi.receipts({ month: month, page: page });
      const items = res.data || [];
      items.forEach(function (r) {
        if (r && r.id != null) byId[r.id] = r;
      });
      lastPage = (res.meta && res.meta.last_page) || 1;
      page += 1;
    } while (page <= lastPage && page <= maxPages);

    return Object.keys(byId)
      .map(function (id) {
        return byId[id];
      })
      .sort(function (a, b) {
        return String(receiptSortDate(b)).localeCompare(String(receiptSortDate(a)));
      });
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

  function syncMonthControls(page) {
    if (!state.historyMonth) state.historyMonth = monthNow();
    const label = page.querySelector('#monthLabel');
    const prevBtn = page.querySelector('#monthPrevBtn');
    const nextBtn = page.querySelector('#monthNextBtn');
    if (label) label.textContent = formatMonthJa(state.historyMonth);
    if (nextBtn) nextBtn.disabled = state.historyMonth >= monthNow();
    if (prevBtn) prevBtn.disabled = false;
  }

  async function loadHome(page) {
    const list = page.querySelector('#receiptList');
    const empty = page.querySelector('#homeEmpty');
    const lead = page.querySelector('#homeLead');
    if (!state.historyMonth) state.historyMonth = monthNow();
    syncMonthControls(page);
    if (lead) {
      lead.textContent = 'レシート日付基準 ／ 右下の＋から撮影';
    }
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
      const items = await fetchReceiptsForMonth(state.historyMonth);
      if (!items.length) {
        empty.style.display = 'block';
        return;
      }
      items.forEach(function (r) {
        const el = document.createElement('div');
        el.className = 'receipt-card';
        const statusKey = String(r.status || '').toLowerCase();
        el.innerHTML =
          '<div class="left-col">' +
          '<div class="name">' + escapeHtml(r.merchant_name || '（店舗名なし）') + '</div>' +
          '<div class="meta">' +
          escapeHtml((r.purchased_at || r.created_at || '').slice(0, 16).replace('T', ' ') || '-') +
          '</div></div>' +
          '<div class="right-col">' +
          '<div class="status status-' + escapeHtml(statusKey) + '">' +
          escapeHtml(statusLabel(r.status)) +
          '</div>' +
          '<div class="amount">' +
          (r.total_amount != null ? '¥' + Number(r.total_amount).toLocaleString() : '-') +
          '</div></div>';
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

  let detailPollTimer = null;
  let detailImageObjectUrl = null;

  function clearDetailPoll() {
    if (detailPollTimer) {
      clearTimeout(detailPollTimer);
      detailPollTimer = null;
    }
  }

  function revokeDetailImage() {
    if (detailImageObjectUrl) {
      try {
        URL.revokeObjectURL(detailImageObjectUrl);
      } catch (e) {}
      detailImageObjectUrl = null;
    }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // 端末ローカルの日付・時刻（iOSのdatetime-localは崩れるため分離）
  function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return (
        d.getFullYear() +
        '-' +
        pad2(d.getMonth() + 1) +
        '-' +
        pad2(d.getDate()) +
        'T' +
        pad2(d.getHours()) +
        ':' +
        pad2(d.getMinutes())
      );
    }
    const s = String(iso).trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
      return s.slice(0, 16).replace(' ', 'T');
    }
    return '';
  }

  function toDateValue(iso) {
    const v = toDatetimeLocalValue(iso);
    return v ? v.slice(0, 10) : '';
  }

  function toTimeValue(iso) {
    const v = toDatetimeLocalValue(iso);
    return v ? v.slice(11, 16) : '';
  }

  function fromDateTimeParts(dateVal, timeVal) {
    const date = String(dateVal || '').trim();
    if (!date) return null;
    let time = String(timeVal || '').trim() || '00:00';
    if (time.length === 5) time += ':00';
    return date + ' ' + time;
  }

  function amountInputValue(v) {
    if (v == null || v === '') return '';
    const n = Number(v);
    return isNaN(n) ? '' : String(Math.round(n));
  }

  function parseOptionalAmount(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    const n = Number(s);
    if (isNaN(n) || n < 0) throw new Error('金額の形式が正しくありません');
    return n;
  }

  function rawTextOf(r) {
    if (!r) return '';
    if (r.raw_text) return r.raw_text;
    if (r.analysis_json && r.analysis_json.raw_text) return r.analysis_json.raw_text;
    return '';
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

  function loadDetailImage(page, r) {
    const wrap = page.querySelector('#detailImageWrap');
    const img = page.querySelector('#detailImage');
    revokeDetailImage();
    if (!wrap || !img || !r || !r.image_url) {
      if (wrap) wrap.style.display = 'none';
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('GET', r.image_url, true);
    xhr.responseType = 'blob';
    const token = typeof getToken === 'function' ? getToken() : '';
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Accept', 'image/*,*/*');
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300 || !xhr.response) {
        wrap.style.display = 'none';
        return;
      }
      detailImageObjectUrl = URL.createObjectURL(xhr.response);
      img.src = detailImageObjectUrl;
      wrap.style.display = 'block';
    };
    xhr.onerror = function () {
      wrap.style.display = 'none';
    };
    xhr.send();
  }

  function scheduleDetailPoll(page) {
    clearDetailPoll();
    const r = state.detail;
    if (!r || (r.status !== 'pending' && r.status !== 'processing')) return;
    detailPollTimer = setTimeout(async function () {
      try {
        const res = await SumikkoApi.receipt(r.id);
        state.detail = res.data;
        fillDetail(page);
        scheduleDetailPoll(page);
      } catch (e) {
        console.warn('detail poll failed', e);
      }
    }, 3000);
  }

  function fillDetail(page) {
    const r = state.detail || {};
    const hint = page.querySelector('#detailHint');
    const err = page.querySelector('#detailError');
    if (hint) hint.textContent = '';
    if (err) err.textContent = '';

    const setVal = function (sel, val) {
      const el = page.querySelector(sel);
      if (el) el.value = val == null ? '' : String(val);
    };

    setVal('#detailMerchant', r.merchant_name || '');
    setVal('#detailPurchasedDate', toDateValue(r.purchased_at));
    setVal('#detailPurchasedTime', toTimeValue(r.purchased_at));
    setVal('#detailTotalAmount', amountInputValue(r.total_amount));
    setVal('#detailTaxAmount', amountInputValue(r.tax_amount));
    setVal('#detailCurrency', (r.currency || 'JPY').toUpperCase());
    setVal('#detailRegNumber', r.registration_number || '');

    const payment = page.querySelector('#detailPayment');
    const receiptNo = page.querySelector('#detailReceiptNo');
    const statusEl = page.querySelector('#detailStatus');
    const rawEl = page.querySelector('#detailRawText');
    if (payment) payment.textContent = r.payment_method || '—';
    if (receiptNo) receiptNo.textContent = r.receipt_number || '—';
    if (statusEl) statusEl.textContent = statusLabel(r.status);
    if (rawEl) rawEl.textContent = rawTextOf(r) || '全文データはありません。';

    const banner = page.querySelector('#detailAnalyzeBanner');
    if (banner) {
      if (r.status === 'pending' || r.status === 'processing') {
        banner.style.display = 'block';
        banner.textContent =
          (r.status === 'pending' ? '解析待ちです。' : 'レシートを解析中です。') +
          '完了すると自動的に表示を更新します。';
      } else {
        banner.style.display = 'none';
        banner.textContent = '';
      }
    }

    const failedCard = page.querySelector('#detailFailedCard');
    const failedMsg = page.querySelector('#detailFailedMessage');
    if (failedCard) {
      if (r.status === 'failed') {
        failedCard.style.display = 'block';
        if (failedMsg) failedMsg.textContent = r.error_message || '解析に失敗しました。';
      } else {
        failedCard.style.display = 'none';
      }
    }

    loadDetailImage(page, r);
    scheduleDetailPoll(page);
  }

  async function saveDetail(page) {
    const r = state.detail || {};
    const hint = page.querySelector('#detailHint');
    const err = page.querySelector('#detailError');
    const btn = page.querySelector('#detailSaveBtn');
    if (hint) hint.textContent = '';
    if (err) err.textContent = '';
    if (!r.id) {
      if (err) err.textContent = 'レシート情報を読み込めませんでした。';
      return;
    }

    let totalAmount;
    let taxAmount;
    try {
      totalAmount = parseOptionalAmount(inputValue(page, '#detailTotalAmount'));
      taxAmount = parseOptionalAmount(inputValue(page, '#detailTaxAmount'));
    } catch (e) {
      if (err) err.textContent = e.message || String(e);
      return;
    }

    const currency = String(inputValue(page, '#detailCurrency') || 'JPY')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      if (err) err.textContent = '通貨は3文字の英字で入力してください（例: JPY）';
      return;
    }

    const payload = {
      merchant_name: String(inputValue(page, '#detailMerchant') || '').trim() || null,
      purchased_at: fromDateTimeParts(
        inputValue(page, '#detailPurchasedDate'),
        inputValue(page, '#detailPurchasedTime')
      ),
      total_amount: totalAmount,
      tax_amount: taxAmount,
      currency: currency,
      registration_number: String(inputValue(page, '#detailRegNumber') || '').trim() || null,
    };

    if (btn) btn.disabled = true;
    try {
      const res = await SumikkoApi.updateReceipt(r.id, payload);
      state.detail = res.data || state.detail;
      fillDetail(page);
      if (hint) hint.textContent = (res && res.message) || '更新しました。';
    } catch (e) {
      console.error('saveDetail failed', e);
      if (err) err.textContent = e.message || String(e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function retryDetail(page) {
    const r = state.detail || {};
    const err = page.querySelector('#detailError');
    const hint = page.querySelector('#detailHint');
    if (err) err.textContent = '';
    if (!r.id) return;
    try {
      const res = await SumikkoApi.retryReceipt(r.id);
      if (hint) hint.textContent = (res && res.message) || '解析を受け付けました。';
      const fresh = await SumikkoApi.receipt(r.id);
      state.detail = fresh.data;
      fillDetail(page);
    } catch (e) {
      if (err) err.textContent = e.message || String(e);
    }
  }

  async function deleteDetail(page) {
    const r = state.detail || {};
    if (!r.id) return;
    const ok = await ons.notification.confirm({
      title: '削除確認',
      message: 'このレシートを削除しますか？この操作は取り消せません。',
      buttonLabels: ['キャンセル', '削除する'],
    });
    if (ok !== 1) return;

    const err = page.querySelector('#detailError');
    const btn = page.querySelector('#detailDeleteBtn');
    if (err) err.textContent = '';
    if (btn) btn.disabled = true;
    try {
      await SumikkoApi.deleteReceipt(r.id);
      clearDetailPoll();
      revokeDetailImage();
      state.detail = null;
      await nav().popPage();
      ons.notification.toast('削除しました', { timeout: 1800 });
    } catch (e) {
      if (err) err.textContent = e.message || String(e);
      if (btn) btn.disabled = false;
    }
  }

  const CSV_HISTORY_KEY = 'sumikko_csv_history';

  function loadCsvHistory() {
    try {
      const raw = localStorage.getItem(CSV_HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function persistCsvHistory(list) {
    localStorage.setItem(CSV_HISTORY_KEY, JSON.stringify((list || []).slice(0, 30)));
  }

  function addCsvHistoryEntry(entry) {
    const list = loadCsvHistory();
    list.unshift(entry);
    persistCsvHistory(list);
  }

  function removeCsvHistoryEntry(id) {
    persistCsvHistory(
      loadCsvHistory().filter(function (x) {
        return String(x.id) !== String(id);
      })
    );
  }

  async function shareCsvFile(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    try {
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], filename, { type: 'text/csv' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return true;
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
      console.warn('share files failed', e);
    }

    try {
      if (navigator.share) {
        await navigator.share({ title: filename, text: content });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
      console.warn('share text failed', e);
    }

    // フォールバック: 新規タブ / ダウンロード相当
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
    return true;
  }

  async function exportCurrentMonthCsv(page) {
    const month = state.historyMonth || monthNow();
    const hint = page.querySelector('#homeCsvHint');
    const err = page.querySelector('#homeCsvError');
    const btn = page.querySelector('#csvExportBtn');
    if (hint) hint.textContent = 'CSVを作成しています…';
    if (err) err.textContent = '';
    if (btn) btn.disabled = true;
    try {
      const res = await SumikkoApi.exportCsv(month);
      const entry = {
        id: String(Date.now()),
        month: month,
        monthLabel: formatMonthJa(month),
        filename: res.filename || 'receipts_' + month + '.csv',
        content: res.content || '',
        createdAt: new Date().toISOString(),
        bytes: (res.content || '').length,
      };
      addCsvHistoryEntry(entry);
      if (hint) {
        hint.textContent = formatMonthJa(month) + ' のCSVを履歴に保存しました。共有画面を開きます。';
      }
      await shareCsvFile(entry.filename, entry.content);
    } catch (e) {
      console.error('csv export failed', e);
      if (err) err.textContent = e.message || String(e);
      if (hint) hint.textContent = '';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function fillCsvHistory(page) {
    const list = page.querySelector('#csvHistoryList');
    const empty = page.querySelector('#csvHistoryEmpty');
    list.innerHTML = '';
    const items = loadCsvHistory();
    if (!items.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    items.forEach(function (item) {
      const el = document.createElement('div');
      el.className = 'receipt-card csv-history-card';
      const when = (item.createdAt || '').slice(0, 16).replace('T', ' ');
      el.innerHTML =
        '<div class="left-col">' +
        '<div class="name">' +
        escapeHtml(item.monthLabel || formatMonthJa(item.month)) +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(when || '-') +
        ' ／ ' +
        escapeHtml(item.filename || 'receipts.csv') +
        '</div></div>' +
        '<div class="right-col csv-history-actions">' +
        '<button type="button" class="mini-btn" data-act="share">再共有</button>' +
        '<button type="button" class="mini-btn mini-danger" data-act="delete">削除</button>' +
        '</div>';
      el.querySelector('[data-act="share"]').onclick = function (ev) {
        ev.stopPropagation();
        shareCsvFile(item.filename || 'receipts.csv', item.content || '');
      };
      el.querySelector('[data-act="delete"]').onclick = function (ev) {
        ev.stopPropagation();
        removeCsvHistoryEntry(item.id);
        fillCsvHistory(page);
      };
      list.appendChild(el);
    });
  }

  function settingsHasKey(settings) {
    if (!settings) return false;
    if (typeof settings.has_claude_api_key !== 'undefined') return !!settings.has_claude_api_key;
    if (settings.data && typeof settings.data.has_claude_api_key !== 'undefined') {
      return !!settings.data.has_claude_api_key;
    }
    return false;
  }

  async function loadSettings(page) {
    const lead = page.querySelector('#settingsLead');
    const hint = page.querySelector('#settingsHint');
    const err = page.querySelector('#settingsError');
    err.textContent = '';
    try {
      state.settings = await SumikkoApi.settings();
      const registered = settingsHasKey(state.settings);
      lead.textContent = registered
        ? '解析に使うAPIキーは登録済みです。変更する場合は新しいキーを入力して保存してください。'
        : '解析に使うAPIキーを登録します。（まだ未登録）';
      if (registered && !hint.textContent) {
        hint.textContent = '登録済み';
      }
    } catch (e) {
      console.error('settings load failed', e);
      err.textContent = e.message || String(e);
    }
  }

  async function saveKey(page) {
    const key = inputValue(page, '#apiKeyInput').trim();
    const hint = page.querySelector('#settingsHint');
    const err = page.querySelector('#settingsError');
    const lead = page.querySelector('#settingsLead');
    hint.textContent = '';
    err.textContent = '';
    if (!key) {
      err.textContent = 'APIキーを入力してください';
      return;
    }
    try {
      console.log('saveApiKey start len=', key.length);
      const res = await SumikkoApi.saveApiKey(key);
      console.log('saveApiKey ok', res);
      const registered = !!(res && (res.has_claude_api_key || settingsHasKey(res)));
      hint.textContent = (res && res.message) || '保存しました';
      if (registered) {
        lead.textContent =
          '解析に使うAPIキーは登録済みです。変更する場合は新しいキーを入力して保存してください。';
      }
      page.querySelector('#apiKeyInput').value = '';
      await loadSettings(page);
    } catch (e) {
      console.error('saveApiKey failed', e && e.message, e);
      err.textContent = e.message || String(e);
    }
  }

  function refreshUploadUi(page) {
    const preview = page.querySelector('#previewRow');
    const sendBtn = page.querySelector('#sendBtn');
    if (!preview || !sendBtn) return;
    preview.innerHTML = '';
    state.pendingFiles.forEach(function (item) {
      const img = document.createElement('img');
      if (item && item.preview) img.src = item.preview;
      else if (item && item.file) img.src = URL.createObjectURL(item.file);
      else if (item && item.path) img.src = item.path;
      img.alt = '';
      preview.appendChild(img);
    });
    sendBtn.disabled = state.pendingFiles.length === 0;
  }

  function resolveUploadModel() {
    // 一括変更は SumikkoConfig.defaultModel を編集する
    return (SumikkoConfig && SumikkoConfig.defaultModel) || 'claude-sonnet-5';
  }

  async function prepareUpload(page) {
    state.pendingFiles = [];
    const hint = page.querySelector('#uploadHint');
    const err = page.querySelector('#uploadError');
    if (hint) hint.textContent = '';
    if (err) err.textContent = '';
    refreshUploadUi(page);
  }

  function addPendingItem(item, page) {
    state.pendingFiles = state.pendingFiles.concat([item]).slice(0, 10);
    const err = page.querySelector('#uploadError');
    if (err) err.textContent = '';
    refreshUploadUi(page);
  }

  // iOS WebView では new File() が FormData.append で Blob 扱いにならず落ちる
  // → 常に素の Blob + name で返す
  function dataUrlToFile(dataUrl, filename) {
    const parts = String(dataUrl).split(',');
    const mimeMatch = parts[0] && parts[0].match(/:(.*?);/);
    const mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
    const b64 = parts[1] || '';
    if (!b64) throw new Error('画像データが空です');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    blob.name = filename || 'receipt.jpg';
    return blob;
  }

  function setUploadStatus(page, hintText, errorText) {
    const hint = page.querySelector('#uploadHint');
    const err = page.querySelector('#uploadError');
    if (hint) hint.textContent = hintText || '';
    if (err) err.textContent = errorText || '';
  }

  async function sendUpload(page) {
    const model = resolveUploadModel();
    if (!state.pendingFiles.length) {
      setUploadStatus(page, '', '画像がありません。撮影または選択してください。');
      return;
    }
    const hasFile = state.pendingFiles.some(function (x) {
      return x && x.file;
    });
    if (!hasFile) {
      setUploadStatus(page, '', '画像データの変換に失敗しました。もう一度撮影してください。');
      return;
    }

    setUploadStatus(page, '送信・解析中です…少々お待ちください', '');
    const sendBtn = page.querySelector('#sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      console.log('upload start count=', state.pendingFiles.length, 'model=', model);
      const res = await SumikkoApi.uploadReceipts(state.pendingFiles, model);
      console.log('upload ok', res);
      state.pendingFiles = [];
      refreshUploadUi(page);
      setUploadStatus(page, (res && res.message) || '送信しました。履歴に反映します。', '');
      setTimeout(function () {
        nav().popPage({ animation: 'fade' });
      }, 800);
    } catch (e) {
      console.error('upload failed', e && e.message, e);
      setUploadStatus(page, '', e.message || String(e));
      if (sendBtn) sendBtn.disabled = state.pendingFiles.length === 0;
    }
  }

  function handlePickedFile(file, previewUrl, page) {
    addPendingItem({ file: file, preview: previewUrl || '' }, page);
    // 撮影/選択したらそのまま解析へ（追加操作不要）
    sendUpload(page);
  }

  function pickWithCordova(sourceType, page) {
    if (!navigator.camera || typeof Camera === 'undefined') {
      setUploadStatus(page, '', 'Cameraプラグインが有効ではありません');
      pickWithBrowser(page);
      return;
    }

    setUploadStatus(page, 'カメラ／ギャラリーを起動しています…', '');
    navigator.camera.getPicture(
      function (data) {
        try {
          console.log('camera success bytes=', String(data || '').length);
          // DATA_URL（base64）で受け取る。file:// 変換は Cordova で止まりやすい
          const dataUrl = String(data).indexOf('data:') === 0 ? data : 'data:image/jpeg;base64,' + data;
          const file = dataUrlToFile(dataUrl, 'receipt-' + Date.now() + '.jpg');
          handlePickedFile(file, dataUrl, page);
        } catch (e) {
          console.error('camera convert failed', e);
          setUploadStatus(page, '', '画像の変換に失敗しました: ' + (e.message || e));
        }
      },
      function (message) {
        const msg = String(message || '');
        if (msg.toLowerCase().indexOf('cancel') >= 0) {
          setUploadStatus(page, '', '');
          return;
        }
        console.error('camera error', msg);
        setUploadStatus(page, '', msg || 'カメラの起動に失敗しました');
      },
      {
        quality: 70,
        destinationType: Camera.DestinationType.DATA_URL,
        sourceType: sourceType,
        correctOrientation: true,
        encodingType: Camera.EncodingType.JPEG,
        mediaType: Camera.MediaType.PICTURE,
        saveToPhotoAlbum: false,
        allowEdit: false,
      }
    );
  }

  function pickWithBrowser(page) {
    const input = page.querySelector('#fileFallback');
    if (!input) {
      setUploadStatus(page, '', 'ファイル選択が使えません');
      return;
    }
    input.value = '';
    input.onchange = function () {
      const files = Array.prototype.slice.call(input.files || []).slice(0, 10);
      if (!files.length) return;
      state.pendingFiles = files.map(function (f) {
        return { file: f, preview: URL.createObjectURL(f) };
      });
      refreshUploadUi(page);
      sendUpload(page);
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
    pickWithBrowser(page);
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
      if (!state.historyMonth) state.historyMonth = monthNow();
      page.querySelector('#settingsBtn').onclick = function () {
        nav().pushPage('settings.html');
      };
      page.querySelector('#uploadFab').onclick = function () {
        nav().pushPage('upload.html');
      };
      page.querySelector('#monthPrevBtn').onclick = function () {
        state.historyMonth = shiftMonth(state.historyMonth || monthNow(), -1);
        loadHome(page);
      };
      page.querySelector('#monthNextBtn').onclick = function () {
        const next = shiftMonth(state.historyMonth || monthNow(), 1);
        if (next > monthNow()) return;
        state.historyMonth = next;
        loadHome(page);
      };
      page.querySelector('#csvExportBtn').onclick = function () {
        exportCurrentMonthCsv(page);
      };
      page.querySelector('#csvHistoryBtn').onclick = function () {
        nav().pushPage('csv-history.html');
      };
      loadHome(page);
      return;
    }

    if (page.id === 'uploadPage') {
      page.querySelector('#uploadBackBtn').onclick = function () {
        nav().popPage();
      };
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
      page.querySelector('#detailBackBtn').onclick = function () {
        clearDetailPoll();
        revokeDetailImage();
        nav().popPage();
      };
      page.querySelector('#detailSaveBtn').onclick = function () {
        saveDetail(page);
      };
      const retryBtn = page.querySelector('#detailRetryBtn');
      if (retryBtn) {
        retryBtn.onclick = function () {
          retryDetail(page);
        };
      }
      const deleteBtn = page.querySelector('#detailDeleteBtn');
      if (deleteBtn) {
        deleteBtn.onclick = function () {
          deleteDetail(page);
        };
      }
      fillDetail(page);
      return;
    }

    if (page.id === 'csvHistoryPage') {
      page.querySelector('#csvHistoryBackBtn').onclick = function () {
        nav().popPage();
      };
      fillCsvHistory(page);
      return;
    }

    if (page.id === 'settingsPage') {
      page.querySelector('#settingsBackBtn').onclick = function () {
        nav().popPage();
      };
      page.querySelector('#saveKeyBtn').onclick = function () {
        saveKey(page);
      };
      page.querySelector('#settingsLogoutBtn').onclick = onLogout;
      loadSettings(page);
    }
  });

  // ホームに戻ったときに一覧を更新
  document.addEventListener('show', function (event) {
    const page = event.target;
    if (page.id === 'homePage') loadHome(page);
  });

  document.addEventListener('hide', function (event) {
    if (event.target.id === 'detailPage') {
      clearDetailPoll();
      revokeDetailImage();
    }
  });

  ons.ready(function () {
    console.log(
      'ons.ready nativeHttp=',
      typeof SumikkoHasNativeHttp === 'function' ? SumikkoHasNativeHttp() : false,
      'origin=',
      location.origin
    );
  });
})();
