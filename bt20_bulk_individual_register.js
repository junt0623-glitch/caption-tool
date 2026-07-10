// bt20【新機能】台帳で複数選択して画像を個別登録（大きさ・位置・透明度・背景も上書き）
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt20 複数選択での個別登録（画像・背景の上書き）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);
    page.on('dialog', d => d.accept()); // askConfirm/alertは独自dialogなので影響しないが念のため

    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 3) {
        const w = JSON.parse(JSON.stringify(p.works[0]));
        w.title = w.title + '_copy' + p.works.length;
        p.works.push(w);
      }
      renderList();
    });
    await page.waitForTimeout(200);

    // 先にマスターの画像設定を変えておく（個別登録がこれをコピーして独立するか確認するため）
    await page.evaluate(() => { proj().style.imgScale = 150; proj().style.imgFit = 'custom'; save(); });

    // 作品0と1だけ選択
    await page.evaluate(() => { bulkSel.clear(); bulkSel.add(0); bulkSel.add(1); renderList(); });
    await page.waitForTimeout(200);

    await page.click('#bulkSetImageOv');
    await page.waitForTimeout(200);
    const confirmVisible = await page.locator('#confirmDialog').isVisible().catch(() => false);
    if (confirmVisible) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    await page.setInputFiles('#bulkImageInputOv', FIXTURE);
    await page.waitForTimeout(400);

    const w0 = await page.evaluate(() => ({ image: !!proj().works[0].image, ov: proj().works[0].styleOverride }));
    const w1 = await page.evaluate(() => ({ image: !!proj().works[1].image, ov: proj().works[1].styleOverride }));
    const w2 = await page.evaluate(() => ({ image: !!proj().works[2].image, ov: proj().works[2].styleOverride }));

    t.ok(w0.image && w0.ov, '選択した作品0に画像とstyleOverrideが登録される');
    t.ok(w1.image && w1.ov, '選択した作品1に画像とstyleOverrideが登録される');
    t.ok(!w2.image && !w2.ov, '選択していない作品2には影響しない');

    t.eq(w0.ov.imgScale, 150, '個別登録時、マスターの現在値（imgScale）が上書きの初期値としてコピーされる');
    t.eq(w0.ov.imgFit, 'custom', '個別登録時、マスターの現在値（imgFit）が上書きの初期値としてコピーされる');

    // 個別登録後、マスターの値を変えても、登録済み作品には影響しない
    await page.evaluate(() => { proj().style.imgScale = 50; save(); });
    await page.waitForTimeout(100);
    const w0ScaleAfterMasterChange = await page.evaluate(() => proj().works[0].styleOverride.imgScale);
    t.eq(w0ScaleAfterMasterChange, 150, '個別登録後はマスターの変更の影響を受けない');

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
