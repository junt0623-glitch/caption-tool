// bt42【新機能】建築テーマの背景デザイン3案（中国古代・漢の木造高層建築／灰陶・緑釉）
const { openApp, mkRunner, chromium } = require('./helpers');

const ARCH = ['tokyou', 'rokaku', 'renji'];

async function run() {
  const t = mkRunner('bt42 建築テーマの背景');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- カテゴリと初期3案が登録されている（案の追加は bt43 で検証） ----
    const reg = await page.evaluate(() => ({
      cat: BG_CATS.find(c => c.id === 'arch'),
      items: BACKGROUNDS.filter(b => b.cat === 'arch').map(b => ({ id: b.id, label: b.label })),
      fills: ['tokyou', 'rokaku', 'renji'].map(id => PRESET_FILL[id])
    }));
    t.ok(reg.cat && reg.cat.label.includes('建築'), '「建築」カテゴリが追加される');
    t.ok(reg.items.length >= 3, `建築テーマのデザインが3案以上ある（実際: ${reg.items.length}案）`);
    t.ok(ARCH.every(id => reg.items.some(i => i.id === id)), '斗栱帯・重層楼閣・連子窓の3案が残っている');
    t.ok(reg.items.some(i => i.label.includes('斗栱')), '斗栱（組物）の案がある');
    t.ok(reg.items.some(i => i.label.includes('楼閣')), '重層楼閣（陶楼）の案がある');
    t.ok(reg.items.some(i => i.label.includes('連子窓')), '連子窓の案がある');
    t.ok(reg.fills.every(f => Array.isArray(f) && f.length === 3), '3案とも地色（PRESET_FILL）が定義される');

    // ---- 地色が灰陶グレー／緑釉グリーンの系統 ----
    const tone = await page.evaluate(() => {
      const g = PRESET_FILL.tokyou, r = PRESET_FILL.rokaku, j = PRESET_FILL.renji;
      return {
        // 灰陶：R≈G≈Bの無彩色寄り
        grayNeutral: Math.max(...g) - Math.min(...g) <= 12,
        // 緑釉：緑が最も強い
        rokakuGreen: r[1] >= r[0] && r[1] > r[2],
        renjiGreen: j[1] >= j[0] && j[1] > j[2]
      };
    });
    t.eq(tone.grayNeutral, true, '斗栱帯の地色は灰陶（無彩色寄りのグレー）');
    t.eq(tone.rokakuGreen && tone.renjiGreen, true, '楼閣・連子窓の地色は緑釉（緑みを帯びる）');

    // ---- 背景ピッカーに3案が並び、選択できる ----
    const picker = await page.evaluate(() => [...document.querySelectorAll('#bgPicker .bg-item')].map(e => e.dataset.bg));
    ARCH.forEach(id => t.ok(picker.includes(id), `背景ピッカーに ${id} が並ぶ`));

    // ---- 各案を適用するとカードに反映され、模様（疑似要素）が描画される ----
    for (const id of ARCH) {
      const r = await page.evaluate((bg) => {
        curStyle().bg = bg; save(); renderEditor();
        const card = document.querySelector('#editHolder .cap-card');
        const before = getComputedStyle(card, '::before').backgroundImage;
        const after = getComputedStyle(card, '::after').backgroundImage;
        return {
          hasClass: card.classList.contains('bg-' + bg),
          bgColor: getComputedStyle(card).backgroundColor,
          drawn: (before !== 'none') || (after !== 'none')
        };
      }, id);
      t.eq(r.hasClass, true, `${id}：カードに背景クラスが付く`);
      t.eq(r.drawn, true, `${id}：模様（疑似要素）が描画される`);
      t.ok(/^rgba?\(/.test(r.bgColor), `${id}：地色が適用される`);
    }

    // ---- 柄の大きさ（--bg-scale）と濃さ（--bg-opacity）に追随する ----
    const scaled = await page.evaluate(() => {
      curStyle().bg = 'tokyou'; curStyle().bgScale = 200; curStyle().bgOpacity = 0.5; save(); renderEditor();
      const card = document.querySelector('#editHolder .cap-card');
      return {
        scale: card.style.getPropertyValue('--bg-scale'),
        h: getComputedStyle(card, '::before').height,
        op: getComputedStyle(card, '::before').opacity
      };
    });
    t.eq(scaled.scale, '2', '柄の大きさ（--bg-scale）が反映される');
    t.ok(parseFloat(scaled.h) > 60, `柄の大きさに応じて帯が拡大する（${scaled.h}）`);
    t.eq(scaled.op, '0.5', '柄の濃さ（--bg-opacity）が反映される');

    // ---- 印刷にも反映される ----
    await page.evaluate(() => { curStyle().bgScale = 100; curStyle().bgOpacity = 1; curStyle().bg = 'renji'; save(); });
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(400);
    const printed = await page.evaluate(() => {
      const c = document.querySelector('#sheetScroll .cap-card');
      return c ? c.classList.contains('bg-renji') : false;
    });
    t.eq(printed, true, '選んだ建築デザインが印刷シートにも反映される');

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
