# server-api（Laravel API の控え）

**このフォルダは Monaca に上げない。**  
置き場所の正本はリポジトリ直下の [WHERE_TO_DEPLOY.md](../WHERE_TO_DEPLOY.md)。

---

Monaca アプリ（`www/`）とは別物です。  
削除・CSV出力のために **本番サーバーへ反映する PHP** の控えです。

## 本番の実体

サーバー: `root@133.130.90.66`  
Laravel ルート: `/var/www/html/accounting.maspis.com`

| 控え（このフォルダ） | 本番パス |
|--|--|
| `routes/api.php` | `/var/www/html/accounting.maspis.com/routes/api.php` |
| `app/Http/Controllers/Api/ReceiptController.php` | `/var/www/html/accounting.maspis.com/app/Http/Controllers/Api/ReceiptController.php` |

## 追加した API

- `DELETE /api/receipts/{id}` … レシート削除
- `GET /api/receipts/export.csv?month=YYYY-MM` … 月次CSV

## 注意

- GitHub の `sumikko-app`（Web）公開ブランチには `routes/api.php` / `Api\` が無いことがあります（本番だけにある構成）。
- Monaca にアップロードするのは `www/` だけ。`server-api/` は上げない。
- 本番反映後は `php artisan route:clear` を実行する。
