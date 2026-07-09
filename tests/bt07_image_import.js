// bt07: 画像取り込み（個別／マスター一括）と削除
const path = require('path');
const { openApp, mkRunner, chromium, autoAccept } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt07 画像取り込み');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    async function confirmIfShown() {
      await page.waitForTimeout(150);
      const visible = await page.locator('#confirmDialog').isVisible().catch(() => false);
      if (visible) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    }

    // 作品を2件以上確保
    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 2) {
        const w = JSON.parse(JSON.stringify(p.works[0]));
        w.title = w.title + '_copy';
        p.works.push(w);
      }
    });

    // --- 個別モードでの画像登録 ---
    await page.click('#emodeOne');
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);
    await page.click('#btnImgImport');
    await page.setInputFiles('#layoutImageInput', FIXTURE);
    await page.waitForTimeout(300);
    const w0hasImg = await page.evaluate(() => !!proj().works[0].image);
    const w1hasImg = await page.evaluate(() => !!proj().works[1].image);
    t.eq(w0hasImg, true, '個別モードで登録した作品には画像が付く');
    t.eq(w1hasImg, false, '個別モードでの登録は他の作品に影響しない');

    // --- 個別モードでの画像削除 ---
    await page.click('#btnImgRemoveLayout');
    await page.waitForTimeout(200);
    const w0hasImgAfterRemove = await page.evaluate(() => !!proj().works[0].image);
    t.eq(w0hasImgAfterRemove, false, '個別モードで画像を外せる');

    // --- マスターモードでの一括登録 ---
    await page.click('#emodeMaster');
    await page.waitForTimeout(200);
    await page.click('#btnImgImport');
    await page.setInputFiles('#layoutImageInput', FIXTURE);
    await confirmIfShown();
    await page.waitForTimeout(300);
    const allHaveImg = await page.evaluate(() => proj().works.every(w => !!w.image));
    t.eq(allHaveImg, true, 'マスターモードでの取り込みは全作品に一括登録される');

    // --- マスターモードでの一括削除 ---
    await page.click('#btnImgRemoveLayout');
    await confirmIfShown();
    await page.waitForTimeout(300);
    const noneHaveImg = await page.evaluate(() => proj().works.every(w => !w.image));
    t.eq(noneHaveImg, true, 'マスターモードでの「画像を外す」は全作品から一括で外れる');

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
