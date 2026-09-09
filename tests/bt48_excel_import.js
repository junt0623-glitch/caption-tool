// bt48【新機能】作品リストをExcelファイル（.xlsx）・CSV/TSVファイルからも取り込めるようにする
const { openApp, mkRunner, chromium } = require('./helpers');
const { buildXlsx } = require('./xlsxfix');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'capxlsx-'));
const write = (name, buf) => { const p = path.join(TMP, name); fs.writeFileSync(p, buf); return p; };

async function run() {
  const t = mkRunner('bt48 Excelファイルからの取り込み');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });
    // 取り込みダイアログを開き直す（開いたままだとボタンを覆ってクリックできないため一度閉じる）
    const openImport = async () => {
      await page.evaluate(() => { const d = document.getElementById('importDialog'); if (d.open) d.close(); });
      await page.click('#btnOpenImport');
      await page.waitForTimeout(200);
    };

    // 実物と同じ構造のブック（共有文字列・インライン文字列・数値・日付書式・複数シート）
    const xlsx = write('works.xlsx', buildXlsx([
      {
        name: '作品リスト', rows: [
          ['番号', '作品名', '産地（作者）', '時代', '所蔵'],
          [{ v: 1, t: 'n' }, '灰陶緑斑双耳壺', 'ベトナム北部', { v: 45292, t: 'd' }, '穴吹允氏寄贈'],
          ['2', { v: '褐釉四耳壺', t: 'inline' }, '越前', '漢代並行期', '館蔵'],
          ['3', '緑釉博山炉', '中国', '前漢', '個人蔵']
        ]
      },
      { name: 'メモ', rows: [['作品名'], ['別シートの作品']] }
    ]));

    await openImport();

    // ---- ダイアログにファイル選択がある ----
    const ui = await page.evaluate(() => {
      const f = document.getElementById('importFile');
      return f ? { accept: f.accept, dlgOpen: document.getElementById('importDialog').open } : null;
    });
    t.ok(ui && ui.dlgOpen, '取り込みダイアログが開く');
    t.ok(ui && ui.accept.includes('.xlsx'), `ファイル選択が.xlsxを受け付ける（${ui && ui.accept}）`);
    t.ok(ui && ui.accept.includes('.csv'), 'CSVファイルも受け付ける');

    // ---- .xlsx を読み込むと行が取り出され、列が自動割り当てされる ----
    await page.setInputFiles('#importFile', xlsx);
    await page.waitForTimeout(600);
    const loaded = await page.evaluate(() => ({
      rows: impRows.length,
      first: impRows[0],
      second: impRows[1],
      third: impRows[2],
      map: impMap.slice(),
      status: document.getElementById('fileStatus').textContent,
      count: document.getElementById('impCount').textContent,
      sheetPickerShown: document.getElementById('importSheetWrap').style.display !== 'none',
      sheets: [...document.querySelectorAll('#importSheet option')].map(o => o.textContent)
    }));
    t.eq(loaded.rows, 4, 'Excelの見出し1行＋3件を読み込む');
    t.eq(loaded.first, ['番号', '作品名', '産地（作者）', '時代', '所蔵'], '見出し行が読める（共有文字列）');
    t.eq(loaded.second[0], '1', '数値のセルが読める');
    t.eq(loaded.second[1], '灰陶緑斑双耳壺', '日本語の共有文字列が読める');
    t.eq(loaded.second[3], '2024/01/01', '日付書式のセルが連番でなく日付として読める');
    t.eq(loaded.third[1], '褐釉四耳壺', 'インライン文字列のセルが読める');
    t.eq(loaded.map, ['no', 'title', 'origin', 'period', 'collection'], '見出しから取り込み先の列が自動判定される');
    t.eq(loaded.count, '3件の作品を取り込みます', '取り込み件数が出る');
    t.ok(loaded.status.includes('作品リスト'), `読み込んだシート名が案内に出る（${loaded.status}）`);
    t.eq(loaded.sheetPickerShown, true, '複数シートのときはシートの選択が出る');
    t.eq(loaded.sheets, ['作品リスト', 'メモ'], 'シート名が一覧に並ぶ');

    // ---- 実際に取り込める ----
    page.once('dialog', d => d.accept());
    await page.click('#btnImportAppend');
    await page.waitForTimeout(500);
    const imported = await page.evaluate(() => proj().works.slice(-3).map(w => [w.no, w.title, w.origin, w.period, w.collection]));
    t.eq(imported[0], ['1', '灰陶緑斑双耳壺', 'ベトナム北部', '2024/01/01', '穴吹允氏寄贈'], 'Excelの1件目が作品として取り込まれる');
    t.eq(imported[1], ['2', '褐釉四耳壺', '越前', '漢代並行期', '館蔵'], '2件目が取り込まれる');
    t.eq(imported[2], ['3', '緑釉博山炉', '中国', '前漢', '個人蔵'], '3件目が取り込まれる');

    // ---- シートを切り替えられる ----
    await openImport();
    await page.setInputFiles('#importFile', xlsx);
    await page.waitForTimeout(600);
    await page.selectOption('#importSheet', { label: 'メモ' });
    await page.waitForTimeout(400);
    const sheet2 = await page.evaluate(() => ({ rows: impRows.length, first: impRows[0], status: document.getElementById('fileStatus').textContent }));
    t.eq(sheet2.rows, 2, '別のシートに切り替えるとそのシートの行が読まれる');
    t.eq(sheet2.first, ['作品名'], '切り替えたシートの中身が入る');
    t.ok(sheet2.status.includes('メモ'), '案内も切り替えたシート名になる');

    // ---- CSVファイル（UTF-8 BOM付き。書き出したものを開き直す想定）----
    const csv = write('works.csv', Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('番号,作品名,時代\n7,白磁碗,宋代\n8,"青磁, 鎬蓮弁文",南宋\n', 'utf8')
    ]));
    await openImport();
    await page.setInputFiles('#importFile', csv);
    await page.waitForTimeout(500);
    const csvLoaded = await page.evaluate(() => ({ rows: impRows.length, second: impRows[2], map: impMap.slice() }));
    t.eq(csvLoaded.rows, 3, 'CSVファイルの見出し1行＋2件を読み込む');
    t.eq(csvLoaded.second, ['8', '青磁, 鎬蓮弁文', '南宋'], '引用符で囲まれたカンマ入りのセルが1つの値として読める');
    t.eq(csvLoaded.map, ['no', 'title', 'period'], 'CSVでも列が自動判定される');

    // ---- Shift_JISのCSV（Excelの「CSV（カンマ区切り）」で保存した場合）----
    // Shift_JISの「番号,作品名\n9,鉄瓶\n」（Nodeに変換器が無いのでバイト列で置く）
    const sjis = write('works-sjis.csv', Buffer.from([
      0x94, 0xd4, 0x8d, 0x86, 0x2c, 0x8d, 0xec, 0x95, 0x69, 0x96, 0xbc, 0x0a,
      0x39, 0x2c, 0x93, 0x53, 0x95, 0x72, 0x0a
    ]));
    await openImport();
    await page.setInputFiles('#importFile', sjis);
    await page.waitForTimeout(500);
    const sj = await page.evaluate(() => ({ rows: impRows.slice(), map: impMap.slice() }));
    t.eq(sj.rows[0], ['番号', '作品名'], 'Shift_JISのCSVが文字化けせずに読める');
    t.eq(sj.rows[1], ['9', '鉄瓶'], 'Shift_JISの本文も読める');

    // ---- 貼り付け欄に手入力するとファイルの内容より優先される ----
    await page.evaluate(() => {
      const ta = document.getElementById('importText');
      ta.value = '番号\t作品名\n11\t手入力の壺';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const pasted = await page.evaluate(() => ({ rows: impRows.length, second: impRows[1] }));
    t.eq(pasted.rows, 2, '貼り付けに切り替えるとその内容が使われる');
    t.eq(pasted.second, ['11', '手入力の壺'], '貼り付けた行が取り込み対象になる');

    // ---- 壊れたファイルは案内を出して落ちない ----
    const broken = write('broken.xlsx', Buffer.from('これはExcelではありません'));
    await openImport();
    await page.setInputFiles('#importFile', broken);
    await page.waitForTimeout(500);
    const brokenMsg = await page.evaluate(() => document.getElementById('fileStatus').textContent);
    t.ok(brokenMsg.includes('読み込めませんでした'), `壊れたファイルは案内が出る（${brokenMsg}）`);

    // ---- 旧形式(.xls)は保存し直すよう案内する ----
    const oldXls = write('old.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    await page.setInputFiles('#importFile', oldXls);
    await page.waitForTimeout(400);
    const xlsMsg = await page.evaluate(() => document.getElementById('fileStatus').textContent);
    t.ok(xlsMsg.includes('.xlsx'), `古い.xlsは保存し直すよう案内する（${xlsMsg}）`);

    // ---- 書き出し→取り込みの往復（CSVで書き出した内容がそのまま戻る）----
    const roundTrip = await page.evaluate(() => {
      const p = proj();
      p.works = [];
      const w = newWork(); w.no = '21'; w.title = '青花双耳瓶'; w.origin = '景徳鎮';
      w.period = '明代'; w.collection = '館蔵'; w.description = '改行を\n含む解説';
      p.works.push(w); save();
      return worksToDelimited(',');
    });
    const rt = write('roundtrip.csv', Buffer.from('﻿' + roundTrip, 'utf8'));
    await openImport();
    await page.setInputFiles('#importFile', rt);
    await page.waitForTimeout(500);
    page.once('dialog', d => d.accept());
    await page.click('#btnImportReplace');
    await page.waitForTimeout(300);
    page.once('dialog', d => d.accept());
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => {
      const w = proj().works[0];
      return w ? [w.no, w.title, w.origin, w.period, w.collection, w.description] : null;
    });
    t.eq(back, ['21', '青花双耳瓶', '景徳鎮', '明代', '館蔵', '改行を\n含む解説'],
      '書き出したCSVをファイルから読み戻すと、セル内改行まで元どおりになる');

    t.noErrors(errors);
    const r = t.finish();
    await browser.close();
    fs.rmSync(TMP, { recursive: true, force: true });
    return r;
  } catch (e) {
    console.log('  ✗ EXCEPTION: ' + e.message);
    await browser.close();
    t.ok(false, '例外: ' + e.message);
    return t.finish();
  }
}
module.exports = { run };
if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
