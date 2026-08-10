# Monaca で動かす手順（必須）

Monacaデバッガーの origin は `monaca-debugger://...` のため、通常の XHR/fetch は Laravel CORS で落ちます。  
**ネイティブHTTPプラグイン**で回避します。

## 1. プラグインを有効化（これがないとログインできない）

MonacaクラウドIDE → **設定 → Cordovaプラグイン** で次を有効 / インポート:

| プラグイン | npm名 |
|--|--|
| File | `cordova-plugin-file` |
| Advanced HTTP | `cordova-plugin-advanced-http` |
| Camera | `cordova-plugin-camera`（済ならそのまま） |
| InAppBrowser | `cordova-plugin-inappbrowser`（済ならそのまま） |

インポートできない場合: 「Cordovaプラグインのインポート」→ npm 名を入力。

## 2. アプリファイルを上書きアップロード

`/www` 宛て:

- `js/api.js`（必須）
- `js/app.js`（必須）
- 他の html / css は前回どおりでOK

## 3. 確認

1. Monacaデバッガーで再読込  
2. Console に `ons.ready nativeHttp= true` が出ること  
   - `false` ならプラグイン未反映（手順1をやり直す）  
3. ログイン: `demo-app@sumikko-app.com` / `SumikkoDemo123!`  
4. 成功すると「友だち追加が必要」画面へ（demo は line_friend=false）

## ローカルの最新コード

`C:\work\sumikko-keiri-app\sumikko-keiri-app\www\`  
GitHub: https://github.com/NaoyaOshima708/sumikko-keiri-app
