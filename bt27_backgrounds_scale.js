// bt27【新機能】背景デザインの拡充（世界の美術様式6カテゴリ）と柄の大きさ（拡大縮小）スライダー
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt27 背景デザイン拡充・柄の大きさ');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 新カテゴリ6種がピッカーに表示される ----
    const pickerInfo = await page.evaluate(() => {
      const cats = [...document.querySelectorAll('#bgPicker .bg-cat')].map(c => c.textContent);
      const items = [...document.querySelectorAll('#bgPicker .bg-item')].map(i => i.dataset.bg);
      return { cats, itemCount: items.length, items };
    });
    ['東南アジア', '西アジア', 'ヨーロッパ', 'アメリカ', '中南米', 'アフリカ'].forEach(cat => {
      t.ok(pickerInfo.cats.includes(cat), `背景ピッカーに「${cat}」カテゴリが表示される`);
    });
    t.ok(pickerInfo.itemCount >= 50, `背景の総数が50種以上に拡充されている（実際: ${pickerInfo.itemCount}種）`);

    // ---- 新背景の代表を選択してカードに反映されるか ----
    const samples = ['batik', 'girih', 'meander', 'navajo', 'andes', 'mudcloth'];
    for (const bg of samples) {
      await page.evaluate((b) => { proj().style.bg = b; save(); renderEditor(); }, bg);
      await page.waitForTimeout(100);
      const applied = await page.evaluate((b) => {
        const card = document.querySelector('#editHolder .cap-card');
        return card.classList.contains('bg-' + b);
      }, bg);
      t.eq(applied, true, `新背景「${bg}」を選択するとカードにbg-${bg}クラスが適用される`);
    }

    // ---- 柄の大きさスライダー ----
    const scaleDefault = await page.evaluate(() => proj().style.bgScale);
    t.eq(scaleDefault, 100, '柄の大きさの既定値は100%');

    await page.evaluate(() => { proj().style.bg = 'meander'; save(); renderEditor(); });
    await page.waitForTimeout(100);

    await page.evaluate(() => { const el = document.getElementById('bgScale'); el.value = 50; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(150);
    const h50 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').height));
    await page.evaluate(() => { const el = document.getElementById('bgScale'); el.value = 200; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(150);
    const h200 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').height));
    t.ok(h200 > h50 * 3, `柄の大きさ50%→200%で帯の高さが実際に拡大される（${h50.toFixed(1)}px → ${h200.toFixed(1)}px）`);

    const savedScale = await page.evaluate(() => proj().style.bgScale);
    t.eq(savedScale, 200, '柄の大きさの値がstyle.bgScaleに保存される');

    // ---- 既存の中国陶磁パターンにも柄の大きさが効く ----
    await page.evaluate(() => { proj().style.bg = 'raimon'; proj().style.bgScale = 100; save(); renderEditor(); });
    await page.waitForTimeout(120);
    const r100 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').height));
    await page.evaluate(() => { proj().style.bgScale = 200; save(); renderEditor(); });
    await page.waitForTimeout(120);
    const r200 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').height));
    t.ok(r200 > r100 * 1.8, `既存の雷文帯にも柄の大きさが効く（${r100.toFixed(1)}px → ${r200.toFixed(1)}px）`);

    // ---- 印刷プレビューにも反映される ----
    await page.evaluate(() => { proj().style.bg = 'kente'; proj().style.bgScale = 150; save(); renderEditor(); });
    await page.waitForTimeout(120);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    const printInfo = await page.evaluate(() => {
      const c = document.querySelector('#sheetScroll .cap-card');
      return c ? { hasClass: c.classList.contains('bg-kente'), scaleVar: c.style.getPropertyValue('--bg-scale') } : null;
    });
    t.ok(printInfo && printInfo.hasClass, '印刷プレビューにも新背景が反映される');
    t.eq(printInfo && printInfo.scaleVar, '1.5', '印刷プレビューにも柄の大きさ（--bg-scale）が反映される');

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
