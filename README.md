# すみっこ経理（Capacitor）

無料のオープンソース枠組み [Capacitor](https://capacitorjs.com/) で作るモバイルアプリです。  
クラウドビルド（Ionic Appflow 等）は別途有料ですが、**Capacitor 自体の利用料は不要**です。

## リポジトリ

https://github.com/NaoyaOshima708/sumikko-keiri-app

```bash
git clone https://github.com/NaoyaOshima708/sumikko-keiri-app.git
cd sumikko-keiri-app
npm install
npm run sync
npm run open:android
```

## ビルドに必要なもの

- Node.js 20+
- Android: Android Studio（Windows可）
- iOS: Mac + Xcode（後回し可）

コード変更後は毎回:

```bash
npm run sync
```

## ブラウザ確認

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
