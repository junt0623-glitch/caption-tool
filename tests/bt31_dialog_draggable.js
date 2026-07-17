// bt31【新機能】編集ダイアログ（作品の編集など）をタイトルバーのドラッグで移動できる
const path = require('path');
const { mkRunner, chromium } = require('./helpers');
const { devices } = require('playwright');

async function run() {
  const t = mkRunner('bt31 ダイアログのドラッグ移動');
  const browser = await chromium.launch({});
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForTimeout(300);

    // ---- ダイアログは画面中央に表示される（*{margin:0}のリセットに負けず中央寄せされること） ----
    await page.click('button[data-edit="0"]');
    await page.waitForTimeout(200);
    const centered = await page.evaluate(() => document.getElementById('workDialog').getBoundingClientRect());
    t.ok(Math.abs(centered.left - (1400 - centered.width) / 2) < 2,
      `ダイアログは横方向中央に表示される（left=${centered.left}, 期待≈${(1400 - centered.width) / 2}）`);
    t.ok(Math.abs(centered.top - (1000 - centered.height) / 2) < 2,
      `ダイアログは縦方向中央に表示される（top=${centered.top}, 期待≈${(1000 - centered.height) / 2}）`);

    // ---- 「作品の編集」ダイアログをドラッグで移動できる ----
    const before = centered;
    const head = page.locator('#workDialog .dlg-head');
    const hbox = await head.boundingBox();
    await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + 10);
    await page.mouse.down();
    await page.mouse.move(hbox.x + hbox.width / 2 + 120, hbox.y + 10 + 80, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => document.getElementById('workDialog').getBoundingClientRect());
    t.ok(Math.abs(after.left - before.left - 120) < 3 && Math.abs(after.top - before.top - 80) < 3,
      `ヘッダーをドラッグした分だけダイアログが移動する（移動量: ${after.left - before.left}, ${after.top - before.top}）`);

    // ---- 閉じるボタンはドラッグ扱いされず、通常どおり閉じる ----
    await page.click('#workDialog button[data-close="workDialog"]');
    await page.waitForTimeout(200);
    const openAfterClose = await page.evaluate(() => document.getElementById('workDialog').open);
    t.eq(openAfterClose, false, 'ヘッダー内の「✕ 閉じる」ボタンは通常どおり動作する（ドラッグと誤認しない）');

    // ---- 閉じて再度開くと中央（移動前の位置）に戻る ----
    await page.click('button[data-edit="0"]');
    await page.waitForTimeout(200);
    const reopened = await page.evaluate(() => document.getElementById('workDialog').getBoundingClientRect());
    t.ok(Math.abs(reopened.left - before.left) < 3 && Math.abs(reopened.top - before.top) < 3,
      '閉じて再度開くと元の（中央の）位置に戻る');
    await page.click('#workDialog button[data-close="workDialog"]');
    await page.waitForTimeout(200);

    // ---- 別のダイアログ（スプレッドシート取り込み）も同様にドラッグできる ----
    await page.click('#btnOpenImport');
    await page.waitForTimeout(200);
    const before2 = await page.evaluate(() => document.getElementById('importDialog').getBoundingClientRect());
    const head2 = page.locator('#importDialog .dlg-head');
    const hbox2 = await head2.boundingBox();
    await page.mouse.move(hbox2.x + hbox2.width / 2, hbox2.y + 10);
    await page.mouse.down();
    await page.mouse.move(hbox2.x + hbox2.width / 2 - 60, hbox2.y + 10 + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after2 = await page.evaluate(() => document.getElementById('importDialog').getBoundingClientRect());
    t.ok(Math.abs(after2.left - before2.left + 60) < 3 && Math.abs(after2.top - before2.top - 40) < 3,
      '他のダイアログ（スプレッドシート取り込み）も同じ仕組みでドラッグできる');
    await page.click('#importDialog button[data-close="importDialog"]');
    await page.waitForTimeout(150);

    t.noErrors(errors);
    await context.close(); // タッチ用の別コンテキストへ移る前に、このコンテキストのエラー集計を確定
    const r1 = t.finish();
    await browser.close();

    // ---- タッチ操作（iPad等）でもドラッグが最後まで通ること ----
    // touch-action指定が無いと、ブラウザがスクロール操作と誤認して数px動いた直後に
    // ドラッグが中断され「ドラッグしても動かない」ように見える不具合があったための回帰テスト
    const t2 = mkRunner('bt31b タッチでのダイアログドラッグ');
    const browser2 = await chromium.launch({});
    try {
      const tctx = await browser2.newContext({ ...devices['iPad Pro 11'], hasTouch: true });
      const tpage = await tctx.newPage();
      const tErrors = [];
      tpage.on('pageerror', e => tErrors.push('pageerror: ' + e.message));
      const cdp = await tctx.newCDPSession(tpage);
      await tpage.goto('file://' + path.join(__dirname, '..', 'index.html'));
      await tpage.waitForTimeout(300);
      await tpage.click('button[data-edit="0"]');
      await tpage.waitForTimeout(300);
      const tBefore = await tpage.evaluate(() => document.getElementById('workDialog').getBoundingClientRect());
      const tHbox = await tpage.locator('#workDialog .dlg-head').boundingBox();
      const sx = tHbox.x + tHbox.width / 2, sy = tHbox.y + 10;
      async function touchPoint(type, x, y) {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      }
      await touchPoint('touchStart', sx, sy);
      for (let i = 1; i <= 8; i++) { await touchPoint('touchMove', sx + i * 15, sy + i * 10); await tpage.waitForTimeout(15); }
      await touchPoint('touchEnd', sx + 8 * 15, sy + 8 * 10);
      await tpage.waitForTimeout(200);
      const tAfter = await tpage.evaluate(() => document.getElementById('workDialog').getBoundingClientRect());
      t2.ok(Math.abs(tAfter.left - tBefore.left - 120) < 5 && Math.abs(tAfter.top - tBefore.top - 80) < 5,
        `タッチでのドラッグが最後まで（8ステップ分）反映される（移動量: ${tAfter.left - tBefore.left}, ${tAfter.top - tBefore.top}）`);
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
    const t = mkRunner('bt31 ダイアログのドラッグ移動');
    t.ok(false, '例外: ' + e.message);
    return t.finish();
  }
}
module.exports = { run };
if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
