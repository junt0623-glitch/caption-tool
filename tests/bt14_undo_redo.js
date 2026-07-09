// bt14: 元に戻す（Undo）／やり直す（Redo）
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt14 Undo/Redo');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    const originalX = await page.evaluate(() => proj().style.layout.title.x);

    await page.evaluate(() => { proj().style.layout.title.x = 99; save(); flushSave(); renderEditor(); });
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => proj().style.layout.title.x), 99, '変更が反映される');

    const undoEnabled = await page.evaluate(() => !document.getElementById('btnUndo').disabled);
    t.ok(undoEnabled, '変更後は「戻す」ボタンが有効になる');

    await page.click('#btnUndo');
    await page.waitForTimeout(200);
    const afterUndo = await page.evaluate(() => proj().style.layout.title.x);
    t.eq(afterUndo, originalX, 'Undoで変更前の値に戻る');

    const redoEnabled = await page.evaluate(() => !document.getElementById('btnRedo').disabled);
    t.ok(redoEnabled, 'Undo後は「やり直す」ボタンが有効になる');

    await page.click('#btnRedo');
    await page.waitForTimeout(200);
    const afterRedo = await page.evaluate(() => proj().style.layout.title.x);
    t.eq(afterRedo, 99, 'Redoで変更後の値に戻る');

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
