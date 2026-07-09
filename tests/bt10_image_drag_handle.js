// bt10: 画像のドラッグハンドルによる拡大縮小・位置移動
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt10 画像ハンドルのドラッグ操作');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForTimeout(300);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(200);
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    await page.click('#btnImgImport');
    await page.setInputFiles('#layoutImageInput', FIXTURE);
    await page.waitForTimeout(300);

    // 自由配置に切り替えて画像を選択 → ハンドルが表示される
    await page.evaluate(() => { proj().style.imgFit = 'custom'; save(); renderEditor(); });
    await page.waitForTimeout(200);
    const imgBox = await page.locator('#editHolder .cap-img').boundingBox();
    await page.mouse.click(imgBox.x + imgBox.width - 5, imgBox.y + imgBox.height - 5);
    await page.waitForTimeout(200);
    const handleVisible = await page.locator('#editHolder .img-handle').isVisible().catch(() => false);
    t.ok(handleVisible, '自由配置で画像をクリックすると拡縮ハンドルが表示される');

    // ハンドルをドラッグして拡大
    const scaleBefore = await page.evaluate(() => proj().style.imgScale);
    const hbox = await page.locator('#editHolder .img-handle').boundingBox();
    await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hbox.x + hbox.width / 2 + 40, hbox.y + hbox.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const scaleAfter = await page.evaluate(() => proj().style.imgScale);
    t.ok(scaleAfter > scaleBefore, 'ハンドルを右にドラッグすると拡大率が増える');

    // 画像本体をドラッグして位置移動
    const offXBefore = await page.evaluate(() => proj().style.imgOffX || 0);
    const box2 = await page.locator('#editHolder .cap-img').boundingBox();
    await page.mouse.move(box2.x + box2.width - 20, box2.y + box2.height - 20);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width - 40, box2.y + box2.height - 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const offXAfter = await page.evaluate(() => proj().style.imgOffX || 0);
    t.ok(offXAfter !== offXBefore, '画像本体をドラッグすると位置（imgOffX）が変わる');

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
