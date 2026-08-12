# どこに何を置くか（必読）

迷ったら **このファイルだけ** 見てください。

---

## 結論（これだけ）

| フォルダ / 拡張子 | 置く場所 | 誰が上げる |
|--|--|--|
| **`www/`**（html / css / js / img） | **Monaca** | あなた（ファイルアップロード） |
| **`server-api/`**（`.php`） | **Laravel 本番サーバー** | サーバー反映（SSH / デプロイ）。Monaca には上げない |
| `config.xml` / `package.json` / `.monaca/` | **Monaca** | プロジェクト設定として Monaca 側 |
| `HANDOFF.md` / `README.md` など `.md` | ドキュメントのみ | どこにも「アプリとして」上げない |

**覚え方**
- 画面・見た目・ボタン → `www/` → **Monaca**
- API（削除・CSV・ログイン等）の PHP → `server-api/` の控え → **サーバー実体**  
  `/var/www/html/accounting.maspis.com/`

---

## Monaca に上げるもの

ローカル:
`C:\work\sumikko-keiri-app\sumikko-keiri-app\www\`

例:
- `www/js/app.js`
- `www/js/api.js`
- `www/home.html`
- `www/detail.html`
- `www/csv-history.html`
- `www/css/style.css`

上げたあと: Monacaデバッガーを再読込。

---

## サーバー（PHP）に置くもの

控え（このリポジトリ）:
`C:\work\sumikko-keiri-app\sumikko-keiri-app\server-api\`

| 控え | 本番の実体 |
|--|--|
| `server-api/routes/api.php` | `/var/www/html/accounting.maspis.com/routes/api.php` |
| `server-api/app/Http/Controllers/Api/ReceiptController.php` | `/var/www/html/accounting.maspis.com/app/Http/Controllers/Api/ReceiptController.php` |

サーバー: `root@133.130.90.66`  
反映後: `php artisan route:clear`（必要なら `config:clear`）

**`server-api/` は Monaca にアップロードしない。**

---

## 今回の機能ごとの置き場所

| 機能 | Monaca (`www/`) | サーバー (PHP) |
|--|--|--|
| 月切替・履歴表示 | ○ | （既存 API） |
| 詳細の編集保存 | ○ | （既存 PATCH） |
| レシート削除 | ○（ボタン） | ○ `DELETE /api/receipts/{id}` |
| 月次 CSV 出力 | ○（ボタン・履歴UI） | ○ `GET /api/receipts/export.csv` |
| CSV履歴の保存 | ○（端末 localStorage） | × |
| 購入日時UI修正 | ○ | × |

片方だけ上げると「画面はあるのに動かない」「APIだけあるのに押せない」になります。

---

## チャットで指示するとき（担当者ルール）

今後、ファイル変更を伝えるときは必ず次の形にする:

1. **Monaca に上げるファイル**（`www/...`）
2. **サーバーに置く PHP**（ある場合だけ。本番パス付き）
3. **どちらでもない**（ドキュメントのみ）

このファイル（`WHERE_TO_DEPLOY.md`）が判断の正本です。
