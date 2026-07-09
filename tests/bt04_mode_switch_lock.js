// bt04: マスター編集/個別編集モードの切替と体裁ロック
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt04 モード切替とロック');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // 個別編集へ
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    t.ok(await page.locator('#emodeOne').evaluate(el => el.classList.contains('on')), '個別編集モードON');
    t.eq(await page.locator('#tab-layout').evaluate(el => el.classList.contains('one-mode')), true, '個別編集で体裁ロックが掛かる');
    t.ok(await page.locator('#previewWorkSelect').isVisible(), '個別編集で作品選択プルダウンが表示される');

    // 上書きONでロック解除
    await page.click('#ovToggle');
    await page.waitForTimeout(200);
    t.eq(await page.locator('#tab-layout').evaluate(el => el.classList.contains('one-mode')), false, '配置上書きONで体裁ロックが解除される');

    // 上書きOFFに戻すとロック再度
    await page.click('#ovToggle');
    await page.waitForTimeout(200);
    t.eq(await page.locator('#tab-layout').evaluate(el => el.classList.contains('one-mode')), true, '配置上書きOFFでロックが再度掛かる');

    // マスターへ戻る
    await page.click('#emodeMaster');
    await page.waitForTimeout(200);
    t.ok(await page.locator('#emodeMaster').evaluate(el => el.classList.contains('on')), 'マスター編集モードに復帰');
    t.ok(!(await page.locator('#previewWorkSelect').isVisible()), 'マスターモードで作品選択プルダウンが非表示');

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
