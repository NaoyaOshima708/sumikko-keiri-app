# Monaca で動かす手順（最初からこれだけで完結）

**どこに何を置くか:** 必ず先に [WHERE_TO_DEPLOY.md](./WHERE_TO_DEPLOY.md) を見る。  
（`www/` = Monaca / `server-api/` = サーバーPHP。混ぜない）

Monacaデバッガーの origin は `monaca-debugger://...` のため、通常の XHR は Laravel CORS で落ちます。  
対策は次の **どちらか一方** です。

---

## 対策A（推奨）: AdvancedHTTP プラグインを入れる

### 画面上の名前（ここを間違えると見つからない）

| 画面に出る名前 | npm / プラグインID |
|--|--|
| **AdvancedHTTP** | `cordova-plugin-advanced-http` |
| **File**（または File 系） | `cordova-plugin-file` |
| Camera（済ならそのまま） | `cordova-plugin-camera` |
| InAppBrowser（済ならそのまま） | `cordova-plugin-inappbrowser` |

一覧を眺めるときは **「AdvancedHTTP」** で探す。  
`cordova-plugin-advanced-http` という文字列は一覧に出ないことが多い。

### 手順

1. MonacaクラウドIDE → **設定 → Cordovaプラグインの管理**
2. **利用可能なプラグイン** で `Advanced` / `HTTP` を検索し、**AdvancedHTTP** を **有効**
3. 一覧に無い場合 → 画面上部の **Cordovaプラグインのインポート** を開き、次を入力してインポート  
   ```
   cordova-plugin-advanced-http
   ```
   続けて必要なら:
   ```
   cordova-plugin-file
   ```
4. `/www/js/api.js` と `/www/js/app.js` をローカル最新で上書き  
   場所: `C:\work\sumikko-keiri-app\sumikko-keiri-app\www\js\`
5. デバッガーを再読込
6. Console で確認: `ons.ready nativeHttp= true`  
   - `false` → プラグイン未反映（手順2–3をやり直し）
7. ログイン  
   - メール: `demo-app@sumikko-app.com`  
   - パスワード: `SumikkoDemo123!`  
   - 成功すると「友だち追加が必要」（demo は line_friend=false で正常）

公式: https://ja.docs.monaca.io/reference/third_party_phonegap/advancedhttppuraguin

---

## 対策B: プラグインが使えないプランのとき（Laravel CORS）

プラグインなしでも動かす。サーバー側のみ変更。

`config/cors.php` に:

```php
'allowed_origins_patterns' => [
    '#^monaca-debugger://#',
    '#^https?://.*\.monaca\.io$#',
    '#^https?://.*\.monaca\.mobi$#',
],
```

```bash
cd /var/www/html/accounting.maspis.com
php artisan config:clear
```

今の `api.js` は「AdvancedHTTP があれば使う／無ければ XHR」なので、CORS が通ればログインできる。

---

## ファイルアップロードについて（Monaca）

- **フォルダごとアップロードはできない**（ファイル選択のみ）
- 先に左ツリーで `www/js` などフォルダを作成してから、ファイルを選んで上げる
- Onsen UI の `lib` はテンプレ付属を使い、上げなくてよいことが多い

上げる本体（最低限）:

```
www/index.html
www/boot.html
www/login.html
www/friend.html
www/home.html
www/upload.html
www/detail.html
www/settings.html
www/css/style.css
www/js/api.js
www/js/app.js
```

---

## ローカル / Git

- パス: `C:\work\sumikko-keiri-app\sumikko-keiri-app`
- GitHub: https://github.com/NaoyaOshima708/sumikko-keiri-app
- 引継ぎ全体: `HANDOFF.md`
