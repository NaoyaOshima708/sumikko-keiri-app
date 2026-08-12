# すみっこ経理（Monaca + Onsen UI）

領収書撮影 → Claude OCR →（任意で仕訳）→ Googleスプレッドシート同期向けのモバイルアプリです。  
**Capacitor から Monaca（Cordova）+ Onsen UI に切り替えました。**

## まずこれ（どこに何を置くか）

**[WHERE_TO_DEPLOY.md](./WHERE_TO_DEPLOY.md)** を見てください。

- `www/` → **Monaca**
- `server-api/`（PHP） → **Laravel 本番サーバー**（Monaca には上げない）

---

## なぜこの構成か

- 日本語のドキュメント / IDE（Monaca）で進めやすい
- Android Studio をローカルで無理に通さなくても、クラウドビルドや Monacaデバッガーで確認できる
- iOS も Mac なしでクラウドビルドを見据えられる

## Onsen UI で押さえること（これだけ）

Onsen UI は「見た目の部品」ではなく、**画面の積み重ね方**が本体です。

| 用語 | 意味 | このアプリでの使い方 |
|--|--|--|
| `ons-page` | 1画面 | ログイン / 友だち / 履歴 / 詳細 / アップロード / 設定 |
| `template id="xxx.html"` | 画面のひな形 | `www/index.html` 内に定義 |
| `ons-navigator` | 画面スタック | `pushPage` で進む / `popPage`・戻るボタンで戻る / `resetToPage` で積み直し |
| `init` イベント | 画面が作られた直後 | ボタンの `onclick` を結線、データ読み込み |
| `ons.ready` | Cordova 準備完了待ち | カメラ等のネイティブAPI前に使う |

画面遷移のイメージ:

```
boot → login → (友だちゲート) → home
home → upload / detail / settings →（戻るで home）
```

実装の入口:

- `www/index.html` … 画面テンプレート
- `www/js/app.js` … 画面制御（Onsen UI）
- `www/js/api.js` … Laravel API（Sanctum Bearer）

## プロジェクト構成（Monaca: トランスパイル不要）

```
config.xml          … Cordova / アプリ設定
package.json        … プラグイン宣言など
.monaca/            … Monaca 用メタ情報
www/                … ★ここを編集する
  index.html
  css/style.css
  js/api.js
  js/app.js
  lib/onsenui/      … Onsen UI 本体
```

## 実装済み機能

- メールログイン / ログアウト
- LINE友だちゲート（友だち追加URLを開く・確認）
- 領収書一覧（当月）
- 詳細表示
- カメラ / ギャラリーアップロード（Cordova Camera。ブラウザ時はファイル選択）
- Claude APIキー設定

## まだの候補

- アプリの LINE Login
- 仕訳UI
- Google Sheets 設定UI
- アイコン / スプラッシュ本番差し替え

## ローカルでの見た目確認（ブラウザ）

```bash
npm start
```

ブラウザで `http://localhost:8080` を開く。  
カメラはファイル選択にフォールバックします。

## Monaca での進め方（本番ルート）

詳細は **`MONACA_SETUP.md`** を見ること。

1. [Monaca](https://monaca.mobi/) で Onsen UI プロジェクトを用意し `www` を差し替え
2. プラグインを有効化（**Advanced HTTP / File が必須**）
   - `cordova-plugin-file`
   - `cordova-plugin-advanced-http`
   - `cordova-plugin-camera`
   - `cordova-plugin-inappbrowser`
3. **Monacaデバッガー** で確認（`nativeHttp= true` が出ること）
4. 必要ならクラウドで Android / iOS デバッグビルド

※ デバッガー origin `monaca-debugger://` は CORS で XHR が落ちるため、Advanced HTTP 必須。

CLI を使う場合（要 Monaca アカウント）:

```bash
npm install -g monaca
monaca login
monaca remote build --platform=android --build-type=debug
```

## API

`https://receipt.sumikko-app.com/api`（Laravel Sanctum Bearer）

友だち未追加・ブロック時は API が `403 line_friend_required` を返す想定です。
