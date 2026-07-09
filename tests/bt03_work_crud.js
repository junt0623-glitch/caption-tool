// bt03: 作品台帳での作品の追加・編集・削除・検索
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt03 作品台帳CRUD');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);

    const before = await page.evaluate(() => proj().works.length);

    // 追加
    await page.click('#btnAddWork');
    await page.waitForTimeout(200);
    await page.fill('#f_title', 'テスト作品タイトル');
    await page.fill('#f_no', '99');
    await page.click('#btnSaveWork');
    await page.waitForTimeout(200);
    const afterAdd = await page.evaluate(() => proj().works.length);
    t.eq(afterAdd, before + 1, '作品追加で件数が1件増える');

    const added = await page.evaluate(() => proj().works[proj().works.length - 1]);
    t.eq(added.title, 'テスト作品タイトル', '追加した作品のタイトルが保存される');

    // 編集（一覧から該当行をクリックして開く想定なので、直接インデックスで開いて確認）
    await page.evaluate(() => openWorkDialog(proj().works.length - 1));
    await page.waitForTimeout(200);
    await page.fill('#f_title', 'テスト作品タイトル改');
    await page.click('#btnSaveWork');
    await page.waitForTimeout(200);
    const edited = await page.evaluate(() => proj().works[proj().works.length - 1].title);
    t.eq(edited, 'テスト作品タイトル改', '編集内容が保存される');

    // 検索フィルタ
    await page.fill('#searchBox', 'テスト作品タイトル改');
    await page.waitForTimeout(200);
    const filteredRows = await page.locator('#worksListArea tr, #worksListArea .work-row').count();
    t.ok(filteredRows >= 1, '検索フィルタで該当作品が絞り込まれる');
    await page.fill('#searchBox', '');
    await page.waitForTimeout(200);

    // 削除
    await page.evaluate(() => openWorkDialog(proj().works.length - 1));
    await page.waitForTimeout(200);
    await page.click('#btnDeleteWork');
    await page.waitForTimeout(200);
    // 削除確認はカスタムconfirmダイアログ
    const confirmVisible = await page.locator('#confirmDialog').isVisible().catch(() => false);
    if (confirmVisible) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    const afterDelete = await page.evaluate(() => proj().works.length);
    t.eq(afterDelete, before, '削除で元の件数に戻る');

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
