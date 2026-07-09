// bt01: 起動と既定値の確認
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt01 起動と既定値');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);

    t.ok(await page.locator('header').isVisible(), 'ヘッダーが表示される');
    t.eq(await page.locator('nav.tabs button.active').getAttribute('data-tab'), 'daicho', '起動直後は作品台帳タブが既定でアクティブ');

    const projectName = await page.locator('#projectSelect').inputValue();
    t.ok(!!projectName, 'サンプル展覧会が既定で読み込まれている');

    // レイアウトタブへ
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);

    t.ok(await page.locator('#emodeMaster').evaluate(el => el.classList.contains('on')), '既定でマスター編集モードがON');
    t.ok(!(await page.locator('#emodeOne').evaluate(el => el.classList.contains('on'))), '既定で個別編集モードはOFF');
    t.eq(await page.locator('#tab-layout').evaluate(el => el.classList.contains('one-mode')), false, '既定では体裁ロックが掛かっていない');

    // ズーム既定値100%
    t.eq(await page.textContent('#zoomLabel'), '100%', '編集プレビューの既定倍率は実寸100%');

    // 《》既定OFF（新規プロジェクトの既定値）
    t.eq(await page.isChecked('#stBracket'), false, '作品名の《》は既定でOFF');

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
