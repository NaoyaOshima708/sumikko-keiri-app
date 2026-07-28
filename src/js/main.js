import { SplashScreen } from '@capacitor/splash-screen';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { SumikkoApi, setToken, getToken, config } from './api.js';

const app = document.getElementById('app');
let state = {
  user: null,
  screen: 'boot',
  receipts: [],
  detail: null,
  settings: null,
  pendingFiles: [],
  error: '',
  message: '',
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function topbar(title, actions = '') {
  return `
    <header class="topbar">
      <div class="brand">
        <img src="./assets/imgs/logo.png" alt="">
        <span><span>すみっこ</span><span>経理</span></span>
      </div>
      <div class="top-actions">${actions}</div>
    </header>
    ${title ? `<div class="wrap" style="padding-bottom:0"><h1>${title}</h1></div>` : ''}
  `;
}

function render() {
  if (state.screen === 'boot') {
    app.innerHTML = `<div class="center">起動中...</div>`;
    return;
  }

  if (state.screen === 'login') {
    app.innerHTML = `
      ${topbar('')}
      <div class="wrap">
        <div class="card">
          <h1>ログイン</h1>
          <p class="lead">メールでログイン（LINEログインは次に接続）</p>
          <label>メール<input id="email" type="email" autocomplete="username"></label>
          <label>パスワード<input id="password" type="password" autocomplete="current-password"></label>
          <button class="btn btn-primary" id="loginBtn">ログイン</button>
          <p class="error" id="err">${state.error || ''}</p>
        </div>
      </div>
    `;
    app.querySelector('#loginBtn').onclick = onLogin;
    return;
  }

  if (state.screen === 'friend') {
    app.innerHTML = `
      ${topbar('', `<button id="logoutBtn">ログアウト</button>`)}
      <div class="wrap">
        <div class="card">
          <h1>友だち追加が必要</h1>
          <p class="lead">公式アカウントを友だち追加すると利用できます。ブロック中も同じです。</p>
          <button class="btn btn-line" id="openFriend">友だち追加を開く</button>
          <button class="btn btn-outline" id="checkFriend">追加したので確認</button>
          <p class="error">${state.error || ''}</p>
        </div>
      </div>
    `;
    app.querySelector('#openFriend').onclick = openFriend;
    app.querySelector('#checkFriend').onclick = checkFriend;
    app.querySelector('#logoutBtn').onclick = onLogout;
    return;
  }

  if (state.screen === 'home') {
    const items = state.receipts
      .map(
        (r) => `
      <div class="item" data-id="${r.id}">
        <div>
          <strong>${escapeHtml(r.merchant_name || '（店舗名なし）')}</strong>
          <div class="meta">${(r.purchased_at || '').slice(0, 10) || '-'} / ${escapeHtml(r.status)}</div>
        </div>
        <div class="amount">${r.total_amount != null ? '¥' + Number(r.total_amount).toLocaleString() : '-'}</div>
      </div>`
      )
      .join('');

    app.innerHTML = `
      ${topbar('', `<button id="settingsBtn">設定</button><button id="logoutBtn">ログアウト</button>`)}
      <div class="wrap">
        <h1>履歴（${monthNow()}）</h1>
        <p class="lead">下のカメラボタンから撮影できます</p>
        <div class="list" style="margin-top:16px">
          ${items || '<div class="center" style="min-height:30vh">この月の領収書はまだありません</div>'}
        </div>
      </div>
      <button class="fab" id="fab" aria-label="撮影">＋</button>
    `;
    app.querySelector('#fab').onclick = () => go('upload');
    app.querySelector('#settingsBtn').onclick = () => go('settings');
    app.querySelector('#logoutBtn').onclick = onLogout;
    app.querySelectorAll('.item').forEach((el) => {
      el.onclick = () => openDetail(Number(el.dataset.id));
    });
    return;
  }

  if (state.screen === 'upload') {
    const previews = state.pendingFiles
      .map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`)
      .join('');
    const models = (state.settings?.models || [])
      .map(
        (m) =>
          `<option value="${m.id}" ${m.id === state.settings?.default_model ? 'selected' : ''}>${escapeHtml(
            m.label + ' / ' + m.name
          )}</option>`
      )
      .join('');

    app.innerHTML = `
      ${topbar('', `<button id="backBtn">戻る</button>`)}
      <div class="wrap">
        <div class="card">
          <h1>アップロード</h1>
          <label>モデル<select id="model">${models}</select></label>
          <button class="btn btn-primary" id="cameraBtn">カメラで撮影</button>
          <button class="btn btn-outline" id="galleryBtn">ギャラリーから選択</button>
          <div class="preview">${previews}</div>
          <button class="btn btn-primary" id="sendBtn" ${state.pendingFiles.length ? '' : 'disabled'}>送信して解析</button>
          <p class="hint">${state.message || ''}</p>
          <p class="error">${state.error || ''}</p>
        </div>
      </div>
    `;
    app.querySelector('#backBtn').onclick = () => go('home');
    app.querySelector('#cameraBtn').onclick = () => pickImage(CameraSource.Camera);
    app.querySelector('#galleryBtn').onclick = () => pickImage(CameraSource.Photos);
    app.querySelector('#sendBtn').onclick = sendUpload;
    return;
  }

  if (state.screen === 'detail' && state.detail) {
    const r = state.detail;
    app.innerHTML = `
      ${topbar('', `<button id="backBtn">戻る</button>`)}
      <div class="wrap">
        <div class="card">
          <h1>${escapeHtml(r.merchant_name || '（店舗名なし）')}</h1>
          <p class="lead">${(r.purchased_at || '').slice(0, 16).replace('T', ' ') || '-'}</p>
          <p class="amount" style="font-size:1.4rem">${
            r.total_amount != null ? '¥' + Number(r.total_amount).toLocaleString() : '-'
          }</p>
          <p class="hint">状態: ${escapeHtml(r.status)}</p>
          ${r.error_message ? `<p class="error">${escapeHtml(r.error_message)}</p>` : ''}
        </div>
      </div>
    `;
    app.querySelector('#backBtn').onclick = () => go('home');
    return;
  }

  if (state.screen === 'settings') {
    app.innerHTML = `
      ${topbar('', `<button id="backBtn">戻る</button>`)}
      <div class="wrap">
        <div class="card">
          <h1>設定</h1>
          <p class="lead">Claude APIキー ${state.settings?.has_claude_api_key ? '（登録済み）' : '（未登録）'}</p>
          <label>APIキー<input id="apiKey" type="password" placeholder="sk-ant-..."></label>
          <button class="btn btn-primary" id="saveKey">保存</button>
          <p class="hint">${state.message || ''}</p>
          <p class="error">${state.error || ''}</p>
        </div>
      </div>
    `;
    app.querySelector('#backBtn').onclick = () => go('home');
    app.querySelector('#saveKey').onclick = saveKey;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function go(screen) {
  state.screen = screen;
  state.error = '';
  state.message = '';
  if (screen === 'home') await loadReceipts();
  if (screen === 'upload') await loadSettings();
  if (screen === 'settings') await loadSettings();
  render();
}

async function onLogin() {
  const email = app.querySelector('#email').value.trim();
  const password = app.querySelector('#password').value;
  state.error = '';
  render();
  try {
    const res = await SumikkoApi.login(email, password);
    setToken(res.token);
    state.user = res.user;
    await afterAuth(res.user);
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function afterAuth(user) {
  if (!user.line_friend) {
    state.screen = 'friend';
    render();
    return;
  }
  await go('home');
}

async function openFriend() {
  const url = state.user?.add_friend_url || config.addFriendUrl;
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank');
  }
}

async function checkFriend() {
  try {
    const res = await SumikkoApi.me();
    state.user = res.user;
    if (res.user.line_friend) await go('home');
    else {
      state.error = 'まだ友だち追加が反映されていません。';
      render();
    }
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function onLogout() {
  await SumikkoApi.logout();
  state.user = null;
  state.screen = 'login';
  render();
}

async function loadReceipts() {
  try {
    const res = await SumikkoApi.receipts(monthNow());
    state.receipts = res.data || [];
  } catch (e) {
    if (e.status === 403 && e.body?.code === 'line_friend_required') {
      state.screen = 'friend';
      return;
    }
    state.error = e.message;
  }
}

async function loadSettings() {
  try {
    state.settings = await SumikkoApi.settings();
  } catch (e) {
    state.error = e.message;
  }
}

async function openDetail(id) {
  try {
    const res = await SumikkoApi.receipt(id);
    state.detail = res.data;
    state.screen = 'detail';
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function pickImage(source) {
  try {
    if (!Capacitor.isNativePlatform()) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = () => {
        state.pendingFiles = [...state.pendingFiles, ...Array.from(input.files || [])].slice(0, 10);
        render();
      };
      input.click();
      return;
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source,
      correctOrientation: true,
    });

    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
    state.pendingFiles = [...state.pendingFiles, file].slice(0, 10);
    state.error = '';
    render();
  } catch (e) {
    if (String(e?.message || e).includes('cancelled') || String(e).includes('canceled')) return;
    state.error = e.message || String(e);
    render();
  }
}

async function sendUpload() {
  const model = app.querySelector('#model')?.value || state.settings?.default_model || 'claude-sonnet-5';
  state.message = '送信中...';
  state.error = '';
  render();
  try {
    const res = await SumikkoApi.uploadReceipts(state.pendingFiles, model);
    state.pendingFiles = [];
    state.message = res.message;
    render();
    setTimeout(() => go('home'), 700);
  } catch (e) {
    state.message = '';
    state.error = e.message;
    render();
  }
}

async function saveKey() {
  const key = app.querySelector('#apiKey').value.trim();
  try {
    const res = await SumikkoApi.saveApiKey(key);
    state.message = res.message;
    state.error = '';
    await loadSettings();
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function boot() {
  render();
  try {
    await SplashScreen.hide();
  } catch {
    /* browser */
  }

  if (!getToken()) {
    state.screen = 'login';
    render();
    return;
  }

  try {
    const res = await SumikkoApi.me();
    state.user = res.user;
    await afterAuth(res.user);
  } catch {
    setToken('');
    state.screen = 'login';
    render();
  }
}

boot();
