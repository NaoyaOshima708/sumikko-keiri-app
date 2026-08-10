# すみっこ経理アプリ — 引継ぎ資料

最終更新: 2026-08-10  
ローカルパス: `C:\work\sumikko-keiri-app\sumikko-keiri-app`  
GitHub: https://github.com/NaoyaOshima708/sumikko-keiri-app  
※ Monaca化の変更は **まだ commit / push していない可能性が高い**（作業ツリーにローカル変更あり）

---

## 1. プロダクト概要

- 領収書撮影 → Claude OCR →（任意で仕訳）→ Googleスプレッドシート同期
- Web: https://receipt.sumikko-app.com
- API: `https://receipt.sumikko-app.com/api`（Laravel Sanctum Bearer）
- Laravel 本番パス（共有情報）: `/var/www/html/accounting.maspis.com`
- Web用 GitHub: https://github.com/NaoyaOshima708/sumikko-app
- ログイン: Web は LINE Login。アプリはメールログインを先に実装
- 公式LINE友だち追加が必須。未追加・ブロック時は API `403` + `code: line_friend_required`

---

## 2. 技術方針の変遷（重要）

1. 当初: **Capacitor**（このリポジトリ）で Android Studio / エミュレータ開発  
2. 環境構築が重い・英語UI・Macなし等で方針変更  
3. 現在: **Monaca + Onsen UI（トランスパイルなし / JS）** に切り替え済み（ローカル）
4. Capacitor の `android/` `ios/` `src/` `capacitor.config.json` `vite.config.ts` は削除済み

**ユーザー意向:** Monaca を使う。Gitインポート不可プランのため zip / 個別ファイルアップロード。

---

## 3. いまのアプリ実装（Monaca / www）

### 構成

```
config.xml
package.json
.monaca/project_info.json
www/
  index.html          … ons-navigator のみ（page=boot.html）
  boot.html
  login.html
  friend.html
  home.html
  upload.html
  detail.html
  settings.html
  css/style.css
  js/api.js           … APIクライアント（XHR）
  js/app.js           … 画面制御
  lib/onsenui/        … Onsen UI 同梱（Monacaテンプレ側のlibでも可）
  cordova.js          … ローカル用スタブ
```

### 実装済み機能

- メールログイン / ログアウト
- LINE友だちゲート（友だち追加URLを開く・確認）
- 領収書一覧（当月）
- 詳細表示
- カメラ / ギャラリーアップロード（cordova-plugin-camera、ブラウザ時は file input）
- Claude APIキー設定

### 未実装

- アプリ LINE Login
- 仕訳UI
- Google Sheets 設定UI
- アイコン / スプラッシュ本番差し替え

### 画面遷移

`boot → login → (friend) → home → upload / detail / settings`

ログイン後 `line_friend === false` なら `friend.html`、true なら `home.html`。

---

## 4. 検証用アカウント

サーバー側で作成済み（APIログイン成功を PC から確認済み）:

| 項目 | 値 |
|--|--|
| email | `demo-app@sumikko-app.com` |
| password | `SumikkoDemo123!` |
| name | アプリ検証 |
| line_friend | **false**（ログイン成功後は友だちゲートへ行くのが正常） |

公開の会員登録 API（`/api/register` 等）は **404**。ユーザー作成は Laravel（tinker / DB）側のみ。

---

## 5. 現状のブロッカー（最重要）

### 症状

Monacaデバッガーでログインすると失敗する。

### コンソールで確認済み

```
login start
demo-app@sumikko-app.com
origin= monaca-debugger://6a743d96e788851d02b4284a.monaca.io
API通信失敗: Load failed / status=0（CORSまたは通信遮断）
origin=monaca-debugger://6a743d96e788851d02b4284a.monaca.io
api=https://receipt.sumikko-app.com/api
login failed
```

### 切り分け結果

| 確認 | 結果 |
|--|--|
| PC から `POST /api/login`（上記アカウント） | **成功 200**（token 返却） |
| `Origin: https://localhost` 等 | CORS 許可されるものあり |
| `Origin: monaca-debugger://....monaca.io` の OPTIONS | **204 だが `Access-Control-Allow-Origin` が空 = 拒否** |

結論: **サーバは生きている。Monacaデバッガーのカスタムスキーム origin が Laravel CORS で許可されていない。**

「Load failed」は Onsen の画面遷移失敗ではなく、**WebKit 系の XHR/fetch 通信失敗メッセージ**。

### 必要な修正（Laravel 側）

`config/cors.php`（または同等）に例えば:

```php
'allowed_origins_patterns' => [
    '#^monaca-debugger://#',
    '#^https?://.*\.monaca\.io$#',
    '#^https?://.*\.monaca\.mobi$#',
],
```

その後:

```bash
cd /var/www/html/accounting.maspis.com
php artisan config:clear
```

注意: `allowed_origins => ['*']` だけでは `monaca-debugger://` が通らないことがある。**patterns で明示が必要。**

### 代替（アプリ側）

`cordova-plugin-advanced-http` 等の **ネイティブ HTTP** に切り替えれば WebView CORS を回避できる場合がある。未実装。

---

## 6. Monaca 側の状態（ユーザー作業）

- プロジェクト名: すみっこ経理
- Cordova CLI: 12.0.0
- 有効プラグイン:
  - cordova-plugin-camera
  - cordova-plugin-inappbrowser
  - monaca-plugin-monaca-core
- Gitインポート不可プラン → ファイル個別アップロードで同期
- 推奨同期ファイル（CORS修正後の再テスト用）:
  - `www/index.html`
  - `www/*.html`（boot/login/friend/home/upload/detail/settings）
  - `www/js/api.js`
  - `www/js/app.js`
  - `www/css/style.css`

**正規の進め方（推奨）:**  
Monaca で「Onsen UI V2 JS Minimum」を新規作成し、`www` のアプリファイルだけ差し替える。  
手組みの `package.json` / `.monaca/` / `config.xml` は不完全な可能性がある。

---

## 7. ローカル確認

```bash
cd C:\work\sumikko-keiri-app\sumikko-keiri-app
npm start
# http://localhost:8080
```

ブラウザからは API に届く想定（CORS が localhost を許しているため）。  
Monacaデバッガーとは origin が違う。

---

## 8. 次にやること（優先順）

1. **Laravel CORS に `monaca-debugger://` を許可**（上記）→ デバッガーでログイン再試験  
2. 成功後、友だちゲート動作確認（demo は line_friend=false）  
3. 検証用に `line_friend=true` のユーザーを1人用意（または demo を更新）してホーム〜一覧〜撮影を確認  
4. 問題なければ Git commit / push（ユーザー許可後）  
5. 仕訳UI / Sheets設定 / LINE Login など未実装へ

---

## 9. やってはいけない／注意

- Capacitor / Android Studio ルートに戻すのはユーザー判断なしでしない
- 原因未確認のまま Monaca IDE やプランのせいにしない
- デモ用トークンをログやチャットに残さない（過去に PC から login 成功時に token が発行されている。必要なら server で revoke）
- このリポジトリから Laravel ユーザー作成はできない（register API なし、SSH なし）

---

## 10. 主要コードの位置

| 役割 | ファイル |
|--|--|
| API base / login / receipts | `www/js/api.js` |
| 画面 init / 遷移 / カメラ | `www/js/app.js` |
| Navigator 入口 | `www/index.html` |
| 各画面 | `www/login.html` 他 |
| Cordova 設定 | `config.xml` |
| プラグイン宣言 | `package.json` の `cordova.plugins` / `dependencies` |

`api.js` は通信失敗時に `origin=` と `api=` をエラー文言に出すようにしてある（デバッグ用）。

---

## 11. ユーザーへのコミュニケーション上の注意

- 日本語で簡潔に
- 未確認のことを断定しない
- 主導するなら手順を最後まで具体的に書く
- フォルダアップロード不可（Monacaはファイル単位）を前提にする
