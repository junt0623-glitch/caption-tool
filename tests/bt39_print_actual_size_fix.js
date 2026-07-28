// bt39【不具合修正】原寸印刷：ページ超過による自動縮小の防止・用紙名@page・原寸確認用の目盛り
// 縮小の主因：シート幅が用紙幅と完全に同値だと、小数丸めでわずかに超えた瞬間に
// ブラウザが「用紙に合わせる」判定でページ全体を縮小する。幅にも安全マージンを設けた。
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');

const MM = 96 / 25.4;

async function run() {
  const t = mkRunner('bt39 原寸印刷の修正');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'print' });
    await page.evaluate(() => { window.__pc = 0; window.print = () => { window.__pc++; }; });

    // ---- シートは用紙寸法を超えない（幅・高さとも安全マージンあり） ----
    const dims = await page.evaluate(() => {
      const px2mm = px => px / (96 / 25.4);
      const sheets = buildSheets();
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0';
      document.body.appendChild(host);
      sheets.forEach(s => { s.style.transform = ''; host.appendChild(s); });
      const sheet = host.querySelector('.sheet');
      const r = {
        w: +px2mm(sheet.getBoundingClientRect().width).toFixed(3),
        h: +px2mm(sheet.getBoundingClientRect().height).toFixed(3),
        paper: sheetDims(proj().printOpt)
      };
      host.remove();
      return r;
    });
    t.ok(dims.w < dims.paper.w, `シート幅(${dims.w}mm)が用紙幅(${dims.paper.w}mm)を超えない（超過すると全体が縮小される）`);
    t.ok(dims.h < dims.paper.h, `シート高さ(${dims.h}mm)が用紙高さ(${dims.paper.h}mm)を超えない`);
    t.ok(dims.paper.w - dims.w <= 1.0, '幅の安全マージンは1mm以内（無駄な余白を作らない）');
    t.ok(dims.w > 205, 'A4の実用幅は保たれている（過度に縮めない）');

    // ---- @pageは用紙名（A4等）を使う。プリンタの用紙選択と一致し縮小されにくい ----
    const rules = await page.evaluate(() => ({
      a4: pageSizeRule({ w: 210, h: 297 }),
      a3: pageSizeRule({ w: 297, h: 420 }),
      land: pageSizeRule({ w: 297, h: 210 }),
      large: pageSizeRule({ w: 1000, h: 800 })
    }));
    t.eq(rules.a4, '@page{size:A4 portrait;margin:0}', 'A4は用紙名で@page指定される');
    t.eq(rules.a3, '@page{size:A3 portrait;margin:0}', 'A3も用紙名で指定される');
    t.eq(rules.land, '@page{size:A4 landscape;margin:0}', '横長A4はlandscapeとして指定される');
    t.eq(rules.large, '@page{size:1000mm 800mm;margin:0}', '標準外サイズはmm実寸で指定される');

    // ---- 実際の印刷実行時にも用紙名の@pageが適用される ----
    await page.evaluate(() => doPrint());
    await page.waitForTimeout(200);
    const applied = await page.evaluate(() => document.getElementById('dynPageSize').textContent);
    t.eq(applied, '@page{size:A4 portrait;margin:0}', '印刷実行時の@pageが用紙名指定になる');

    // ---- 原寸確認用の目盛り：ちょうど100mm・10mm刻み ----
    await page.check('#prRuler');
    await page.waitForTimeout(300);
    const ruler = await page.evaluate(() => {
      const px2mm = px => px / (96 / 25.4);
      const sheets = buildSheets();
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0';
      document.body.appendChild(host);
      sheets.forEach(s => { s.style.transform = ''; host.appendChild(s); });
      const el = host.querySelector('.scale-ruler');
      const ticks = [...el.querySelectorAll('i')];
      const f = ticks[0].getBoundingClientRect(), l = ticks[ticks.length - 1].getBoundingClientRect();
      const r = {
        width: +px2mm(el.getBoundingClientRect().width).toFixed(2),
        span: +px2mm(l.left - f.left).toFixed(2),
        ticks: ticks.length,
        saved: proj().printOpt.ruler
      };
      host.remove();
      return r;
    });
    t.eq(ruler.width, 100, '目盛りの全長はちょうど100mm');
    t.eq(ruler.span, 100, '最初と最後の目盛り線の間隔もちょうど100mm');
    t.eq(ruler.ticks, 11, '10mm刻みの目盛り線が11本（0〜100mm）');
    t.eq(ruler.saved, true, '目盛りの設定が保存される');

    // ---- 目盛りOFFでは入らない ----
    await page.uncheck('#prRuler');
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => {
      const sheets = buildSheets();
      return sheets.some(s => s.querySelector('.scale-ruler'));
    });
    t.eq(off, false, '目盛りOFFのときは印刷物に入らない');

    // ---- 印刷CSSにページ超過を防ぐ指定がある ----
    const css = await page.evaluate(() => [...document.styleSheets]
      .flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
      .filter(r => r.type === CSSRule.MEDIA_RULE && r.conditionText.includes('print'))
      .flatMap(r => [...r.cssRules]).map(r => r.cssText).join(' '));
    t.ok(/html,\s*body/.test(css) && css.includes('width: auto'), '印刷時にhtml/bodyの幅を固定しない（ページ超過による縮小を防ぐ）');
    t.ok(css.includes('#print-root'), '印刷ルート要素の指定がある');

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
