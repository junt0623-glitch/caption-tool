// bt22【新機能・第2段階】縦書きモード：リサイズハンドルと項目パネルの軸入れ替え
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt22 縦書きモード（第2段階：リサイズ・パネル）');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForTimeout(300);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await page.click('#stVertical');
    await page.waitForTimeout(300);

    // 和文項目（title）を選択：ラベルが「行の長さ（高さ）」「段の広さ（幅）」に変わる
    await page.evaluate(() => {
      curLayout().title.x = 5; curLayout().title.y = 5; curLayout().title.w = 40; curLayout().title.h = null;
      sel.clear(); sel.add('title'); updateSelUI(); showPanel(); renderEditor();
    });
    await page.waitForTimeout(200);
    const labelsJp = await page.evaluate(() => ({
      w: document.getElementById('ipWLabel').textContent,
      h: document.getElementById('ipHLabel').textContent,
    }));
    t.eq(labelsJp.w, '行の長さ（高さ）', '縦書き和文項目選択時、幅ラベルが「行の長さ（高さ）」になる');
    t.eq(labelsJp.h, '段の広さ（幅）', '縦書き和文項目選択時、高さラベルが「段の広さ（幅）」になる');

    // 南ハンドル（縦書きでは「行の長さ」＝L.w を操作）
    await page.locator('#editHolder .resize-handle.h-s').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const beforeW = await page.evaluate(() => curLayoutRead().title.w);
    const sBox = await page.locator('#editHolder .resize-handle.h-s').boundingBox();
    await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterW = await page.evaluate(() => curLayoutRead().title.w);
    t.ok(afterW > beforeW, '縦書き項目：南ハンドルをドラッグするとL.w（行の長さ）が増える');

    // 東ハンドル（縦書きでは「段の広さ」＝L.h を操作）
    const beforeH = await page.evaluate(() => curLayoutRead().title.h);
    t.eq(beforeH, null, '東ハンドル操作前はL.h（段の広さ）が未設定（自動）');
    const eBox = await page.locator('#editHolder .resize-handle.h-e').boundingBox();
    await page.mouse.move(eBox.x + eBox.width / 2, eBox.y + eBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(eBox.x + eBox.width / 2 + 30, eBox.y + eBox.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterH = await page.evaluate(() => curLayoutRead().title.h);
    t.ok(afterH != null && afterH > 0, '縦書き項目：東ハンドルをドラッグするとL.h（段の広さ）に数値が入る');

    // CSSは height=L.w, width=L.h にマッピングされている
    const cssInfo = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      return { height: el.style.height, width: el.style.width };
    });
    t.ok(cssInfo.height.startsWith(String(Math.round(afterW * 10) / 10).split('.')[0]), 'CSSのheightがL.w（行の長さ）を反映している');

    // 英字項目は従来通り（幅＝東ハンドル、横書きのまま）
    await page.evaluate(() => {
      proj().style.show.titleEn = true;
      curLayout().titleEn.x = 5; curLayout().titleEn.y = 60; curLayout().titleEn.w = 40; curLayout().titleEn.h = null;
      sel.clear(); sel.add('titleEn'); updateSelUI(); showPanel(); renderEditor();
    });
    await page.waitForTimeout(200);
    const labelsEn = await page.evaluate(() => ({
      w: document.getElementById('ipWLabel').textContent,
      h: document.getElementById('ipHLabel').textContent,
    }));
    t.eq(labelsEn.w, '幅', '英字項目選択時はラベルが従来通り「幅」のまま');
    t.eq(labelsEn.h, '高さ', '英字項目選択時はラベルが従来通り「高さ」のまま');

    const enWmode = await page.evaluate(() => getComputedStyle(document.querySelector('#editHolder [data-item="titleEn"]')).writingMode);
    t.eq(enWmode, 'horizontal-tb', '英字項目は縦書きモードでも横書きのまま');

    // 整列バー：縦書き項目でも物理的な実測幅で正しく左右揃えできる
    await page.evaluate(() => {
      curLayout().title.x = 30; curLayout().title.y = 5; curLayout().title.w = 40; curLayout().title.h = 20;
      sel.clear(); sel.add('title'); updateSelUI(); showPanel(); renderEditor();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => doAlign('left'));
    await page.waitForTimeout(150);
    const xAfterLeft = await page.evaluate(() => curLayoutRead().title.x);
    t.eq(xAfterLeft, 0, '縦書き項目でも「左揃え」でx=0になる');

    await page.evaluate(() => doAlign('right'));
    await page.waitForTimeout(150);
    const rightInfo = await page.evaluate(() => {
      const size = curSize(); const L = curLayoutRead().title; const w = widthMM('title');
      return { sizeW: size.w, rightEdge: L.x + w };
    });
    t.ok(Math.abs(rightInfo.rightEdge - rightInfo.sizeW) < 1, '縦書き項目でも「右揃え」で実測幅を基準に右端がカード右端に揃う');

    // はみ出し判定：縦書き項目でも実測幅ベースで正しく検出される
    await page.evaluate(() => { curLayout().title.x = 200; renderEditor(); checkOverflow(); });
    await page.waitForTimeout(150);
    const overShown = await page.evaluate(() => document.getElementById('overflowWarn').classList.contains('show'));
    t.eq(overShown, true, '縦書き項目を大きくはみ出させると警告が表示される');

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
