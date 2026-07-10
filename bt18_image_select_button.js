// bt18【新機能】「プレビューで画像を選択」ボタンと、選択中は文字項目の上でもホイール拡縮できること
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt18 画像選択ボタンとホイール拡縮の適用範囲');
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

    // 画像未登録では選択ボタンが無効
    t.ok(await page.evaluate(() => document.getElementById('btnImgSelect').disabled), '画像未登録時は「プレビューで画像を選択」ボタンが無効');

    await page.click('#btnImgImport');
    await page.setInputFiles('#layoutImageInput', FIXTURE);
    await page.waitForTimeout(300);

    t.ok(!(await page.evaluate(() => document.getElementById('btnImgSelect').disabled)), '画像登録後はボタンが有効になる');

    // 画像・背景の個別上書きをONにする（既定ではロックされているため）
    await page.click('#imgOvToggle');
    await page.waitForTimeout(200);

    // ボタンで選択
    await page.click('#btnImgSelect');
    await page.waitForTimeout(200);
    const selectedAfterBtn = await page.evaluate(() => imgSel === true);
    t.ok(selectedAfterBtn, 'ボタンクリックで画像が選択状態になる');
    const handleVisible = await page.locator('#editHolder .img-handle').isVisible().catch(() => false);
    t.ok(handleVisible, '選択すると拡縮ハンドルが表示される');
    const hintVisible = await page.locator('#imgHintSelected').isVisible();
    t.ok(hintVisible, '選択中のヒント文言が表示される');

    // 文字項目（title）の真上でホイールしても、選択中なら画像の拡縮率が変わる
    const scaleBefore = await page.evaluate(() => curStyleRead().imgScale);
    const titleBox = await page.locator('#editHolder [data-item="title"]').boundingBox();
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    const scaleAfter = await page.evaluate(() => curStyleRead().imgScale);
    t.ok(scaleAfter > scaleBefore, '画像選択中は文字項目の上でホイール操作しても画像が拡大される');

    // 他の項目をクリックすると選択解除される
    await page.click('#editHolder [data-item="title"]');
    await page.waitForTimeout(200);
    const deselected = await page.evaluate(() => imgSel === false);
    t.ok(deselected, '別の項目をクリックすると画像の選択が解除される');
    const hintHiddenAfter = await page.locator('#imgHintSelected').isVisible();
    t.eq(hintHiddenAfter, false, '選択解除後はヒント文言が消える');

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
