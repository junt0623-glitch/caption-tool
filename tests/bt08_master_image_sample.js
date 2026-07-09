// bt08【新機能】マスター編集モードで画像見本を表示する
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt08 マスターの画像見本プレビュー');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // 画像未登録の状態ではマスターに画像レイヤーが無い
    const noImgYet = await page.evaluate(() => !document.querySelector('#editHolder .cap-img'));
    t.ok(noImgYet, '画像未登録時、マスタープレビューに画像レイヤーが無い');

    // 個別モードで1作品に画像登録
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    await page.click('#btnImgImport');
    await page.setInputFiles('#layoutImageInput', FIXTURE);
    await page.waitForTimeout(300);

    // マスターへ戻ると見本画像が表示される
    await page.click('#emodeMaster');
    await page.waitForTimeout(300);
    const hasImgLayer = await page.evaluate(() => !!document.querySelector('#editHolder .cap-img'));
    t.eq(hasImgLayer, true, 'マスターに戻ると登録済み作品の画像が見本として表示される');

    const bgImage = await page.evaluate(() => document.querySelector('#editHolder .cap-img').style.backgroundImage);
    t.ok(bgImage && bgImage.includes('data:image'), '見本画像に実データが設定されている');

    // MASTER_DUMMY自体には画像が永続保存されない（表示専用の借用であること）
    const dummyNotPersisted = await page.evaluate(() => {
      const raw = localStorage.getItem('caption-koubou-v1');
      return raw && !raw.includes('MASTER_DUMMY');
    });
    t.ok(dummyNotPersisted, 'MASTER_DUMMYの見本画像はストレージに書き込まれる実体ではない');

    // ステータス文言が更新される
    const status = await page.textContent('#imgStatus');
    t.ok(status.includes('見本'), 'マスター編集中は見本表示である旨がステータスに出る');

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
