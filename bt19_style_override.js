// bt19【新機能】画像・背景の作品ごとの上書き（この作品だけ画像・背景を上書きする）
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt19 画像・背景の個別上書き');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 2) {
        const w = JSON.parse(JSON.stringify(p.works[0]));
        w.title = w.title + '_copy';
        p.works.push(w);
      }
    });

    await page.click('#emodeOne');
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);

    // 既定では画像・背景の設定はロックされている
    t.eq(await page.locator('#tab-layout').evaluate(el => el.classList.contains('style-one-mode')), true, '既定（上書きOFF）では画像・背景の設定がロックされる');

    // 上書きONにするとロックが外れ、styleOverrideが作られる
    await page.click('#imgOvToggle');
    await page.waitForTimeout(200);
    t.eq(await page.locator('#tab-layout').evaluate(el => el.classList.contains('style-one-mode')), false, '上書きONでロックが解除される');
    t.ok(await page.evaluate(() => !!proj().works[0].styleOverride), '上書きONでstyleOverrideが作成される');

    // マスターの背景を変更しても、上書き中の作品には影響しない
    await page.click('#emodeMaster');
    await page.waitForTimeout(200);
    await page.evaluate(() => { proj().style.bg = 'sumi'; save(); renderEditor(); });
    await page.waitForTimeout(200);

    await page.click('#emodeOne');
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);
    const w0Bg = await page.evaluate(() => curStyleRead().bg);
    t.ok(w0Bg !== 'sumi', '上書き中の作品はマスターの背景変更の影響を受けない');

    // 上書きしていない作品2はマスターの変更に追従する
    await page.evaluate(() => { previewIndex = 1; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);
    const w1Bg = await page.evaluate(() => curStyleRead().bg);
    t.eq(w1Bg, 'sumi', '上書きしていない作品はマスターの背景変更に追従する');

    // 上書き解除でマスターに戻る
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);
    const resetVisible = await page.locator('#imgOvReset').isVisible();
    t.ok(resetVisible, '上書きのある作品では「画像・背景の上書きを解除」ボタンが表示される');
    await page.click('#imgOvReset');
    await page.waitForTimeout(200);
    const confirmVisible = await page.locator('#confirmDialog').isVisible().catch(() => false);
    if (confirmVisible) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    const hasOvAfterReset = await page.evaluate(() => !!proj().works[0].styleOverride);
    t.eq(hasOvAfterReset, false, '解除後はstyleOverrideが削除される');
    const w0BgAfterReset = await page.evaluate(() => curStyleRead().bg);
    t.eq(w0BgAfterReset, 'sumi', '解除後はマスターの背景がそのまま反映される');

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
