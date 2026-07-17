// bt31【新機能】編集ダイアログ（作品の編集など）をタイトルバーのドラッグで移動できる
const path = require('path');
const { mkRunner, chromium } = require('./helpers');

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

    // ---- 「作品の編集」ダイアログをドラッグで移動できる ----
    await page.click('button[data-edit="0"]');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => document.getElementById('workDialog').getBoundingClientRect());
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
