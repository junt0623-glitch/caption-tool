// bt06: 項目のドラッグ移動・選択・整列
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt06 ドラッグ移動と整列');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // マスター編集中はドラッグ移動できる
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(curLayoutRead().title)));
    const box = await page.locator('#editHolder [data-item="title"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.parse(JSON.stringify(curLayoutRead().title)));
    t.ok(before.x !== after.x || before.y !== after.y, 'マスター編集中は項目をドラッグ移動できる');

    // クリックで選択される
    await page.click('#editHolder [data-item="title"]');
    await page.waitForTimeout(100);
    const selInfo = await page.textContent('#selInfo');
    t.ok(selInfo && selInfo !== '項目をクリックで選択（ドラッグで移動）', '項目クリックで選択状態になる（selInfoが更新される）');

    // 整列バーで左揃え
    await page.evaluate(() => { proj().style.layout.title.x = 25; save(); renderEditor(); });
    await page.waitForTimeout(100);
    await page.click('#editHolder [data-item="title"]');
    await page.waitForTimeout(100);
    await page.click('.ab[data-align="left"]');
    await page.waitForTimeout(200);
    const xAfterAlign = await page.evaluate(() => curLayoutRead().title.x);
    t.ok(xAfterAlign < 25, '左揃えボタンでx座標が左端付近に寄る');

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
