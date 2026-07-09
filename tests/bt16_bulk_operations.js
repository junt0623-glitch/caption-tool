// bt16: 作品台帳の一括操作（複数選択・一括画像登録／削除）
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt16 台帳の一括操作');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);

    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 3) {
        const w = JSON.parse(JSON.stringify(p.works[0]));
        w.title = w.title + '_copy';
        p.works.push(w);
      }
      renderList();
    });
    await page.waitForTimeout(200);

    // 「表示中をすべて選択」チェックボックス
    await page.click('#bulkAll');
    await page.waitForTimeout(200);
    const bulkVisible = await page.locator('#bulkBar').isVisible();
    t.ok(bulkVisible, '選択するとバルク操作バーが表示される');
    const selCount = await page.evaluate(() => bulkSel.size);
    t.ok(selCount >= 3, '全選択で複数件が選択状態になる');

    // 一括画像登録
    await page.click('#bulkSetImage');
    await page.setInputFiles('#bulkImageInput', FIXTURE);
    await page.waitForTimeout(300);
    const allHaveImg = await page.evaluate(() => proj().works.every(w => !!w.image));
    t.eq(allHaveImg, true, '一括画像登録で選択した全作品に画像が付く');

    // 一括画像削除
    await page.click('#bulkClearImage');
    await page.waitForTimeout(200);
    const confirmVisible = await page.locator('#confirmDialog').isVisible().catch(() => false);
    if (confirmVisible) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    const noneHaveImg = await page.evaluate(() => proj().works.every(w => !w.image));
    t.eq(noneHaveImg, true, '一括画像削除で選択した全作品から画像が外れる');

    // 選択解除
    await page.click('#bulkDeselect');
    await page.waitForTimeout(200);
    const afterDeselect = await page.evaluate(() => bulkSel.size);
    t.eq(afterDeselect, 0, '選択を解除ボタンで選択状態がクリアされる');
    t.ok(!(await page.locator('#bulkBar').isVisible()), '選択解除後はバルク操作バーが非表示になる');

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
