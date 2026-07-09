// bt11【新機能】編集プレビューのズーム：実寸100%を既定に、拡大縮小・画面に収めるも可能
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt11 編集プレビューのズーム');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    t.eq(await page.textContent('#zoomLabel'), '100%', '初期表示は実寸100%');

    // 拡大
    await page.click('button[data-zoom="+"]');
    await page.waitForTimeout(150);
    const afterPlus = await page.textContent('#zoomLabel');
    t.ok(parseInt(afterPlus) > 100, '拡大＋ボタンで倍率が上がる');

    // 縮小で戻す
    await page.click('button[data-zoom="-"]');
    await page.waitForTimeout(150);
    const afterMinus = await page.textContent('#zoomLabel');
    t.ok(parseInt(afterMinus) < parseInt(afterPlus), '縮小－ボタンで倍率が下がる');

    // 実寸100%ボタンでリセット
    await page.click('#btnZoom100');
    await page.waitForTimeout(150);
    t.eq(await page.textContent('#zoomLabel'), '100%', '「実寸100%」ボタンで100%に戻る');

    // 画面に収めるボタン（何らかの倍率になる。100%と異なることを期待するのは環境依存のため、エラーが出ないことのみ確認）
    await page.click('#btnZoomFit');
    await page.waitForTimeout(150);
    const fitLabel = await page.textContent('#zoomLabel');
    t.ok(/^\d+%$/.test(fitLabel), '「画面に収める」ボタンでパーセント表示が更新される');

    // モード切替でズームが既定（100%）にリセットされる
    await page.click('#btnZoom100'); // 一旦100%に
    await page.click('button[data-zoom="+"]');
    await page.waitForTimeout(150);
    await page.click('[data-mode="desc"]');
    await page.waitForTimeout(200);
    await page.click('[data-mode="cap"]');
    await page.waitForTimeout(200);
    t.eq(await page.textContent('#zoomLabel'), '100%', 'モード切替（キャプション/解説）でズームは既定の100%に戻る');

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
