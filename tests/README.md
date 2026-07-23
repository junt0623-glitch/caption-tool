# テストスイートについて

「展覧会キャプション工房」（単一ファイル `index.html`）の回帰テスト一式です。
Playwright でブラウザを実際に起動し、`index.html` をローカルファイルとして開いて操作・検証します。サーバーは不要です。

## セットアップ（初回のみ）

```bash
npm install
npx playwright install chromium
```

## 全テストを一括実行

```bash
npm test
```

または直接:

```bash
node tests/run-all.js
```

`tests/` 配下の `bt*.js` を番号順にすべて実行し、最後に合計の合否件数を表示します。

## 1本だけ実行

```bash
node tests/bt05_layout_override_diff.js
```

失敗すると `✗ FAIL: ...` の行が出力され、exit code が 1 になります（CI 等での判定に利用可）。

## テストファイル一覧

| ファイル | 内容 |
|---|---|
| bt01_load_defaults.js | 起動直後の既定状態（タブ・モード・ズーム・《》既定値） |
| bt02_project_management.js | 展覧会の新規作成・名称変更・削除 |
| bt03_work_crud.js | 作品の追加・編集・削除・検索フィルタ |
| bt04_mode_switch_lock.js | マスター編集／個別編集の切替と体裁ロック |
| bt05_layout_override_diff.js | 作品ごとの配置上書き（差分方式：触れた項目だけ独自化） |
| bt06_drag_align.js | 項目のドラッグ移動・選択・整列 |
| bt07_image_import.js | 画像の取り込み（個別／マスター一括）・削除 |
| bt08_master_image_sample.js | マスター編集モードでの画像見本プレビュー |
| bt09_image_wheel_zoom.js | 画像上でのマウスホイールによる拡大縮小 |
| bt10_image_drag_handle.js | 画像のドラッグハンドルによる拡縮・位置移動 |
| bt11_preview_zoom.js | 編集プレビューのズーム（実寸100%既定・拡大縮小・画面に収める） |
| bt12_bracket_default.js | 作品名の《》既定値（新規はOFF・既存データは維持） |
| bt13_backup_badge.js | JSONバックアップ推奨バッジ（配置上書き多用時の注意喚起） |
| bt14_undo_redo.js | 元に戻す／やり直す |
| bt15_json_export_import.js | JSON書き出し・読み込み |
| bt16_bulk_operations.js | 台帳の一括選択・一括画像登録／削除 |
| bt17_print_and_inline_edit.js | 印刷タブの描画・キャンバス上でのインラインテキスト編集 |
| bt28_extra_images_online_fonts.js | オンラインフォント拡充・選択時の即時読み込み反映／追加画像の複数貼り付け（Ctrl+V・ファイル）・移動・拡縮・削除・他作品への同位置一括コピー |
| bt29_renumber_on_move.js | 台帳の▲▼並び替えで番号が行の位置に合わせて自動で振り直されること（空番号・Undo含む） |
| bt30_csv_export.js | 作品リストのCSV書き出し（BOM・エスケープ）・表コピー（TSV）・書き出し→再取り込みの往復 |
| bt31_dialog_draggable.js | 「作品の編集」等のダイアログをタイトルバーのドラッグで移動できること（閉じるボタンとの誤認防止・再オープン時に中央へ復帰・画面中央への初期表示・タッチ操作での最後までのドラッグ） |
| bt32_item_panel_draggable.js | 編集キャンバスの項目クリックで開く書式の小パネルをヘッダーのドラッグで移動できること（閉じる✕との誤認防止・再オープン時に右上へ復帰・書式変更で再描画されても位置維持・タッチ操作でのドラッグ） |
| bt33_added_system_fonts.js | 追加システムフォント（UDデジタル教科書体 標準／太字・MS UI Gothic）の登録・選択肢表示・Win11 24H2統合名(UD デジタル 教科書体 NP)を最優先＋font-weightで太さ指定・旧-R/-B名の後方互換・書体名の監査（実在フォント名） |
| bt34_transparent_png.js | 透過PNGを取り込んでも透明部分が黒くならない（アルファ有→PNG保存・透過保持／アルファ無→JPEG圧縮） |
| bt35_export_filename.js | 書き出しファイル名（JSON・CSV）に展覧会名＋日付が自動で入ること（名称変更の追随・禁止文字の置換・空名時の補完） |
| bt36_print_actual_size.js | 印刷ボタンで原寸印刷の案内→プリンター詳細設定（印刷ダイアログ）へ進む流れ・原寸@page設定・キャンセル・「次回から表示しない」の保存と直接印刷 |

## 新機能を追加した時のテスト追加手順

1. `tests/helpers.js` の `openApp()` / `mkRunner()` を使い、`btNN_機能名.js` という名前で新規ファイルを作成する
2. 末尾に以下を必ず入れる（単体実行と run-all 両対応のため）:
   ```js
   module.exports = { run };
   if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
   ```
3. `node tests/btNN_機能名.js` で単体実行して確認
4. `npm test` で全体に影響が無いか確認してからコミットする

## 注意点（ハマりどころ）

- `confirm()` や `alert()` のうち、**ブラウザ標準のダイアログ**は `page.once('dialog', d => d.accept())` 等で処理する
- 一方、本アプリの「削除」や「マスター一括登録」などの確認は **独自実装のダイアログ**（`#confirmDialog` / `#confirmOk`）なので、`page.click('#confirmOk')` で閉じる必要がある（ネイティブdialogイベントは発火しない）
- 各テストは `browser.newContext()` で毎回まっさらな `localStorage` から始まる（テスト間の状態汚染を防ぐため）
