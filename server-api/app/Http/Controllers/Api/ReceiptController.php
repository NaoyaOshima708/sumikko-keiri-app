<?php

/**
 * 本番配置先:
 *   /var/www/html/accounting.maspis.com/app/Http/Controllers/Api/ReceiptController.php
 *
 * ※ このファイルは Monaca アプリ本体ではない。
 *    Laravel API 側コントローラの控え（削除・CSV出力を追加した版）。
 */

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReceiptRequest;
use App\Http\Requests\UpdateReceiptRequest;
use App\Jobs\AnalyzeReceiptJob;
use App\Models\Receipt;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReceiptController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Receipt::class);

        $month = $request->has('month')
            ? $this->validMonth($request->query('month'))
            : now()->format('Y-m');
        $actor = $request->user();
        $visibleIds = $this->visibleUserIds($actor);

        $query = Receipt::with(['user:id,name', 'journalEntry:id,receipt_id,status'])
            ->whereIn('user_id', $visibleIds);

        $this->applyMonthFilter($query, $month);

        $receipts = $query->orderByDesc('created_at')->paginate(20);

        return response()->json([
            'month' => $month,
            'data' => $receipts->getCollection()->map(fn (Receipt $r) => $this->listItem($r))->values(),
            'meta' => [
                'current_page' => $receipts->currentPage(),
                'last_page' => $receipts->lastPage(),
                'per_page' => $receipts->perPage(),
                'total' => $receipts->total(),
            ],
        ]);
    }

    public function store(StoreReceiptRequest $request): JsonResponse
    {
        if (! $request->user()->claude_api_key) {
            return response()->json([
                'message' => '先にClaude APIキーを設定してください。',
                'code' => 'claude_api_key_required',
            ], 422);
        }

        $storedPaths = [];
        $accepted = 0;
        $skippedDuplicates = 0;
        $ids = [];

        try {
            DB::transaction(function () use ($request, &$storedPaths, &$accepted, &$skippedDuplicates, &$ids): void {
                foreach ($request->file('images') as $file) {
                    $hash = hash_file('sha256', $file->getRealPath());

                    if (config('receipts.dedup_enabled') && Receipt::query()
                        ->where('user_id', $request->user()->id)
                        ->where('content_hash', $hash)
                        ->exists()) {
                        $skippedDuplicates++;

                        continue;
                    }

                    $path = $file->storeAs(
                        'receipts/'.$request->user()->id,
                        Str::uuid().'.'.$file->extension(),
                        'local'
                    );

                    if (! $path) {
                        throw new \RuntimeException('画像を保存できませんでした。');
                    }

                    $storedPaths[] = $path;
                    $receipt = $request->user()->receipts()->create([
                        'image_path' => $path,
                        'source_image_path' => $path,
                        'original_filename' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(),
                        'file_size' => $file->getSize(),
                        'content_hash' => $hash,
                        'status' => 'pending',
                        'model' => $request->validated('model'),
                    ]);

                    AnalyzeReceiptJob::dispatch($receipt->id);
                    $accepted++;
                    $ids[] = $receipt->id;
                }
            });
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($storedPaths);
            throw $exception;
        }

        if ($accepted === 0) {
            return response()->json([
                'message' => $skippedDuplicates > 0
                    ? '選択した画像はすべて既にアップロード済みです。'
                    : 'アップロードできる画像がありませんでした。',
            ], 422);
        }

        return response()->json([
            'message' => "{$accepted}件を受け付けました。",
            'accepted' => $accepted,
            'skipped_duplicates' => $skippedDuplicates,
            'ids' => $ids,
        ], 201);
    }

    public function show(Receipt $receipt): JsonResponse
    {
        $this->authorize('view', $receipt);
        $receipt->load(['user:id,name', 'journalEntry.lines']);

        return response()->json(['data' => $this->detail($receipt)]);
    }

    public function update(UpdateReceiptRequest $request, Receipt $receipt): JsonResponse
    {
        $receipt->update($request->validated());

        return response()->json([
            'message' => '更新しました。',
            'data' => $this->detail($receipt->fresh(['user:id,name', 'journalEntry.lines'])),
        ]);
    }

    public function image(Receipt $receipt): BinaryFileResponse
    {
        $this->authorize('view', $receipt);
        abort_unless(Storage::disk('local')->exists($receipt->image_path), 404);

        return response()->file(Storage::disk('local')->path($receipt->image_path), [
            'Content-Type' => $receipt->mime_type,
            'Content-Disposition' => 'inline',
        ]);
    }

    public function retry(Receipt $receipt): JsonResponse
    {
        $this->authorize('update', $receipt);
        $queued = Receipt::query()
            ->whereKey($receipt->id)
            ->where('status', 'failed')
            ->update(['status' => 'pending', 'error_message' => null]);

        if ($queued === 1) {
            AnalyzeReceiptJob::dispatch($receipt->id);
        }

        return response()->json(['message' => '解析を受け付けました。', 'queued' => $queued === 1]);
    }

    public function destroy(Receipt $receipt): JsonResponse
    {
        $this->authorize('delete', $receipt);

        $candidatePaths = array_values(array_filter([
            $receipt->image_path,
            $receipt->source_image_path,
        ]));

        DB::transaction(function () use ($receipt): void {
            $receipt->delete();
        });

        if ($candidatePaths) {
            $stillUsed = Receipt::query()
                ->where(function ($query) use ($candidatePaths) {
                    $query->whereIn('image_path', $candidatePaths)
                        ->orWhereIn('source_image_path', $candidatePaths);
                })
                ->get(['image_path', 'source_image_path'])
                ->flatMap(fn (Receipt $row) => array_filter([$row->image_path, $row->source_image_path]))
                ->unique()
                ->all();

            Storage::disk('local')->delete(array_values(array_diff($candidatePaths, $stillUsed)));
        }

        return response()->json(['message' => 'レシートを削除しました。']);
    }

    public function export(Request $request): StreamedResponse
    {
        $this->authorize('viewAny', Receipt::class);

        $month = $request->has('month')
            ? $this->validMonth($request->query('month'))
            : now()->format('Y-m');
        $visibleIds = $this->visibleUserIds($request->user());

        $query = Receipt::query()
            ->with('user:id,name')
            ->whereIn('user_id', $visibleIds);
        $this->applyMonthFilter($query, $month);
        $query->orderByDesc('created_at');

        $filename = 'receipts_'.($month ?: 'all').'_'.now()->format('Ymd_His').'.csv';

        return response()->streamDownload(function () use ($query): void {
            $output = fopen('php://output', 'wb');
            if ($output === false) {
                throw new \RuntimeException('CSV出力を開始できませんでした。');
            }

            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['購入日時', '店舗名', '登録番号', '合計金額', '税額', '通貨', '支払方法', 'レシート番号', '登録者', '解析状態', '登録日時']);

            $statuses = [
                'pending' => '解析待ち',
                'processing' => '解析中',
                'completed' => '解析完了',
                'failed' => '解析失敗',
            ];

            foreach ($query->lazyById(500) as $receipt) {
                fputcsv($output, [
                    $receipt->purchased_at?->format('Y-m-d H:i:s'),
                    $this->csvText($receipt->merchant_name),
                    $this->csvText($receipt->registration_number),
                    $receipt->total_amount,
                    $receipt->tax_amount,
                    $this->csvText($receipt->currency),
                    $this->csvText($receipt->payment_method),
                    $this->csvText($receipt->receipt_number),
                    $this->csvText($receipt->user->name),
                    $this->csvText($statuses[$receipt->status] ?? $receipt->status),
                    $receipt->created_at->format('Y-m-d H:i:s'),
                ]);
            }

            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function csvText(mixed $value): string
    {
        $value = (string) ($value ?? '');

        return preg_match('/^[=+\-@\t\r]/u', $value) ? "'".$value : $value;
    }

    /**
     * @return array<string, mixed>
     */
    private function listItem(Receipt $receipt): array
    {
        return [
            'id' => $receipt->id,
            'merchant_name' => $receipt->merchant_name,
            'purchased_at' => $receipt->purchased_at?->toIso8601String(),
            'total_amount' => $receipt->total_amount,
            'currency' => $receipt->currency,
            'status' => $receipt->status,
            'journal_status' => $receipt->journalEntry?->status,
            'created_at' => $receipt->created_at?->toIso8601String(),
            'user_name' => $receipt->user?->name,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(Receipt $receipt): array
    {
        return [
            ...$this->listItem($receipt),
            'tax_amount' => $receipt->tax_amount,
            'registration_number' => $receipt->registration_number,
            'payment_method' => $receipt->payment_method,
            'receipt_number' => $receipt->receipt_number,
            'error_message' => $receipt->error_message,
            'model' => $receipt->model,
            'analysis_json' => $receipt->analysis_json,
            'image_url' => url('/api/receipts/'.$receipt->id.'/image'),
            'journal' => $receipt->journalEntry ? [
                'status' => $receipt->journalEntry->status,
                'lines' => $receipt->journalEntry->lines->map(fn ($line) => [
                    'side' => $line->side,
                    'account_name' => $line->account_name,
                    'subaccount_name' => $line->subaccount_name,
                    'amount' => $line->amount,
                    'tax_amount' => $line->tax_amount ?? null,
                    'description' => $line->description ?? null,
                ])->values(),
            ] : null,
        ];
    }

    private function validMonth(mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}$/', $value)) {
            return null;
        }

        try {
            $date = Carbon::createFromFormat('!Y-m', $value);
        } catch (\Throwable) {
            return null;
        }

        return $date && $date->format('Y-m') === $value ? $value : null;
    }

    private function visibleUserIds(User $actor)
    {
        return $actor->is_admin
            ? User::query()->pluck('id')
            : collect([$actor->id])->merge($actor->parent_id === null ? $actor->children()->pluck('id') : []);
    }

    private function applyMonthFilter(Builder $query, ?string $month): void
    {
        if (! $month) {
            return;
        }

        $dateExpression = config('database.default') === 'sqlite'
            ? "strftime('%%Y-%%m', %s) = ?"
            : "DATE_FORMAT(%s, '%%Y-%%m') = ?";
        $query->where(fn ($q) => $q
            ->whereRaw(sprintf($dateExpression, 'purchased_at'), [$month])
            ->orWhere(fn ($fallback) => $fallback
                ->whereNull('purchased_at')
                ->whereRaw(sprintf($dateExpression, 'created_at'), [$month])));
    }
}
