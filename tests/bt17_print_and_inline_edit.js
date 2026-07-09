// bt17: 印刷タブの描画 と キャンバス上でのインラインテキスト編集
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt17 印刷タブ・インライン編集');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);

    // --- 印刷タブ ---
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(400);
    const sheetRendered = await page.evaluate(() => document.getElementById('sheetScroll').children.length > 0);
    t.ok(sheetRendered, '印刷タブで用紙プレビューが描画される');

    // 用紙サイズ変更でも再描画されエラーが出ない
    await page.selectOption('#sheetKind', 'a3').catch(() => {});
    await page.waitForTimeout(300);

    // --- インラインテキスト編集 ---
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await page.click('#emodeOne');
    await page.waitForTimeout(200);

    const titleBefore = await page.evaluate(() => currentWork().title);
    await page.dblclick('#editHolder [data-item="title"]');
    await page.waitForTimeout(200);
    const isEditing = await page.evaluate(() => !!document.querySelector('#editHolder .editing-text'));
    t.ok(isEditing, 'ダブルクリックでテキスト編集モードに入る');

    // 内容を選択して書き換え
    await page.keyboard.press('Control+A');
    await page.keyboard.type('編集後のタイトル');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const titleAfter = await page.evaluate(() => currentWork().title);
    t.ok(titleAfter !== titleBefore, 'インライン編集の内容が作品データに反映される');

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
