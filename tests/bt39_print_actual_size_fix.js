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

    /* ---- 標準用紙でない寸法のときは、縮小されうることを先に知らせる ----
       同じ寸法の用紙がプリンター側に無いと、ブラウザが用紙に合わせて全体を縮小する。
       印刷ダイアログの倍率や余白では直らないので、設定した時点で案内を出す。 */
    const note = () => page.evaluate(() => {
      const el = document.getElementById('sheetPaperNote');
      return { shown: getComputedStyle(el).display !== 'none', text: el.textContent };
    });
    await page.selectOption('#sheetKind', 'a4');
    await page.waitForTimeout(300);
    t.eq((await note()).shown, false, 'A4のときは案内を出さない');

    await page.selectOption('#sheetKind', 'large');
    await page.waitForTimeout(300);
    let n = await note();
    t.eq(n.shown, true, '大型プリンターの寸法では案内を出す');
    t.ok(/1000×800mm/.test(n.text), '選んでいる寸法を示す');
    t.ok(/縮小/.test(n.text) && /倍率/.test(n.text),
      '倍率や余白では直らないことを伝える');
    t.ok(/PDF/.test(n.text), '回避策（PDFに書き出して刷る）も伝える');
    t.ok(/ロール紙/.test(n.text) && /幅/.test(n.text),
      'ロール紙のときは幅をロール紙の幅に合わせればよいことを伝える');

    await page.selectOption('#sheetKind', 'custom');
    await page.fill('#sheetCustomW', '600');
    await page.fill('#sheetCustomH', '200');
    await page.waitForTimeout(400);
    n = await note();
    t.eq(n.shown, true, 'カスタムサイズでも案内を出す');
    t.ok(/600×200mm/.test(n.text), '入力した寸法を示す');

    // 標準用紙と同じ寸法を入れたときは出さない（A3・横長A4）
    await page.fill('#sheetCustomW', '297');
    await page.fill('#sheetCustomH', '420');
    await page.waitForTimeout(400);
    t.eq((await note()).shown, false, 'A3と同じ寸法なら案内は出さない');
    await page.fill('#sheetCustomW', '297');
    await page.fill('#sheetCustomH', '210');
    await page.waitForTimeout(400);
    t.eq((await note()).shown, false, '横長A4と同じ寸法でも案内は出さない');

    /* ---- ロール紙：用紙の幅をロール紙の幅と同じにして等倍で出す ----
       プリンター側で「ロール紙の幅に合わせる」が働いても、同じ幅なら等倍のまま出る。 */
    await page.selectOption('#sheetKind', 'roll');
    await page.waitForTimeout(500);
    const roll = () => page.evaluate(() => {
      const s = document.querySelector('#sheetScroll .sheet');
      return {
        row: getComputedStyle(document.getElementById('rollSheetRow')).display !== 'none',
        note: getComputedStyle(document.getElementById('rollNote')).display !== 'none',
        warn: getComputedStyle(document.getElementById('sheetPaperNote')).display !== 'none',
        noteText: document.getElementById('rollNote').textContent,
        sheet: s ? s.style.width + ' x ' + s.style.height : null,
        page: pageSizeRule(sheetDims(proj().printOpt)),
        saved: { kind: proj().printOpt.sheetKind, w: proj().printOpt.rollW, h: proj().printOpt.rollH },
        otherW: getComputedStyle(document.getElementById('rollOtherW')).display !== 'none'
      };
    });
    let rl = await roll();
    t.eq(rl.row, true, 'ロール紙を選ぶと幅と長さの欄が出る');
    t.eq(rl.note, true, 'ロール紙のときは専用の案内を出す');
    t.eq(rl.warn, false, 'ロール紙のときは「縮小される」の警告は出さない（幅を合わせてあるため）');
    t.ok(/等倍/.test(rl.noteText) && /ロール紙の幅に合わせる/.test(rl.noteText),
      '幅を合わせてあるので等倍で出ることを伝える');
    t.eq(rl.saved.w, 610, 'はじめは24インチ（610mm）幅');
    t.eq(rl.sheet, '609.5mm x 199mm', '用紙はロール紙の幅いっぱい（端の安全余白ぶんだけ内側）');
    t.eq(rl.page, '@page{size:610mm 200mm;margin:0}', '@pageもロール紙の幅と長さで指定される');

    await page.selectOption('#rollWidth', '914');
    await page.waitForTimeout(500);
    rl = await roll();
    t.eq(rl.saved.w, 914, 'ロール紙の幅を選び直せる（36インチ）');
    t.eq(rl.sheet, '913.5mm x 199mm', '選んだ幅がそのまま用紙の幅になる');

    await page.fill('#rollH', '300');
    await page.waitForTimeout(500);
    rl = await roll();
    t.eq(rl.sheet, '913.5mm x 299mm', '1枚の長さを変えられる');

    await page.selectOption('#rollWidth', 'other');
    await page.fill('#rollCustomW', '500');
    await page.waitForTimeout(500);
    rl = await roll();
    t.eq(rl.otherW, true, '「その他」を選ぶと幅を直接入力できる');
    t.eq(rl.sheet, '499.5mm x 299mm', '入力した幅が用紙の幅になる');

    await page.reload();
    await page.waitForTimeout(500);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    rl = await roll();
    t.eq([rl.saved.kind, rl.saved.w, rl.saved.h], ['roll', 500, 300],
      '読み直してもロール紙の設定が残る');
    t.eq(rl.otherW, true, '一覧に無い幅なら、読み直しても入力欄を出したまま');

    await page.selectOption('#sheetKind', 'custom');
    await page.fill('#sheetCustomW', '600');
    await page.fill('#sheetCustomH', '200');
    await page.waitForTimeout(500);

    // 読み直しても、保存された寸法に合わせて案内が出る
    await page.fill('#sheetCustomW', '600');
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForTimeout(500);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(400);
    t.eq((await note()).shown, true, '読み直しても案内が出る');
    await page.selectOption('#sheetKind', 'a4');
    await page.waitForTimeout(300);

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
