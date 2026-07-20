// bt35【新機能】書き出しファイル名に展覧会名が自動で入る（JSON・CSV）
// file://ではブラウザが提示するダウンロード名を検証できないため、
// ページ内のdownload関数を差し替えてファイル名を捕捉して確認する。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt35 書き出しファイル名');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser);

    // download関数を横取りしてファイル名だけ記録する
    await page.evaluate(() => {
      window.__names = [];
      window.download = (filename) => { window.__names.push(filename); };
    });

    // ---- JSON書き出し：展覧会名＋日付が入る ----
    await page.click('#btnExport');
    await page.waitForTimeout(200);
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const jsonName = await page.evaluate(() => window.__names[0]);
    t.eq(jsonName, `キャプション工房_見本の展覧会_${ymd}.json`, 'JSON書き出し名に展覧会名と日付が自動で入る');

    // ---- CSV書き出し：従来どおり展覧会名＋日付 ----
    await page.click('#btnExportCsv');
    await page.waitForTimeout(200);
    const csvName = await page.evaluate(() => window.__names[1]);
    t.eq(csvName, `作品リスト_見本の展覧会_${ymd}.csv`, 'CSV書き出し名にも展覧会名と日付が入る');

    // ---- 展覧会名を変えるとファイル名も追随する／ファイル名に使えない文字は置換される ----
    await page.evaluate(() => {
      proj().name = '秋の特別展：花鳥風月/2026';
      save(); renderProjectSelect();
    });
    await page.click('#btnExport');
    await page.waitForTimeout(200);
    const renamed = await page.evaluate(() => window.__names[2]);
    t.eq(renamed, `キャプション工房_秋の特別展：花鳥風月_2026_${ymd}.json`,
      '展覧会名の変更がファイル名に反映され、/など使えない文字は_に置換される');

    // ---- 展覧会名が空でもファイル名が壊れない ----
    await page.evaluate(() => { proj().name = ''; });
    await page.click('#btnExport');
    await page.waitForTimeout(200);
    const noname = await page.evaluate(() => window.__names[3]);
    t.eq(noname, `キャプション工房_無題_${ymd}.json`, '展覧会名が空のときは「無題」で補われる');

    t.noErrors(errors);
    const r = t.finish();
    await browser.close();
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
