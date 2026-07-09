// bt15: JSON書き出し・読み込み
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt15 JSON書き出し・読み込み');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);
    page.on('dialog', d => d.accept()); // 読み込み完了時のalert対応

    // 書き出し内容の検証（ダウンロードイベントから実データを読む）
    const downloadPromise = page.waitForEvent('download');
    await page.click('#btnExport');
    const download = await downloadPromise;
    const streamPath = await download.path();
    const fs = require('fs');
    const content = JSON.parse(fs.readFileSync(streamPath, 'utf-8'));
    t.eq(content.app, 'caption-koubou', '書き出しJSONのappフィールドが正しい');
    t.ok(Array.isArray(content.projects) && content.projects.length >= 1, '書き出しJSONにprojectsが含まれる');

    // 読み込み（追加）：同じ内容を読み込んで件数が増えることを確認
    const beforeCount = await page.evaluate(() => store.projects.length);
    await page.click('#btnImportJson');
    await page.setInputFiles('#jsonFileInput', streamPath);
    await page.waitForTimeout(300);
    // alertが出るので閉じる（page.on dialogでハンドリング）
    const afterCount = await page.evaluate(() => store.projects.length);
    t.eq(afterCount, beforeCount + content.projects.length, '読み込みで展覧会が追加される（既存データに追加方式）');

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
