<?php

/**
 * 本番配置先:
 *   /var/www/html/accounting.maspis.com/routes/api.php
 *
 * ※ このファイルは Monaca アプリ本体ではない。
 *    Laravel（すみっこ経理 Web/API）側のルート定義の控え。
 */

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LineController;
use App\Http\Controllers\Api\ReceiptController;
use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->name('api.login');
Route::post('/line/login', [LineController::class, 'login'])->name('api.line.login');

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::get('/me', [AuthController::class, 'me'])->name('api.me');
    Route::post('/logout', [AuthController::class, 'logout'])->name('api.logout');

    Route::get('/line/status', [LineController::class, 'status'])->name('api.line.status');

    Route::middleware('line.friend')->group(function () {
        Route::get('/receipts', [ReceiptController::class, 'index'])->name('api.receipts.index');
        Route::post('/receipts', [ReceiptController::class, 'store'])->name('api.receipts.store');
        // static paths before {receipt}
        Route::get('/receipts/export.csv', [ReceiptController::class, 'export'])->name('api.receipts.export');
        Route::get('/receipts/{receipt}', [ReceiptController::class, 'show'])->name('api.receipts.show');
        Route::patch('/receipts/{receipt}', [ReceiptController::class, 'update'])->name('api.receipts.update');
        Route::delete('/receipts/{receipt}', [ReceiptController::class, 'destroy'])->name('api.receipts.destroy');
        Route::get('/receipts/{receipt}/image', [ReceiptController::class, 'image'])->name('api.receipts.image');
        Route::post('/receipts/{receipt}/retry', [ReceiptController::class, 'retry'])->name('api.receipts.retry');

        Route::get('/settings', [SettingsController::class, 'show'])->name('api.settings.show');
        Route::put('/settings/api-key', [SettingsController::class, 'updateApiKey'])->name('api.settings.api-key');
        Route::put('/settings/bookkeeping', [SettingsController::class, 'updateBookkeeping'])->name('api.settings.bookkeeping');
    });
});
