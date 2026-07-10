// bt21【新機能・第1段階】縦書きモード：英字項目（作品名英訳など）は横書きのまま
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt21 縦書きモード（第1段階）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // 既定はOFF（横書き）
    t.eq(await page.isChecked('#stVertical'), false, '縦書きは既定でOFF');
    t.eq(await page.evaluate(() => !!document.querySelector('#editHolder .cap-card.vertical')), false, '既定では縦書きクラスが付かない');

    // ONにするとカード全体・和文項目が縦書きになる
    await page.click('#stVertical');
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const card = document.querySelector('#editHolder .cap-card');
      const title = document.querySelector('#editHolder [data-item="title"]');
      return {
        cardVertical: card.classList.contains('vertical'),
        cardWritingMode: getComputedStyle(card).writingMode,
        titleWritingMode: title ? getComputedStyle(title).writingMode : null,
      };
    });
    t.eq(info.cardVertical, true, 'ONにするとカードにverticalクラスが付く');
    t.eq(info.cardWritingMode, 'vertical-rl', 'カードのwriting-modeがvertical-rlになる');
    t.eq(info.titleWritingMode, 'vertical-rl', '作品名（和文）は縦書きになる');

    // 英字項目は横書きのまま
    await page.evaluate(() => { proj().style.show.titleEn = true; save(); renderEditor(); });
    await page.waitForTimeout(200);
    const enInfo = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="titleEn"]');
      return el ? { hasClass: el.classList.contains('cap-item-en'), writingMode: getComputedStyle(el).writingMode } : null;
    });
    t.ok(enInfo, '作品名（英訳）項目が存在する');
    if (enInfo) {
      t.eq(enInfo.hasClass, true, '英字項目にcap-item-enクラスが付く');
      t.eq(enInfo.writingMode, 'horizontal-tb', '英字項目は縦書きモードでも横書きのまま');
    }

    // 解説面にも反映される
    await page.click('[data-mode="desc"]');
    await page.waitForTimeout(300);
    const descVertical = await page.evaluate(() => !!document.querySelector('#editHolder .cap-card.vertical'));
    t.eq(descVertical, true, '解説面にも縦書きが反映される');
    await page.click('[data-mode="cap"]');
    await page.waitForTimeout(200);

    // 印刷プレビューにも反映される
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    const printVertical = await page.evaluate(() => {
      const c = document.querySelector('#sheetScroll .cap-card');
      return c ? c.classList.contains('vertical') : null;
    });
    t.eq(printVertical, true, '印刷プレビューにも縦書きが反映される');
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(200);

    // 個別編集モードでは変更できない（マスター専用の設定）
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    const lockedInOne = await page.evaluate(() => document.getElementById('tab-layout').classList.contains('one-mode'));
    t.eq(lockedInOne, true, '個別編集モードでは縦書き設定を含む体裁全体がロックされる（マスター専用）');
    await page.click('#emodeMaster');
    await page.waitForTimeout(200);

    // OFFに戻すと横書きに戻る
    await page.click('#stVertical');
    await page.waitForTimeout(300);
    const backToHorizontal = await page.evaluate(() => !document.querySelector('#editHolder .cap-card.vertical'));
    t.eq(backToHorizontal, true, 'OFFにすると横書きに戻る');

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
