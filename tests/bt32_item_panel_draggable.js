// bt32【新機能】編集キャンバスの項目クリックで開く小パネル（#itemPanel）をヘッダーのドラッグで移動できる
const path = require('path');
const { mkRunner, chromium } = require('./helpers');
const { devices } = require('playwright');

async function openPanel(page) {
  await page.click('nav.tabs button[data-tab="layout"]');
  await page.waitForTimeout(300);
  await page.locator('#editHolder .cap-item').first().click();
  await page.waitForTimeout(300);
}

async function run() {
  const t = mkRunner('bt32 小パネルのドラッグ移動');
  const browser = await chromium.launch({});
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForTimeout(300);

    // ---- 項目クリックで小パネルが開く ----
    await openPanel(page);
    const shown = await page.evaluate(() => document.getElementById('itemPanel').classList.contains('show'));
    t.eq(shown, true, '項目をクリックすると書式の小パネルが開く');

    // ---- ヘッダー（h5）のドラッグで移動できる ----
    const before = await page.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop }; });
    const hbox = await page.locator('#itemPanel h5').boundingBox();
    await page.mouse.move(hbox.x + 40, hbox.y + hbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hbox.x + 40 - 200, hbox.y + hbox.height / 2 + 150, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop }; });
    t.ok(Math.abs((after.left - before.left) + 200) < 3 && Math.abs((after.top - before.top) - 150) < 3,
      `ヘッダーをドラッグした分だけ小パネルが移動する（移動量: ${after.left - before.left}, ${after.top - before.top}）`);

    // ---- 閉じるボタン（✕）はドラッグ扱いされず、通常どおり閉じる ----
    await page.click('#itemPanel #ipClose');
    await page.waitForTimeout(150);
    const closed = await page.evaluate(() => !document.getElementById('itemPanel').classList.contains('show'));
    t.eq(closed, true, 'ヘッダー内の「✕」ボタンは通常どおりパネルを閉じる（ドラッグと誤認しない）');

    // ---- 再度開くと既定位置（右上）に戻る ----
    await page.locator('#editHolder .cap-item').first().click();
    await page.waitForTimeout(300);
    const reopened = await page.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop, right: p.style.right }; });
    t.ok(Math.abs(reopened.left - before.left) < 3 && Math.abs(reopened.top - before.top) < 3,
      '閉じて再度開くと既定位置（右上）に戻る');

    // ---- ドラッグした位置は、書式を変えて再描画されても保たれる ----
    // パネルを動かしてからフォントサイズを変更（renderEditor→showPanelが走る）
    const hbox2 = await page.locator('#itemPanel h5').boundingBox();
    await page.mouse.move(hbox2.x + 40, hbox2.y + hbox2.height / 2);
    await page.mouse.down();
    await page.mouse.move(hbox2.x + 40 - 120, hbox2.y + hbox2.height / 2 + 90, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const moved = await page.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop }; });
    await page.fill('#ipSize', '20');
    await page.dispatchEvent('#ipSize', 'input');
    await page.waitForTimeout(200);
    const afterEdit = await page.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop }; });
    t.ok(Math.abs(afterEdit.left - moved.left) < 3 && Math.abs(afterEdit.top - moved.top) < 3,
      '書式変更で再描画されても、動かした位置は保たれる');

    t.noErrors(errors);
    await context.close();
    const r1 = t.finish();
    await browser.close();

    // ---- タッチ操作（iPad等）でもドラッグが最後まで通ること ----
    const t2 = mkRunner('bt32b タッチでの小パネルドラッグ');
    const browser2 = await chromium.launch({});
    try {
      const tctx = await browser2.newContext({ ...devices['iPad Pro 11'], hasTouch: true });
      const tpage = await tctx.newPage();
      const tErrors = [];
      tpage.on('pageerror', e => tErrors.push('pageerror: ' + e.message));
      const cdp = await tctx.newCDPSession(tpage);
      await tpage.goto('file://' + path.join(__dirname, '..', 'index.html'));
      await tpage.waitForTimeout(300);
      await openPanel(tpage);
      const tBefore = await tpage.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop }; });
      const tHbox = await tpage.locator('#itemPanel h5').boundingBox();
      const sx = tHbox.x + 40, sy = tHbox.y + tHbox.height / 2;
      async function tp(type, x, y) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }); }
      await tp('touchStart', sx, sy);
      for (let i = 1; i <= 8; i++) { await tp('touchMove', sx - i * 18, sy + i * 12); await tpage.waitForTimeout(15); }
      await tp('touchEnd', sx - 8 * 18, sy + 8 * 12);
      await tpage.waitForTimeout(200);
      const tAfter = await tpage.evaluate(() => { const p = document.getElementById('itemPanel'); return { left: p.offsetLeft, top: p.offsetTop }; });
      t2.ok(Math.abs((tAfter.left - tBefore.left) + 144) < 6 && Math.abs((tAfter.top - tBefore.top) - 96) < 6,
        `タッチでのドラッグが最後まで反映される（移動量: ${tAfter.left - tBefore.left}, ${tAfter.top - tBefore.top}）`);
      t2.noErrors(tErrors);
    } catch (e) {
      console.log('  ✗ EXCEPTION: ' + e.message);
      t2.ok(false, '例外: ' + e.message);
    }
    const r2 = t2.finish();
    await browser2.close();
    return { title: r1.title, pass: r1.pass + r2.pass, fail: r1.fail + r2.fail, failMessages: r1.failMessages.concat(r2.failMessages) };
  } catch (e) {
    console.log('  ✗ EXCEPTION: ' + e.message);
    await browser.close();
    const tf = mkRunner('bt32 小パネルのドラッグ移動');
    tf.ok(false, '例外: ' + e.message);
    return tf.finish();
  }
}
module.exports = { run };
if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
