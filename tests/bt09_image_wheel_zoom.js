// bt09【新機能】プレビュー上での画像ホイール拡大縮小
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt09 画像のホイール拡縮');
  const browser = await chromium.launch({ });
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
    await page.waitForTimeout(400);

    const fitBefore = await page.evaluate(() => proj().style.imgFit);
    t.eq(fitBefore, 'contain', '既定の画像合わせ方は「全体を収める」');

    // 項目が無い余白部分にカーソルを合わせてホイールで拡大
    await page.locator('#editHolder .cap-img').scrollIntoViewIfNeeded();
    const box = await page.locator('#editHolder .cap-img').boundingBox();
    const x = box.x + box.width - 5, y = box.y + box.height - 5; // 右下の余白
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);

    const afterUp = await page.evaluate(() => ({ fit: proj().style.imgFit, scale: proj().style.imgScale }));
    t.eq(afterUp.fit, 'custom', '画像上でホイール操作すると自動的に「自由」配置へ切り替わる');
    t.ok(afterUp.scale > 100, 'ホイールを上に回すと拡大率が増える');

    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
    const afterDown = await page.evaluate(() => proj().style.imgScale);
    t.ok(afterDown < afterUp.scale, 'ホイールを下に回すと拡大率が減る');

    // クランプ（10〜300%）の確認
    await page.evaluate(() => { proj().style.imgScale = 298; renderEditor(); });
    await page.waitForTimeout(100);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(30); }
    const clampedHigh = await page.evaluate(() => proj().style.imgScale);
    t.ok(clampedHigh <= 300, '拡大率の上限は300%でクランプされる');

    // ラジオボタンのUIも追従して更新される
    const radioChecked = await page.evaluate(() => document.querySelector('input[name=imgFit][value=custom]').checked);
    t.eq(radioChecked, true, '「自由」ラジオボタンがUI上でもチェックされる');

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
