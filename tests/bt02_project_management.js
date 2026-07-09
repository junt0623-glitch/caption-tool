// bt02: 展覧会プロジェクトの新規作成・名称変更・削除
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt02 展覧会プロジェクト管理');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);

    const initialCount = await page.locator('#projectSelect option').count();

    // 新規作成（prompt が出るのでダイアログハンドラで自動入力）
    page.once('dialog', d => d.accept('テスト展覧会A'));
    await page.click('#btnNewProject');
    await page.waitForTimeout(300);
    const afterNewCount = await page.locator('#projectSelect option').count();
    t.eq(afterNewCount, initialCount + 1, '新規展覧会が1件追加される');

    const selectedName = await page.locator('#projectSelect option:checked').textContent();
    t.eq(selectedName, 'テスト展覧会A', '新規作成した展覧会が選択状態になる');

    // 名称変更
    page.once('dialog', d => d.accept('テスト展覧会A改'));
    await page.click('#btnRenameProject');
    await page.waitForTimeout(300);
    const renamed = await page.locator('#projectSelect option:checked').textContent();
    t.eq(renamed, 'テスト展覧会A改', '名称変更が反映される');

    // 削除（カスタムconfirmダイアログ #confirmDialog / #confirmOk を使用）
    await page.click('#btnDeleteProject');
    await page.waitForTimeout(200);
    await page.click('#confirmOk');
    await page.waitForTimeout(300);
    const afterDeleteCount = await page.locator('#projectSelect option').count();
    t.eq(afterDeleteCount, initialCount, '削除で件数が元に戻る');

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
