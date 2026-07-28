# すみっこ経理（Capacitor）

無料のオープンソース枠組み [Capacitor](https://capacitorjs.com/) で作るモバイルアプリです。  
クラウドビルド（Ionic Appflow 等）は別途有料ですが、**Capacitor 自体の利用料は不要**です。

## 場所

`/var/www/html/sumikko-keiri-app`

## ローカル（あなたのPC）でビルドする

必要なもの:

- Node.js 20+
- Android: Android Studio
- iOS: Mac + Xcode

```bash
cd sumikko-keiri-app
npm install
npm run sync
npm run open:android   # または open:ios
```

実機/エミュレータで起動してください。

## 開発中のブラウザ確認

```bash
npm start
```

ブラウザではカメラの代わりにファイル選択になります。

## API

`https://receipt.sumikko-app.com/api`（Sanctum）

## いまの画面

- メールログイン
- LINE友だちゲート
- 領収書一覧 / 撮影アップロード / 詳細
- Claude APIキー設定

## 次

- LINE Login
- Google Sheets 設定画面
